"""Single-writer, recoverable SQLite/preset publication protocol.

The callback passed to run_operation may only change its uncommitted SQLite
transaction. Files and external side effects must be handled by their owners.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import uuid

from . import storage
from .preset_codec import canonical_payload, decode_preset, encode_preset


class PresetSyncError(RuntimeError):
    """The mutation needs recovery; its draft must not be blindly reapplied."""

    def __init__(self, message, *, operation_id=None, committed=False, revisions=None):
        super().__init__(message)
        self.operation_id = operation_id
        self.committed = committed
        self.revisions = revisions or {}


@dataclass
class PresetUpdate:
    metadata: dict
    configuration: dict
    context: dict
    rotate_old: bool = False


def ensure_schema(db):
    db.execute("""CREATE TABLE IF NOT EXISTS preset_sync_commits(
        operation_id TEXT PRIMARY KEY, journal_sha256 TEXT NOT NULL,
        committed_at TEXT NOT NULL)""")


def _checkpoint(phase):
    """Fault-injection seam: production intentionally does nothing."""


def _digest(content):
    return hashlib.sha256(content).hexdigest()


def _identifier(value):
    if (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value)
            or re.fullmatch(r"con|prn|aux|nul|com[1-9]|lpt[1-9]", value, re.I)):
        raise ValueError("Identificador de preset inválido.")
    return value


def _uuid(value):
    if not isinstance(value, str) or str(uuid.UUID(value)) != value:
        raise ValueError("Identificador de operação ou raiz inválido.")
    return value


def _ordinary(path, *, directory=False):
    try:
        attributes = path.lstat()
    except FileNotFoundError:
        return path
    if stat.S_ISLNK(attributes.st_mode) or getattr(attributes, "st_file_attributes", 0) & 0x400:
        raise ValueError("O armazenamento de presets não aceita redirecionamentos.")
    if not (stat.S_ISDIR(attributes.st_mode) if directory else stat.S_ISREG(attributes.st_mode)):
        raise ValueError("Tipo de arquivo de sincronização inválido.")
    return path


def _directories(directory=None):
    root = Path(directory) if directory is not None else storage.presets_directory()
    _ordinary(root, directory=True)
    root.mkdir(parents=True, exist_ok=True)
    sync = _ordinary(root / ".sync", directory=True)
    sync.mkdir(exist_ok=True)
    return root, sync


def _read(path):
    _ordinary(path)
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return None


def _write(path, content):
    _ordinary(path)
    created = False
    try:
        with path.open("xb") as stream:
            created = True
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        if created:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
        raise


def _json_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Propriedade duplicada no journal.")
        result[key] = value
    return result


def _validate_journal(journal, operation_id, root_id=None):
    keys = {"schemaVersion", "operationId", "rootId", "kind", "catalogWide", "affectedIds", "createdAt", "files"}
    if not isinstance(journal, dict) or set(journal) != keys or type(journal["schemaVersion"]) is not int or journal["schemaVersion"] != 1:
        raise ValueError("Versão ou estrutura de journal inválida.")
    if _uuid(journal["operationId"]) != operation_id:
        raise ValueError("Operação do journal divergente.")
    _uuid(journal["rootId"])
    if root_id is not None and journal["rootId"] != root_id:
        raise ValueError("Journal de outra raiz de dados.")
    if journal["kind"] not in {"config-save", "metadata", "batch", "backfill", "import", "restore"}:
        raise ValueError("Tipo de operação inválido.")
    ids = journal["affectedIds"]
    if (type(journal["catalogWide"]) is not bool or not isinstance(ids, list)
            or any(not isinstance(item, str) for item in ids) or ids != sorted(set(ids))):
        raise ValueError("IDs afetados inválidos.")
    for identifier in ids:
        _identifier(identifier)
    if not isinstance(journal["createdAt"], str):
        raise ValueError("Data do journal inválida.")
    datetime.fromisoformat(journal["createdAt"])
    if not isinstance(journal["files"], list):
        raise ValueError("Lista de arquivos inválida.")
    seen = set()
    for entry in journal["files"]:
        if not isinstance(entry, dict) or set(entry) != {"final", "before", "after"}:
            raise ValueError("Entrada do journal inválida.")
        final = entry["final"]
        if not isinstance(final, str):
            raise ValueError("Destino inválido.")
        match = re.fullmatch(r"([A-Za-z0-9_-]+)(\.OLD)?\.mockaize\.xml", final)
        if not match or match[1] not in ids or final.casefold() in seen:
            raise ValueError("Destino de preset inválido ou duplicado.")
        seen.add(final.casefold())
        role = "old" if match[2] else "current"
        for side in ("before", "after"):
            snapshot = entry[side]
            if not isinstance(snapshot, dict) or type(snapshot.get("exists")) is not bool:
                raise ValueError("Snapshot inválido.")
            if snapshot["exists"]:
                expected = f".{operation_id}.{match[1]}.{role}.{side}.tmp"
                if (set(snapshot) != {"exists", "staged", "sha256"} or snapshot["staged"] != expected
                        or not isinstance(snapshot["sha256"], str) or not re.fullmatch("[0-9a-f]{64}", snapshot["sha256"])):
                    raise ValueError("Caminho ou hash do snapshot inválido.")
            elif set(snapshot) != {"exists"}:
                raise ValueError("Snapshot ausente inválido.")
    return journal


def _load_journals(root, sync, root_id=None):
    journals = []
    for path in sorted(sync.iterdir()):
        if path.name.casefold().endswith(".pending.json.tmp"):
            _ordinary(path)
            continue  # Not published, so no database commit may depend on it.
        if not path.name.endswith(".pending.json"):
            raise ValueError(f"Arquivo desconhecido no diretório de sincronização: {path.name!r}.")
        operation_id = _uuid(path.name.removesuffix(".pending.json"))
        raw = _read(path)
        journal = json.loads(raw, object_pairs_hook=_json_pairs)
        _validate_journal(journal, operation_id, root_id)
        journals.append((path, raw, journal))
    return journals


def pending(directory, variation_id=None):
    """Read-only consumer check. Any pending blocks listing; batches block IDs."""
    root = Path(directory)
    try:
        _ordinary(root, directory=True)
        sync = _ordinary(root / ".sync", directory=True)
        if not sync.exists():
            return False
        journals = _load_journals(root, sync)
        return any(variation_id is None or journal["catalogWide"] or variation_id in journal["affectedIds"]
                   for _, _, journal in journals)
    except (OSError, ValueError, TypeError, KeyError, RecursionError) as exc:
        raise PresetSyncError("Não foi possível verificar a sincronização dos presets.") from exc


def _snapshot(root, operation_id, identifier, role, side, content):
    if content is None:
        return {"exists": False}
    basename = f".{operation_id}.{identifier}.{role}.{side}.tmp"
    _write(root / basename, content)
    return {"exists": True, "staged": basename, "sha256": _digest(content)}


def _prepare(root, sync, updates, kind, catalog_wide):
    operation_id = str(uuid.uuid4())
    root_id = storage._manifest_root_id()
    ids, seen_ids, files, staged = [], set(), [], []
    try:
        for update in updates:
            identifier = _identifier(update.metadata["id"])
            if identifier.casefold() in seen_ids:
                raise ValueError("Preset repetido na mesma operação.")
            ids.append(identifier)
            seen_ids.add(identifier.casefold())
            after = encode_preset(update.metadata, update.configuration, update.context)
            final = f"{identifier}.mockaize.xml"
            before = _read(root / final)
            previous = decode_preset(before) if before is not None else None
            if previous is not None and previous["metadata"]["id"] != identifier:
                raise ValueError("ID do preset atual diverge do nome físico.")
            pairs = [(final, "current", before, after)]
            # Python equality conflates JSON types, for example False == 0.
            if (update.rotate_old and previous is not None
                    and canonical_payload({}, previous["configuration"], {})
                    != canonical_payload({}, update.configuration, {})):
                old_final = f"{identifier}.OLD.mockaize.xml"
                pairs.append((old_final, "old", _read(root / old_final), before))
            for destination, role, first, last in pairs:
                entry = {"final": destination}
                for side, content in (("before", first), ("after", last)):
                    entry[side] = _snapshot(root, operation_id, identifier, role, side, content)
                    if content is not None:
                        staged.append(root / entry[side]["staged"])
                files.append(entry)
        journal = {"schemaVersion": 1, "operationId": operation_id, "rootId": root_id,
                   "kind": kind, "catalogWide": catalog_wide, "affectedIds": sorted(ids),
                   "createdAt": datetime.now(timezone.utc).isoformat(), "files": files}
        _validate_journal(journal, operation_id, root_id)
        raw = json.dumps(journal, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        path = sync / f"{operation_id}.pending.json"
        temporary = sync / f"{operation_id}.pending.json.tmp"
        _write(temporary, raw)
        staged.append(temporary)
        os.replace(temporary, path)
        return path, raw, journal
    except Exception:
        for path in staged:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
        raise


def _converge(root, journal, side):
    # Validate all needed snapshots before replacing even the first target.
    changes = []
    for entry in journal["files"]:
        destination = _ordinary(root / entry["final"])
        snapshot = entry[side]
        content = _read(destination)
        if not snapshot["exists"]:
            changes.append((destination, None))
        elif content is not None and _digest(content) == snapshot["sha256"]:
            continue
        else:
            source = _ordinary(root / snapshot["staged"])
            staged = _read(source)
            if staged is None or _digest(staged) != snapshot["sha256"]:
                raise ValueError("Snapshot de recuperação ausente ou corrompido.")
            changes.append((destination, source))
    for destination, source in changes:
        _ordinary(destination)
        if source is None:
            destination.unlink(missing_ok=True)
        else:
            os.replace(source, destination)
        _checkpoint("published_old" if ".OLD." in destination.name else "published_current")
    for entry in journal["files"]:
        content = _read(root / entry["final"])
        snapshot = entry[side]
        if (content is None) != (not snapshot["exists"]) or content is not None and _digest(content) != snapshot["sha256"]:
            raise ValueError("A publicação dos presets não foi confirmada.")


def _finish(root, path, journal):
    _checkpoint("before_finalize")
    path.unlink()
    # Marker/temp remnants are harmless after the verified journal is removed.
    try:
        _checkpoint("journal_removed")
        with storage.connect() as db:
            db.execute("DELETE FROM preset_sync_commits WHERE operation_id=?", (journal["operationId"],))
    except (OSError, sqlite3.Error):
        return
    for entry in journal["files"]:
        for side in ("before", "after"):
            snapshot = entry[side]
            if snapshot["exists"]:
                try:
                    _ordinary(root / snapshot["staged"]).unlink(missing_ok=True)
                except (OSError, ValueError):
                    pass


def _cleanup_orphans(root, sync):
    # Only our exact basenames, after every published journal has converged.
    for path in root.iterdir():
        match = re.fullmatch(r"\.([0-9a-f-]{36})\.([A-Za-z0-9_-]+)\.(?:current|old)\.(?:before|after)\.tmp", path.name)
        if match:
            try:
                _uuid(match[1])
                _identifier(match[2])
                _ordinary(path).unlink(missing_ok=True)
            except (OSError, ValueError):
                pass
    for path in sync.iterdir():
        if re.fullmatch(r"[0-9a-f-]{36}\.pending\.json\.tmp", path.name.casefold()):
            try:
                _uuid(path.name.casefold().removesuffix(".pending.json.tmp"))
                _ordinary(path).unlink(missing_ok=True)
            except (OSError, ValueError):
                pass


def _cleanup_restore_snapshots():
    """Remove only our restore staging/rollback files after journals converge."""
    backup_root = storage.data_directory() / "Backups"
    try:
        _ordinary(backup_root, directory=True)
        if not backup_root.exists():
            return
        for path in backup_root.iterdir():
            match = re.fullmatch(r"\.(?:restore|rollback)-([0-9a-f-]{36})\.tmp", path.name)
            if match:
                try:
                    _uuid(match[1])
                    _ordinary(path).unlink(missing_ok=True)
                except (OSError, ValueError):
                    pass
    except (OSError, ValueError):
        # Cleanup is best-effort; the validated journal remains the authority.
        return


def recover():
    """Complete committed journals or restore their pre-commit filesystem."""
    with storage.DB_LOCK:
        try:
            root, sync = _directories()
            journals = _load_journals(root, sync, storage._manifest_root_id())
            for path, raw, journal in journals:
                with storage.connect() as db:
                    marker = db.execute("SELECT journal_sha256 FROM preset_sync_commits WHERE operation_id=?",
                                        (journal["operationId"],)).fetchone()
                if marker is not None and marker[0] != _digest(raw):
                    raise ValueError("Marcador de commit diverge do journal.")
                _converge(root, journal, "after" if marker is not None else "before")
                _finish(root, path, journal)
            with storage.connect() as db:
                db.execute("DELETE FROM preset_sync_commits")
            _cleanup_orphans(root, sync)
        except (OSError, ValueError, TypeError, KeyError, RecursionError, sqlite3.Error) as exc:
            raise PresetSyncError("Sincronização pendente. Verifique o diretório de presets e tente recuperar novamente.") from exc


def run_operation(callback, *, kind="metadata", catalog_wide=False):
    """Run callback(db)->(result, updates), then durably publish its snapshots.

    callback may mutate only this SQLite transaction, never commit or perform
    external side effects. A validation/revision exception rolls back untouched.
    """
    with storage.DB_LOCK:
        recover()
        if kind != "backfill":
            storage._ensure_preset_backfill()
        root, sync = _directories()
        prepared = None
        committed = False
        revisions = {}
        try:
            with storage.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                result, updates = callback(db)
                updates = list(updates)
                revisions = {update.metadata["id"]: update.metadata["revision"] for update in updates}
                _checkpoint("before_prepare")
                prepared = _prepare(root, sync, updates, kind, catalog_wide)
                path, raw, journal = prepared
                _checkpoint("journal_ready")
                db.execute("INSERT INTO preset_sync_commits VALUES(?,?,?)",
                           (journal["operationId"], _digest(raw), journal["createdAt"]))
                _checkpoint("before_commit")
            committed = True
            _checkpoint("after_commit")
            _converge(root, journal, "after")
            _finish(root, path, journal)
            return result
        except Exception as exc:
            if prepared is None:
                raise
            if not committed:
                # A commit I/O exception can be ambiguous: inspect its durable
                # marker instead of telling the UI to retry an already saved edit.
                try:
                    with storage.connect() as db:
                        marker = db.execute("SELECT journal_sha256 FROM preset_sync_commits WHERE operation_id=?",
                                            (prepared[2]["operationId"],)).fetchone()
                    committed = marker is not None and marker[0] == _digest(prepared[1])
                except (OSError, sqlite3.Error):
                    committed = None
            raise PresetSyncError("A gravação precisa de recuperação da sincronização dos presets.",
                                  operation_id=prepared[2]["operationId"], committed=committed,
                                  revisions=revisions if committed else {}) from exc


def replace_database(staged_database, updates):
    """Use the same journal protocol when the commit point is a DB replacement.

    The caller has already validated/copied the database and saved a rollback
    snapshot; neither file may be discarded while this operation is pending.
    """
    with storage.DB_LOCK:
        recover()
        root, sync = _directories()
        prepared = _prepare(root, sync, updates, "restore", True)
        path, raw, journal = prepared
        live = storage.data_directory() / "mockaize.sqlite3"
        committed = False
        try:
            staged = sqlite3.connect(staged_database)
            try:
                staged.execute("PRAGMA journal_mode=DELETE")
                staged.execute("PRAGMA synchronous=FULL")
                ensure_schema(staged)
                staged.execute("DELETE FROM preset_sync_commits")
                staged.execute("INSERT INTO preset_sync_commits VALUES(?,?,?)",
                               (journal["operationId"], _digest(raw), journal["createdAt"]))
                staged.commit()
            finally:
                staged.close()
            with Path(staged_database).open("rb+") as stream:
                os.fsync(stream.fileno())
            _checkpoint("before_database_swap")
            with storage.connect() as db:
                db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            os.replace(staged_database, live)
            committed = True
            _checkpoint("after_database_swap")
            _converge(root, journal, "after")
            _finish(root, path, journal)
        except Exception as exc:
            if not committed:
                try:
                    with storage.connect() as db:
                        marker = db.execute("SELECT journal_sha256 FROM preset_sync_commits WHERE operation_id=?",
                                            (journal["operationId"],)).fetchone()
                    committed = marker is not None and marker[0] == _digest(raw)
                except (OSError, sqlite3.Error):
                    committed = None
            raise PresetSyncError("A restauração precisa concluir a sincronização dos presets.",
                                  operation_id=journal["operationId"], committed=committed,
                                  revisions={item.metadata["id"]: item.metadata["revision"] for item in updates} if committed else {}) from exc
