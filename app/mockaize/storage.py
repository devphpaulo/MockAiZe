from __future__ import annotations

import ctypes
import copy
import json
import hashlib
import os
import re
import shutil
import sqlite3
import threading
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

PRODUCT = "MockAíZé"
FOLDERID_Documents = ctypes.c_byte * 16
DOCUMENTS_ID = FOLDERID_Documents.from_buffer_copy(uuid.UUID("fdd39ad0-238f-46af-adb4-6c85480369c7").bytes_le)
DB_LOCK = threading.RLock()


class ManagedConnection(sqlite3.Connection):
    """Make `with connect()` release file handles after committing/rolling back."""
    def __enter__(self):
        DB_LOCK.acquire()
        self._mockaize_locked = True
        return super().__enter__()

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()
            if getattr(self, "_mockaize_locked", False):
                self._mockaize_locked = False
                DB_LOCK.release()


def documents_directory() -> Path:
    """Resolve the Windows Documents known folder, including OneDrive redirection."""
    if os.name == "nt":
        path = ctypes.c_wchar_p()
        shell32 = ctypes.WinDLL("shell32", use_last_error=True)
        ole32 = ctypes.WinDLL("ole32", use_last_error=True)
        shell32.SHGetKnownFolderPath.argtypes = (ctypes.POINTER(FOLDERID_Documents), ctypes.c_uint32, ctypes.c_void_p, ctypes.POINTER(ctypes.c_wchar_p))
        shell32.SHGetKnownFolderPath.restype = ctypes.c_long
        ole32.CoTaskMemFree.argtypes = (ctypes.c_void_p,)
        result = shell32.SHGetKnownFolderPath(ctypes.byref(DOCUMENTS_ID), 0, None, ctypes.byref(path))
        if result == 0 and path.value:
            value = Path(path.value)
            ole32.CoTaskMemFree(ctypes.cast(path, ctypes.c_void_p))
            return value
        raise OSError(f"Não foi possível localizar a pasta Documentos do Windows (HRESULT {result}).")
    return Path.home() / "Documents"


def data_directory() -> Path:
    path = documents_directory() / PRODUCT
    path.mkdir(parents=True, exist_ok=True)
    return path


def _has_reparse_point(path: Path) -> bool:
    try:
        attributes = path.stat().st_file_attributes
    except AttributeError:
        return False
    return bool(attributes & 0x400)


def _initialize_root() -> str:
    root = documents_directory() / PRODUCT
    root.parent.mkdir(parents=True, exist_ok=True)
    if root.exists() and (not root.is_dir() or _has_reparse_point(root)):
        raise OSError("ROOT_AMBIGUOUS: a pasta Documentos\\MockAíZé não é um diretório local comum.")
    if not root.exists():
        root.mkdir()
    manifest_path = root / "mockaize-root.json"
    temp_path = root / "mockaize-root.json.tmp"
    if not manifest_path.exists():
        if temp_path.exists():
            try:
                candidate = json.loads(temp_path.read_text(encoding="utf-8"))
                uuid.UUID(candidate["rootId"])
                if candidate.get("product") != PRODUCT:
                    raise ValueError("produto")
                os.replace(temp_path, manifest_path)
            except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
                raise OSError("ROOT_RECOVERY: manifesto temporário inválido; restaure a pasta original em Documentos\\MockAíZé.") from exc
        elif any(root.iterdir()):
            raise OSError("ROOT_RECOVERY: existem dados sem manifesto de identidade em Documentos\\MockAíZé.")
        else:
            payload = {"schemaVersion": 1, "rootId": str(uuid.uuid4()), "createdAt": datetime.now(timezone.utc).isoformat(), "product": PRODUCT}
            with temp_path.open("x", encoding="utf-8") as stream:
                stream.write(json.dumps(payload, ensure_ascii=False, indent=2))
                stream.flush(); os.fsync(stream.fileno())
            os.replace(temp_path, manifest_path)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or manifest.get("product") != PRODUCT or manifest.get("schemaVersion") not in {1, 2}:
            raise ValueError("product/version")
        root_id = str(uuid.UUID(manifest["rootId"]))
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise OSError("ROOT_RECOVERY: manifesto inválido em Documentos\\MockAíZé.") from exc
    return root_id


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(data_directory() / "mockaize.sqlite3", timeout=10, factory=ManagedConnection)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA journal_mode = WAL")
    return db


def initialize() -> None:
    root_id = _initialize_root()
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS applications (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS communication_groups (
          id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS specific_files (
          id TEXT PRIMARY KEY, communication_group_id TEXT NOT NULL REFERENCES communication_groups(id) ON DELETE RESTRICT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS variations (
          id TEXT PRIMARY KEY, specific_file_id TEXT NOT NULL REFERENCES specific_files(id) ON DELETE RESTRICT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0), config_json TEXT NOT NULL DEFAULT '{}',
          file_index INTEGER NOT NULL DEFAULT 0 CHECK(file_index >= 0), revision INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY, variation_id TEXT NOT NULL REFERENCES variations(id) ON DELETE RESTRICT,
          file_name TEXT NOT NULL, relative_path TEXT NOT NULL, sha256 TEXT NOT NULL,
          byte_length INTEGER NOT NULL CHECK(byte_length >= 0), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS user_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS bundles (
          id TEXT PRIMARY KEY, variation_id TEXT NOT NULL REFERENCES variations(id) ON DELETE RESTRICT,
          ps1_sha256 TEXT NOT NULL, bat_sha256 TEXT NOT NULL, ps1_bytes INTEGER NOT NULL,
          bat_bytes INTEGER NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS operational_backups (
          id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL,
          root_id TEXT NOT NULL, created_at TEXT NOT NULL
        );
        """)
        from .library import ensure_schema
        ensure_schema(db)
        stored_root_id = db.execute("SELECT value FROM app_meta WHERE key='root_id'").fetchone()
        if stored_root_id and stored_root_id[0] != root_id:
            raise OSError("ROOT_ID_MISMATCH: o banco SQLite pertence a outra identidade de raiz.")
        db.execute("INSERT OR IGNORE INTO app_meta(key,value) VALUES('schema_version','2')")
        db.execute("INSERT OR IGNORE INTO app_meta(key,value) VALUES('root_id',?)", (root_id,))
        db.execute("INSERT OR IGNORE INTO schema_meta(key,value) VALUES('version','2')")
        db.execute("INSERT OR IGNORE INTO user_settings(key,value_json) VALUES('theme','\"system\"')")


def tree() -> dict:
    with connect() as db:
        workspaces = [dict(row) for row in db.execute("SELECT * FROM workspaces ORDER BY name COLLATE NOCASE")]
        for ws in workspaces:
            ws["applications"] = [dict(row) for row in db.execute("SELECT * FROM applications WHERE workspace_id=? ORDER BY name COLLATE NOCASE", (ws["id"],))]
            for app in ws["applications"]:
                app["communication_groups"] = [dict(row) for row in db.execute("SELECT * FROM communication_groups WHERE application_id=? ORDER BY name COLLATE NOCASE", (app["id"],))]
                for group in app["communication_groups"]:
                    group["specific_files"] = [dict(row) for row in db.execute("SELECT * FROM specific_files WHERE communication_group_id=? ORDER BY name COLLATE NOCASE", (group["id"],))]
                    for file in group["specific_files"]:
                        file["variations"] = [dict(row) for row in db.execute("SELECT id,name,revision,file_index,created_at FROM variations WHERE specific_file_id=? ORDER BY name COLLATE NOCASE", (file["id"],))]
        return {"workspaces": workspaces}


PARENT_TABLE = {"application": ("applications", "workspace_id"), "communication_group": ("communication_groups", "application_id"), "specific_file": ("specific_files", "communication_group_id"), "variation": ("variations", "specific_file_id")}


def create_entity(kind: str, parent_id: str | None, name: str) -> dict:
    name = name.strip()
    if not name or len(name) > 128 or any(ord(char) < 32 or 0x7F <= ord(char) <= 0x9F for char in name):
        raise ValueError("Informe um nome entre 1 e 128 caracteres, sem caracteres de controle.")
    now, entity_id = datetime.now(timezone.utc).isoformat(), str(uuid.uuid4())
    with connect() as db:
        if kind == "workspace":
            db.execute("INSERT INTO workspaces(id,name,created_at) VALUES(?,?,?)", (entity_id, name, now))
        elif kind in PARENT_TABLE:
            table, parent_column = PARENT_TABLE[kind]
            if not parent_id:
                raise ValueError("Selecione o item pai antes de criar.")
            if kind == "variation":
                db.execute(f"INSERT INTO {table}(id,{parent_column},name,created_at) VALUES(?,?,?,?)", (entity_id, parent_id, name, now))
            else:
                db.execute(f"INSERT INTO {table}(id,{parent_column},name,created_at) VALUES(?,?,?,?)", (entity_id, parent_id, name, now))
        else:
            raise ValueError("Tipo de item inválido.")
    return {"id": entity_id, "kind": kind, "parentId": parent_id, "name": name, "createdAt": now}


def get_variation(variation_id: str) -> dict | None:
    with connect() as db:
        row = db.execute("SELECT id,specific_file_id,name,config_json,file_index,revision,created_at FROM variations WHERE id=?", (variation_id,)).fetchone()
    if row is None:
        return None
    with connect() as db:
        if db.execute("SELECT 1 FROM library_nodes WHERE id=? AND deleted_at IS NOT NULL", (variation_id,)).fetchone(): return None
    result = dict(row)
    result["config"] = json.loads(result.pop("config_json"))
    return result


CONFIG_DEFAULTS = {
    "filterPresets": [], "activeFilterPresetId": "",
    "filter": {"group": "", "action": "keep", "match": "all", "conditions": [], "fileName": ""},
    "manual": {"templateXml": "", "values": {}, "confirmed": False, "fileName": "", "recordCount": 1, "recordGroup": ""},
    "inputByMode": {}, "inputXml": "", "outputXml": "", "recordCount": 1, "fileName": "mock",
    "mode": "return", "inputGroup": "", "outputGroup": "", "returnSource": "first",
    "baseDate": "", "rulesByMode": {"new": {}, "return": {}},
    "presenceByMode": {"new": {}, "return": {}},
    "filenameByMode": {"new": {"type": "literal", "value": "mock"}, "return": {"type": "literal", "value": "mock"}},
    "inputNotes": {}, "outputNotesByMode": {"new": {}, "return": {}},
    "headersByMode": {"new": [], "return": []},
    "returnModels": [], "activeReturnId": "",
}
GENERATOR_TYPES = {"literal", "copy", "field", "config", "count", "cpf", "cnpj", "list", "hash", "person", "company", "address", "zeros", "sequence", "date", "alpha", "random", "id", "compose", "groupSum"}
FORMULA_FIELDS = {
    "groupSum": {"source", "group", "path", "allRecords"},
    "literal": {"value"}, "copy": {"path"}, "field": {"source", "path"},
    "config": set(), "count": set(), "cpf": {"mask"},
    "cnpj": {"mode", "mask", "establishment"}, "list": {"values", "mode", "index"},
    "hash": {"length", "format"}, "person": {"field", "group"},
    "company": {"field", "group"}, "address": {"field", "state", "group"},
    "zeros": {"length"}, "sequence": {"start", "step", "width", "scope"},
    "date": {"mode", "days", "format", "value", "holidays", "custom"},
    "alpha": {"length", "alphabet"}, "random": {"min", "max", "decimals"},
    "id": {"mode", "prefix", "length"}, "compose": {"operation", "separator", "parts"},
}


def validate_structural_path(value: object) -> None:
    if not isinstance(value, str) or len(value) > 16_384:
        raise ValueError("Caminho estrutural XML inválido.")
    try:
        parts = json.loads(value)
    except (ValueError, TypeError) as exc:
        raise ValueError("Caminho estrutural XML inválido.") from exc
    if not isinstance(parts, list) or not parts or len(parts) > 128:
        raise ValueError("Caminho estrutural XML inválido.")
    for index, part in enumerate(parts):
        if not isinstance(part, dict) or set(part) - {"ns", "name", "index", "attribute"}:
            raise ValueError("Segmento de caminho XML inválido.")
        if not isinstance(part.get("ns", ""), str) or not isinstance(part.get("name"), str) or not part["name"]:
            raise ValueError("Segmento de caminho XML inválido.")
        attribute = part.get("attribute", False)
        if not isinstance(attribute, bool) or (attribute and index != len(parts) - 1):
            raise ValueError("Atributo XML precisa ser o último segmento do caminho.")
        if attribute:
            if "index" in part: raise ValueError("Atributo XML não possui índice de ocorrência.")
        elif isinstance(part.get("index"), bool) or not isinstance(part.get("index"), int) or part["index"] < 1:
            raise ValueError("Índice de ocorrência XML inválido.")


def validate_formula(formula: object, depth: int = 0) -> None:
    if not isinstance(formula, dict) or not isinstance(formula.get("type"), str) or formula["type"] not in GENERATOR_TYPES or depth > 6:
        raise ValueError("Fórmula tipada inválida ou composição muito profunda.")
    if set(formula) - ({"type"} | FORMULA_FIELDS[formula["type"]]):
        raise ValueError("A fórmula contém propriedades não reconhecidas.")
    if formula["type"] == "date" and "custom" in formula:
        custom = formula["custom"]
        flags = {"day", "month", "year", "hour", "minute", "second", "milliseconds", "timezone"}
        choices = {"order": {"DMY", "YMD", "MDY"}, "yearDigits": {"2", "4"}, "dateSeparator": {"", "/", "-", "."}, "timeSeparator": {"", ":", "."}, "join": {"", " ", "T"}, "zone": {"app", "utc"}}
        if not isinstance(custom, dict) or set(custom) - (flags | set(choices)):
            raise ValueError("Configuração personalizada de data inválida.")
        if any(not isinstance(custom[key], bool) for key in flags & set(custom)):
            raise ValueError("Os componentes de data devem ser booleanos.")
        if any(not isinstance(custom[key], str) or custom[key] not in values for key, values in choices.items() if key in custom):
            raise ValueError("Formato personalizado de data inválido.")
        if formula.get("format") == "custom" and not any(custom.get(key, True) for key in ("day", "month", "year", "hour", "minute", "second")):
            raise ValueError("Selecione pelo menos um componente de data.")
    if formula["type"] in {"copy", "field", "groupSum"}:
        validate_structural_path(formula.get("path"))
    if formula["type"] in {"field", "groupSum"} and formula.get("source", "output") not in {"input", "output"}:
        raise ValueError("Origem de campo inválida.")
    if formula["type"] == "groupSum":
        if "allRecords" in formula and not isinstance(formula["allRecords"], bool): raise ValueError("O escopo do somatório deve ser booleano.")
        validate_structural_path(formula.get("group"))
        group, field = json.loads(formula["group"]), json.loads(formula["path"])
        if group[-1].get("attribute") or len(field) <= len(group) or any(part.get("name") != field[i].get("name") or part.get("ns") != field[i].get("ns") or (i < len(group)-1 and part.get("index") != field[i].get("index")) for i, part in enumerate(group)):
            raise ValueError("O campo somado precisa estar dentro do grupo selecionado.")
    if formula["type"] == "compose":
        parts = formula.get("parts")
        if not isinstance(parts, list) or not 1 <= len(parts) <= 100:
            raise ValueError("Composição deve conter de 1 a 100 partes.")
        if formula.get("operation", "concat") not in {"concat", "sum"}:
            raise ValueError("Operação de composição inválida.")
        for child in parts: validate_formula(child, depth + 1)


def validate_filter(filters: object) -> None:
    if not isinstance(filters, dict) or set(filters) - {"group", "action", "match", "conditions", "fileName", "filename"} or not {"group", "action", "match", "conditions", "fileName"} <= set(filters):
        raise ValueError("Configuração de filtro inválida.")
    if filters["action"] not in ("keep", "remove") or filters["match"] not in ("all", "any"):
        raise ValueError("Ação ou combinação de filtros inválida.")
    if not isinstance(filters["group"], str) or not isinstance(filters["fileName"], str) or len(filters["fileName"]) > 180:
        raise ValueError("Grupo ou nome de filtro inválido.")
    filters.setdefault("filename", {"type": "literal", "value": filters["fileName"] or "filtrado.xml"})
    validate_formula(filters["filename"])
    if filters["group"]: validate_structural_path(filters["group"])
    if not isinstance(filters["conditions"], list) or len(filters["conditions"]) > 100:
        raise ValueError("Informe até 100 condições de filtro.")
    for condition in filters["conditions"]:
        if not isinstance(condition, dict) or set(condition) - {"path", "operator", "value", "connector"} or not {"path", "operator", "value"} <= set(condition):
            raise ValueError("Condição de filtro inválida.")
        if not isinstance(condition["path"], str) or not isinstance(condition["value"], str) or len(condition["value"]) > 2000:
            raise ValueError("Campo ou valor de filtro inválido.")
        if condition.get("connector", "and") not in ("and", "or"):
            raise ValueError("Conector de condição inválido. Use E ou OU.")
        if condition["path"]: validate_structural_path(condition["path"])
        if condition["operator"] not in ("exists", "missing", "equals", "notEquals", "contains", "notContains", "empty", "notEmpty"):
            raise ValueError("Operador de filtro inválido.")


def normalize_config(config: object) -> dict:
    legacy = {"rules", "presence", "filename"}
    if not isinstance(config, dict) or set(config) - (set(CONFIG_DEFAULTS) | legacy):
        raise ValueError("A configuração da variação tem formato inválido.")
    normalized = {**copy.deepcopy(CONFIG_DEFAULTS), **config}
    mode = normalized.get("mode", "return")
    if "rules" in config:
        normalized["rulesByMode"] = {**CONFIG_DEFAULTS["rulesByMode"], mode: config["rules"]}
    if "presence" in config:
        normalized["presenceByMode"] = {**CONFIG_DEFAULTS["presenceByMode"], mode: config["presence"]}
    if "filename" in config:
        normalized["filenameByMode"] = {**CONFIG_DEFAULTS["filenameByMode"], mode: config["filename"]}
    normalized.pop("rules", None); normalized.pop("presence", None); normalized.pop("filename", None)
    if not isinstance(normalized["inputXml"], str) or not isinstance(normalized["outputXml"], str):
        raise ValueError("Os modelos XML devem ser texto.")
    for key in ("inputXml", "outputXml"):
        if len(normalized[key].encode("utf-8")) > 2_000_000:
            raise ValueError("Cada modelo XML aceita até 2 MB.")
        if normalized[key]:
            if re.search(r"<!\s*(?:DOCTYPE|ENTITY)", normalized[key], re.IGNORECASE):
                raise ValueError("DOCTYPE e entidades não são aceitos nos modelos XML.")
            try:
                ET.fromstring(normalized[key])
            except ET.ParseError as exc:
                raise ValueError(f"Modelo XML inválido: {exc}") from exc
    validate_filter(normalized["filter"])
    presets = normalized["filterPresets"]
    active_preset = normalized["activeFilterPresetId"]
    if not isinstance(presets, list) or len(presets) > 50 or not isinstance(active_preset, str):
        raise ValueError("Lista de presets de filtros inválida. O limite é 50 presets por arquivo.")
    preset_ids, preset_names = set(), set()
    for preset in presets:
        if not isinstance(preset, dict) or set(preset) != {"id", "name", "filter"}:
            raise ValueError("Preset de filtro inválido.")
        identifier, name = preset["id"], preset["name"]
        if not isinstance(identifier, str) or not 1 <= len(identifier) <= 80 or identifier in preset_ids:
            raise ValueError("Identificador de preset inválido ou duplicado.")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 120 or name.strip().casefold() in preset_names:
            raise ValueError("Nome de preset inválido ou duplicado.")
        preset_ids.add(identifier); preset_names.add(name.strip().casefold())
        validate_filter(preset["filter"])
    if active_preset and active_preset not in preset_ids:
        raise ValueError("Preset de filtro selecionado não encontrado.")
    manual = normalized["manual"]
    if (not isinstance(manual, dict) or (set(manual) - {"templateXml", "values", "confirmed", "fileName", "recordCount", "recordGroup"} or not {"templateXml", "values", "confirmed", "fileName"} <= set(manual))
        or not isinstance(manual["templateXml"], str) or not isinstance(manual["values"], dict)
        or not isinstance(manual["confirmed"], bool) or not isinstance(manual["fileName"], str)
        or len(manual["fileName"]) > 180):
        raise ValueError("Preenchimento manual inválido.")
    manual.setdefault("recordCount", 1)
    manual.setdefault("recordGroup", "")
    if isinstance(manual["recordCount"], bool) or not isinstance(manual["recordCount"], int) or not 1 <= manual["recordCount"] <= 500:
        raise ValueError("A quantidade de registros manuais deve estar entre 1 e 500.")
    if not isinstance(manual["recordGroup"], str):
        raise ValueError("Grupo de registro manual inválido.")
    if manual["recordGroup"]: validate_structural_path(manual["recordGroup"])
    if len(manual["templateXml"].encode("utf-8")) > 2_000_000 or re.search(r"<!\s*(?:DOCTYPE|ENTITY)", manual["templateXml"], re.IGNORECASE):
        raise ValueError("Modelo manual inválido ou maior que 2 MB.")
    if manual["templateXml"]:
        try: ET.fromstring(manual["templateXml"])
        except ET.ParseError as exc: raise ValueError(f"XML manual inválido: {exc}") from exc
    for path, value in manual["values"].items():
        validate_structural_path(path)
        if not isinstance(value, str): raise ValueError("O valor manual deve ser texto.")
    if len(json.dumps(manual["values"], ensure_ascii=False).encode("utf-8")) > 4_000_000:
        raise ValueError("Os valores manuais excedem 4 MB.")
    inputs = normalized["inputByMode"]
    if not isinstance(inputs, dict) or set(inputs) - {"new", "return", "filter"}:
        raise ValueError("Documentos por operação inválidos.")
    for document in inputs.values():
        if not isinstance(document, dict) or set(document) != {"xml", "group"} or not isinstance(document["xml"], str) or not isinstance(document["group"], str):
            raise ValueError("XML de entrada da operação inválido.")
        if len(document["xml"].encode("utf-8")) > 2_000_000 or re.search(r"<!\s*(?:DOCTYPE|ENTITY)", document["xml"], re.IGNORECASE):
            raise ValueError("XML de entrada inválido ou maior que 2 MB.")
        if document["xml"]:
            try: ET.fromstring(document["xml"])
            except ET.ParseError as exc: raise ValueError(f"XML de entrada inválido: {exc}") from exc
    if isinstance(normalized["recordCount"], bool) or not isinstance(normalized["recordCount"], int) or not 1 <= normalized["recordCount"] <= 500:
        raise ValueError("A quantidade deve ser um inteiro entre 1 e 500.")
    if not isinstance(normalized["fileName"], str) or not normalized["fileName"].strip() or len(normalized["fileName"]) > 120:
        raise ValueError("Informe um nome de arquivo entre 1 e 120 caracteres.")
    if (not isinstance(normalized["mode"], str) or normalized["mode"] not in {"new", "return", "manual", "filter"}
        or not isinstance(normalized["returnSource"], str) or normalized["returnSource"] not in {"first", "all"}):
        raise ValueError("Modo de geração inválido.")
    if not isinstance(normalized["inputGroup"], str) or not isinstance(normalized["outputGroup"], str):
        raise ValueError("Os caminhos dos grupos XML são inválidos.")
    if not isinstance(normalized["baseDate"], str) or len(normalized["baseDate"]) > 10:
        raise ValueError("A data-base é inválida.")
    if (not isinstance(normalized["rulesByMode"], dict) or set(normalized["rulesByMode"]) - {"new", "return"}
        or not isinstance(normalized["presenceByMode"], dict) or set(normalized["presenceByMode"]) - {"new", "return"}
        or not isinstance(normalized["filenameByMode"], dict) or set(normalized["filenameByMode"]) - {"new", "return"}
        or not isinstance(normalized["inputNotes"], dict) or not isinstance(normalized["outputNotesByMode"], dict)):
        raise ValueError("Regras, políticas de presença ou fórmula de nome são inválidas.")
    for mode in ("new", "return"):
        for group in (normalized["rulesByMode"], normalized["presenceByMode"], normalized["filenameByMode"], normalized["outputNotesByMode"]):
            group.setdefault(mode, {})
        if not all(isinstance(normalized[key][mode], dict) for key in ("rulesByMode", "presenceByMode", "filenameByMode", "outputNotesByMode")):
            raise ValueError("A configuração por operação tem formato inválido.")
        for path, rule in normalized["rulesByMode"][mode].items():
            validate_structural_path(path)
            if not isinstance(rule, dict) or set(rule) - {"generator", "sourcePath", "fixed", "exactLength", "lengthTarget", "comment", "formulaComment", "lineComment"}:
                raise ValueError("Regra de campo inválida.")
            if rule.get("generator") is not None: validate_formula(rule["generator"])
            if rule.get("sourcePath") is not None: validate_structural_path(rule["sourcePath"])
            if rule.get("fixed") is not None and not isinstance(rule["fixed"], str): raise ValueError("Valor fixo deve ser texto.")
            exact = rule.get("exactLength")
            if exact is not None and (isinstance(exact, bool) or not isinstance(exact, int) or not 1 <= exact <= 4096):
                raise ValueError("Comprimento exato deve estar entre 1 e 4096.")
            if not isinstance(rule.get("lengthTarget", "validate"), str) or rule.get("lengthTarget", "validate") not in {"validate", "input", "output"}:
                raise ValueError("Destino do limite de caracteres inválido.")
            for comment in (rule.get("comment", ""), rule.get("formulaComment", ""), rule.get("lineComment", "")):
                if not isinstance(comment, str) or len(comment) > 2000: raise ValueError("Comentário de regra inválido.")
        for path, policy in normalized["presenceByMode"][mode].items():
            validate_structural_path(path)
            if not isinstance(policy, dict) or set(policy) != {"requirement", "include", "distribution"}:
                raise ValueError("Política de presença inválida.")
            if (not isinstance(policy["requirement"], str) or policy["requirement"] not in {"required", "optional"}
                or not isinstance(policy["include"], bool) or not isinstance(policy["distribution"], str)
                or policy["distribution"] not in {"all", "alternate"}):
                raise ValueError("Política de presença inválida.")
        if normalized["filenameByMode"][mode]: validate_formula(normalized["filenameByMode"][mode])
    for path in (normalized["inputGroup"], normalized["outputGroup"]):
        if path: validate_structural_path(path)
    headers = normalized["headersByMode"]
    if not isinstance(headers, dict) or set(headers) - {"new", "return"}:
        raise ValueError("A marcação de cabeçalhos é inválida.")
    for mode in ("new", "return"):
        paths = headers.setdefault(mode, [])
        if not isinstance(paths, list) or len(paths) > 256:
            raise ValueError("Marque no máximo 256 tags de cabeçalho por operação.")
        for path in paths:
            validate_structural_path(path)
        if len(set(paths)) != len(paths):
            raise ValueError("A marcação de cabeçalhos contém tags repetidas.")
    models = normalized["returnModels"]
    if not isinstance(models, list) or len(models) > 20:
        raise ValueError("Use no máximo 20 modelos de retorno por arquivo.")
    seen_ids, seen_names = set(), set()
    for model in models:
        expected = {"id", "name", "selected", "outputXml", "outputGroup", "rules", "presence", "filename", "outputNotes", "headers"}
        if not isinstance(model, dict) or set(model) != expected:
            raise ValueError("Modelo de retorno inválido.")
        if not isinstance(model["id"], str) or not 1 <= len(model["id"]) <= 64 or model["id"] in seen_ids:
            raise ValueError("Identificador de retorno inválido ou repetido.")
        if not isinstance(model["name"], str) or not model["name"].strip() or len(model["name"]) > 120 or model["name"].strip().casefold() in seen_names:
            raise ValueError("Nome de retorno inválido ou repetido.")
        if not isinstance(model["selected"], bool):
            raise ValueError("Seleção de retorno inválida.")
        seen_ids.add(model["id"]); seen_names.add(model["name"].strip().casefold())
        # Reuse the existing validation for XML, formulas, policies and headers.
        normalize_config({"outputXml": model["outputXml"], "outputGroup": model["outputGroup"],
            "rulesByMode": {"return": model["rules"]}, "presenceByMode": {"return": model["presence"]},
            "filenameByMode": {"return": model["filename"]}, "outputNotesByMode": {"return": model["outputNotes"]},
            "headersByMode": {"return": model["headers"]}})
    if not isinstance(normalized["activeReturnId"], str) or (models and normalized["activeReturnId"] not in seen_ids):
        raise ValueError("Selecione um modelo de retorno existente.")
    if len(json.dumps(normalized, ensure_ascii=False).encode("utf-8")) > 12_000_000:
        raise ValueError("A configuração excede 12 MB.")
    return normalized


def save_variation(variation_id: str, expected_revision: int, config: object, *, name: str | None = None) -> dict:
    if isinstance(expected_revision, bool) or not isinstance(expected_revision, int) or expected_revision < 1:
        raise ValueError("A revisão esperada é inválida.")
    normalized = normalize_config(config)
    serialized = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))
    if name is not None:
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 128:
            raise ValueError("Informe um nome de variação entre 1 e 128 caracteres.")
        name = name.strip()
    with connect() as db:
        if db.execute("SELECT 1 FROM library_nodes WHERE id=? AND deleted_at IS NOT NULL", (variation_id,)).fetchone(): raise KeyError("Arquivo excluído da biblioteca.")
        if name is not None: db.execute("UPDATE library_nodes SET name=? WHERE id=?", (name, variation_id))
        cursor = db.execute("UPDATE variations SET config_json=?,name=COALESCE(?,name),revision=revision+1 WHERE id=? AND revision=?", (serialized, name, variation_id, expected_revision))
        if cursor.rowcount != 1:
            exists = db.execute("SELECT revision FROM variations WHERE id=?", (variation_id,)).fetchone()
            if exists is None:
                raise KeyError("Variação não encontrada.")
            raise RuntimeError("A variação foi alterada em outra aba. Recarregue para continuar.")
    return get_variation(variation_id)


def get_settings() -> dict:
    with connect() as db:
        rows = db.execute("SELECT key,value_json FROM user_settings").fetchall()
    return {row["key"]: json.loads(row["value_json"]) for row in rows}


def validate_studio_layout(layout: object) -> None:
    if not isinstance(layout, dict) or set(layout) != {"sidebarWidth", "inspectorWidth", "editorMode", "syncScroll"}:
        raise ValueError("Preferências do estúdio inválidas.")
    for key, minimum, maximum in (("sidebarWidth", 192, 448), ("inspectorWidth", 272, 720)):
        value = layout[key]
        if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
            raise ValueError("Largura do painel inválida.")
    if layout["editorMode"] not in {"panel", "modal"} or not isinstance(layout["syncScroll"], bool):
        raise ValueError("Modo de edição ou sincronização inválido.")


def save_settings(patch: object) -> dict:
    if not isinstance(patch, dict) or not patch or set(patch) - {"theme", "lastSelection", "studioLayout"}:
        raise ValueError("Configuração de preferências inválida.")
    if "studioLayout" in patch:
        validate_studio_layout(patch["studioLayout"])
    if "theme" in patch and patch["theme"] not in {"light", "dark", "system"}:
        raise ValueError("Tema inválido.")
    if "lastSelection" in patch:
        selection = patch["lastSelection"]
        keys = {"workspaceId", "applicationId", "communicationGroupId", "specificFileId", "variationId"}
        if not isinstance(selection, dict) or set(selection) != keys or any(value is not None and not isinstance(value, str) for value in selection.values()):
            raise ValueError("A seleção atual tem formato inválido.")
        with connect() as db:
            parent_checks = (("applicationId", "applications", "workspace_id", "workspaceId"),
                             ("communicationGroupId", "communication_groups", "application_id", "applicationId"),
                             ("specificFileId", "specific_files", "communication_group_id", "communicationGroupId"),
                             ("variationId", "variations", "specific_file_id", "specificFileId"))
            if selection.get("variationId") and not selection.get("specificFileId"):
                from .library import _destination, _node
                node = _node(db, selection["variationId"])
                root, _ = _destination(db, node["parent_id"])
                if root != selection.get("workspaceId"): raise ValueError("Arquivo não pertence ao workspace selecionado.")
                parent_checks = ()
            for child_key, table, parent_column, expected_key in parent_checks:
                child_id = selection[child_key]
                if child_id is None: continue
                row = db.execute(f"SELECT {parent_column} FROM {table} WHERE id=?", (child_id,)).fetchone()
                if row is None: raise ValueError("A seleção contém um identificador inexistente.")
                expected = selection[expected_key]
                if expected is not None and row[0] != expected: raise ValueError("A seleção contém uma cadeia de pais incoerente.")
            if selection["workspaceId"] is not None and not db.execute("SELECT 1 FROM workspaces WHERE id=?", (selection["workspaceId"],)).fetchone():
                raise ValueError("A seleção contém um workspace inexistente.")
    with connect() as db:
        for key, value in patch.items():
            db.execute("INSERT INTO user_settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json",
                       (key, json.dumps(value, ensure_ascii=False, separators=(",", ":"))))
    return get_settings()


def export_workspace_backup() -> dict:
    root_id = json.loads((data_directory() / "mockaize-root.json").read_text(encoding="utf-8"))["rootId"]
    with connect() as db:
        result = {"format": "mockaize-workspace-backup", "version": 2, "pathEncodingVersion": 2,
                  "rootId": root_id, "exportedAt": datetime.now(timezone.utc).isoformat(), "hierarchy": [], "settings": get_settings()}
        for ws in db.execute("SELECT id,name,created_at FROM workspaces ORDER BY name COLLATE NOCASE"):
            workspace = {"id": ws["id"], "name": ws["name"], "createdAt": ws["created_at"], "applications": []}
            for app in db.execute("SELECT id,name,created_at FROM applications WHERE workspace_id=? ORDER BY name COLLATE NOCASE", (ws["id"],)):
                application = {"id": app["id"], "name": app["name"], "createdAt": app["created_at"], "communicationGroups": []}
                for group in db.execute("SELECT id,name,created_at FROM communication_groups WHERE application_id=? ORDER BY name COLLATE NOCASE", (app["id"],)):
                    comm = {"id": group["id"], "name": group["name"], "createdAt": group["created_at"], "specificFiles": []}
                    for file in db.execute("SELECT id,name,created_at FROM specific_files WHERE communication_group_id=? ORDER BY name COLLATE NOCASE", (group["id"],)):
                        specific = {"id": file["id"], "name": file["name"], "createdAt": file["created_at"], "variations": []}
                        for variation in db.execute("SELECT id,name,config_json,file_index,revision,created_at FROM variations WHERE specific_file_id=? ORDER BY name COLLATE NOCASE", (file["id"],)):
                            specific["variations"].append({"id": variation["id"], "name": variation["name"], "config": json.loads(variation["config_json"]),
                                                            "fileIndex": variation["file_index"], "revision": variation["revision"], "createdAt": variation["created_at"]})
                        comm["specificFiles"].append(specific)
                    application["communicationGroups"].append(comm)
                workspace["applications"].append(application)
            result["hierarchy"].append(workspace)
    with connect() as db:
        result["library"] = {"nodes": [dict(row) for row in db.execute("SELECT * FROM library_nodes")], "backingIds": [row[0] for row in db.execute("SELECT id FROM library_backing")]}
    return result


def _validate_backup(backup: object) -> dict:
    if isinstance(backup, dict) and backup.get("version") == 1 and isinstance(backup.get("workspaces"), list):
        if len(backup["workspaces"]) > 30:
            raise ValueError("O backup legado contém mais de 30 workspaces.")
        hierarchy = []
        for old_workspace in backup["workspaces"]:
            if not isinstance(old_workspace, dict) or not isinstance(old_workspace.get("name"), str) or not isinstance(old_workspace.get("configs"), list):
                raise ValueError("Workspace legado inválido.")
            workspace = {"id": str(uuid.uuid4()), "name": old_workspace["name"].strip(), "createdAt": "", "applications": []}
            if not workspace["name"] or len(workspace["name"]) > 128 or len(old_workspace["configs"]) > 100:
                raise ValueError("Workspace legado inválido ou com limite excedido.")
            application = {"id": str(uuid.uuid4()), "name": "Importados", "createdAt": "", "communicationGroups": []}
            group = {"id": str(uuid.uuid4()), "name": "Importados", "createdAt": "", "specificFiles": []}
            for old_config in old_workspace["configs"]:
                if not isinstance(old_config, dict) or not isinstance(old_config.get("name"), str):
                    raise ValueError("Configuração legada inválida.")
                name = old_config["name"].strip()
                if not name or len(name) > 128:
                    raise ValueError("Nome de configuração legado inválido.")
                config = normalize_config({
                    "inputXml": old_config.get("sourceTemplate", ""),
                    "outputXml": old_config.get("outputTemplate", ""),
                    "recordCount": old_config.get("count", 1),
                    "fileName": "mock",
                    "mode": old_config.get("mode", "new"),
                    "inputGroup": old_config.get("inputGroup", ""),
                    "outputGroup": old_config.get("outputGroup", ""),
                    "returnSource": old_config.get("returnSource", "first"),
                    "baseDate": old_config.get("baseDate", ""),
                    "rulesByMode": old_config.get("rulesByMode", {"new": {}, "return": {}}),
                    "presenceByMode": old_config.get("presenceByMode", {"new": {}, "return": {}}),
                    "filenameByMode": old_config.get("filenameByMode", {"new": {"type": "literal", "value": "mock"}, "return": {"type": "literal", "value": "mock"}}),
                    "inputNotes": old_config.get("inputNotes", {}),
                    "outputNotesByMode": old_config.get("outputNotesByMode", {"new": {}, "return": {}}),
                })
                specific = {"id": str(uuid.uuid4()), "name": name, "createdAt": "", "variations": [{
                    "id": str(uuid.uuid4()), "name": name, "config": config,
                    "fileIndex": old_config.get("fileIndex", 0), "revision": 1, "createdAt": ""}]}
                group["specificFiles"].append(specific)
            application["communicationGroups"].append(group); workspace["applications"].append(application)
            hierarchy.append(workspace)
        backup = {"format": "mockaize-workspace-backup", "version": 2, "pathEncodingVersion": 2,
                  "rootId": "legacy-v1", "exportedAt": "", "hierarchy": hierarchy, "settings": {"theme": "system"}}
    if not isinstance(backup, dict) or (set(backup) - {"library"}) != {"format", "version", "pathEncodingVersion", "rootId", "exportedAt", "hierarchy", "settings"}:
        raise ValueError("O backup não corresponde ao formato MockAíZé v2.")
    if backup["format"] != "mockaize-workspace-backup" or backup["version"] != 2 or backup["pathEncodingVersion"] != 2 or not isinstance(backup["hierarchy"], list):
        raise ValueError("Versão de backup não suportada.")
    settings = backup["settings"]
    if not isinstance(settings, dict) or set(settings) - {"theme", "lastSelection", "studioLayout"}:
        raise ValueError("Preferências do backup inválidas.")
    if "studioLayout" in settings:
        validate_studio_layout(settings["studioLayout"])
    count = 0
    def name(value):
        nonlocal count
        count += 1
        if count > 10000 or not isinstance(value, str) or not value.strip() or len(value) > 128 or any(ord(c) < 32 or 0x7F <= ord(c) <= 0x9F for c in value):
            raise ValueError("O backup contém um nome inválido ou excede o limite de itens.")
    for ws in backup["hierarchy"]:
        if not isinstance(ws, dict) or set(ws) != {"id", "name", "createdAt", "applications"} or not isinstance(ws["applications"], list): raise ValueError("Workspace inválido no backup.")
        name(ws["name"])
        for app in ws["applications"]:
            if not isinstance(app, dict) or set(app) != {"id", "name", "createdAt", "communicationGroups"} or not isinstance(app["communicationGroups"], list): raise ValueError("Aplicação inválida no backup.")
            name(app["name"])
            for group in app["communicationGroups"]:
                if not isinstance(group, dict) or set(group) != {"id", "name", "createdAt", "specificFiles"} or not isinstance(group["specificFiles"], list): raise ValueError("Grupo inválido no backup.")
                name(group["name"])
                for file in group["specificFiles"]:
                    if not isinstance(file, dict) or set(file) != {"id", "name", "createdAt", "variations"} or not isinstance(file["variations"], list): raise ValueError("Arquivo específico inválido no backup.")
                    name(file["name"])
                    for variation in file["variations"]:
                        if not isinstance(variation, dict) or set(variation) != {"id", "name", "config", "fileIndex", "revision", "createdAt"}: raise ValueError("Variação inválida no backup.")
                        name(variation["name"]); normalize_config(variation["config"])
                        if isinstance(variation["fileIndex"], bool) or not isinstance(variation["fileIndex"], int) or variation["fileIndex"] < 0: raise ValueError("Índice da variação inválido.")
    if "library" in backup:
        library = backup["library"]
        if not isinstance(library, dict) or set(library) != {"nodes", "backingIds"} or not isinstance(library["nodes"], list) or len(library["nodes"]) > 10000 or not isinstance(library["backingIds"], list):
            raise ValueError("Biblioteca do backup inválida.")
        ids = {}
        legacy_ids = set()
        variation_ids = set()
        def collect(items, children):
            for item in items:
                if not isinstance(item["id"], str): raise ValueError("ID inválido no backup.")
                legacy_ids.add(item["id"])
                if children:
                    child_key, remaining = children[0], children[1:]
                    collect(item[child_key], remaining)
                else: variation_ids.add(item["id"])
        collect(backup["hierarchy"], ["applications", "communicationGroups", "specificFiles", "variations"])
        for item in library["nodes"]:
            if not isinstance(item, dict) or set(item) != {"id", "parent_id", "kind", "name", "deleted_at", "created_at"} or not isinstance(item["id"], str) or item["id"] in ids or item["kind"] not in {"workspace", "folder", "variation"}:
                raise ValueError("Item inválido na biblioteca do backup.")
            name(item["name"])
            if not isinstance(item["created_at"], str) or item["deleted_at"] is not None and not isinstance(item["deleted_at"], str): raise ValueError("Data inválida no backup.")
            if item["kind"] == "variation" and item["id"] not in variation_ids: raise ValueError("Arquivo sem configuração no backup.")
            if item["kind"] == "workspace" and item["id"] not in {w["id"] for w in backup["hierarchy"]}: raise ValueError("Workspace ausente no backup.")
            ids[item["id"]] = item
        for item in ids.values():
            visited = set()
            cursor = item
            while cursor["parent_id"] is not None:
                if not isinstance(cursor["parent_id"], str) or cursor["parent_id"] not in ids or cursor["id"] in visited or len(visited) > 128: raise ValueError("Ciclo ou pasta ausente no backup.")
                visited.add(cursor["id"]); cursor = ids[cursor["parent_id"]]
                if cursor["kind"] == "variation": raise ValueError("Arquivo não pode conter pastas.")
            if cursor["kind"] != "workspace" or item["kind"] == "workspace" and item["parent_id"] is not None: raise ValueError("Raiz inválida no backup.")
        if any(not isinstance(value, str) or value not in legacy_ids or value in ids for value in library["backingIds"]): raise ValueError("Estrutura de compatibilidade inválida no backup.")
    return backup


def import_workspace_backup(backup: object) -> dict:
    backup = _validate_backup(backup)
    now = datetime.now(timezone.utc).isoformat()
    counts = {"workspaces": 0, "applications": 0, "communicationGroups": 0, "specificFiles": 0, "variations": 0}
    mapping = {}
    with connect() as db:
        for ws in backup["hierarchy"]:
            wid = str(uuid.uuid4()); mapping[ws["id"]] = wid; db.execute("INSERT INTO workspaces VALUES(?,?,?)", (wid, ws["name"], now)); counts["workspaces"] += 1
            for app in ws["applications"]:
                aid = str(uuid.uuid4()); mapping[app["id"]] = aid; db.execute("INSERT INTO applications VALUES(?,?,?,?)", (aid, wid, app["name"], now)); counts["applications"] += 1
                for group in app["communicationGroups"]:
                    gid = str(uuid.uuid4()); mapping[group["id"]] = gid; db.execute("INSERT INTO communication_groups VALUES(?,?,?,?)", (gid, aid, group["name"], now)); counts["communicationGroups"] += 1
                    for file in group["specificFiles"]:
                        fid = str(uuid.uuid4()); mapping[file["id"]] = fid; db.execute("INSERT INTO specific_files VALUES(?,?,?,?)", (fid, gid, file["name"], now)); counts["specificFiles"] += 1
                        for variation in file["variations"]:
                            config = json.dumps(normalize_config(variation["config"]), ensure_ascii=False, separators=(",", ":"))
                            vid = str(uuid.uuid4()); mapping[variation["id"]] = vid
                            db.execute("INSERT INTO variations(id,specific_file_id,name,config_json,file_index,revision,created_at) VALUES(?,?,?,?,?,?,?)",
                                       (vid, fid, variation["name"], config, variation["fileIndex"], 1, now)); counts["variations"] += 1
        from .library import ensure_schema
        if "library" in backup:
            library = backup["library"]
            for item in library["nodes"]: mapping.setdefault(item["id"], str(uuid.uuid4()))
            for backing_id in library["backingIds"]: db.execute("INSERT INTO library_backing VALUES(?)", (mapping[backing_id],))
            pending = list(library["nodes"])
            inserted = set()
            while pending:
                available = [item for item in pending if item["parent_id"] is None or item["parent_id"] in inserted]
                if not available: raise ValueError("Ciclo na biblioteca do backup.")
                for item in available:
                    db.execute("INSERT INTO library_nodes(id,parent_id,kind,name,deleted_at,created_at) VALUES(?,?,?,?,?,?)",
                               (mapping[item["id"]], mapping[item["parent_id"]] if item["parent_id"] else None, item["kind"], item["name"], item["deleted_at"], now))
                    inserted.add(item["id"]);pending.remove(item)
        ensure_schema(db)
        theme = backup["settings"].get("theme")
        if theme in {"light", "dark", "system"}: db.execute("INSERT INTO user_settings VALUES('theme',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json", (json.dumps(theme),))
    return counts


def publish_xml(variation_id: str, expected_revision: int, file_name: str, xml: str) -> dict:
    if not isinstance(file_name, str) or len(file_name) > 180 or not file_name.lower().endswith(".xml"):
        raise ValueError("Nome de arquivo XML inválido.")
    if file_name in {".", ".."} or re.search(r'[<>:"/\\|?*\x00-\x1f]', file_name) or file_name.endswith((".", " ")):
        raise ValueError("Nome de arquivo XML inválido.")
    stem = file_name.rsplit(".", 1)[0].casefold()
    if re.fullmatch(r"(?:con|prn|aux|nul|com[1-9]|lpt[1-9])", stem):
        raise ValueError("Nome reservado pelo Windows.")
    if not isinstance(xml, str):
        raise ValueError("O XML gerado deve ser texto.")
    content = xml.encode("utf-8")
    if len(content) > 100_000_000:
        raise ValueError("O XML gerado excede o limite de 100 MB.")
    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)", content, flags=re.IGNORECASE):
        raise ValueError("DOCTYPE e entidades não são aceitos.")
    try:
        ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"O motor produziu XML inválido: {exc}") from exc

    now, artifact_id = datetime.now(timezone.utc).isoformat(), str(uuid.uuid4())
    data_root = data_directory()
    artifact_dir = data_root / "Gerados" / artifact_id
    artifact_path = artifact_dir / file_name
    relative_path = f"{artifact_id}/{file_name}"
    digest = hashlib.sha256(content).hexdigest()
    artifact_dir.mkdir(parents=True, exist_ok=False)
    try:
        with artifact_path.open("xb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        with connect() as db:
            cursor = db.execute("UPDATE variations SET file_index=file_index+1,revision=revision+1 WHERE id=? AND revision=?", (variation_id, expected_revision))
            if cursor.rowcount != 1:
                exists = db.execute("SELECT revision FROM variations WHERE id=?", (variation_id,)).fetchone()
                if exists is None:
                    raise KeyError("Variação não encontrada.")
                raise RuntimeError("A variação mudou durante a geração. Recarregue antes de gerar novamente.")
            db.execute("INSERT INTO artifacts(id,variation_id,file_name,relative_path,sha256,byte_length,created_at) VALUES(?,?,?,?,?,?,?)",
                       (artifact_id, variation_id, file_name, relative_path, digest, len(content), now))
            revision = expected_revision + 1
            file_index = db.execute("SELECT file_index FROM variations WHERE id=?", (variation_id,)).fetchone()[0]
    except Exception:
        shutil.rmtree(artifact_dir, ignore_errors=True)
        raise
    return {"id": artifact_id, "variationId": variation_id, "fileName": file_name, "byteLength": len(content),
            "sha256": digest, "createdAt": now, "downloadUrl": f"/api/artifacts/{artifact_id}", "revision": revision,
            "fileIndex": file_index}


def get_artifact(artifact_id: str) -> tuple[dict, Path] | None:
    try:
        artifact_id = str(uuid.UUID(artifact_id))
    except (ValueError, AttributeError):
        return None
    with connect() as db:
        row = db.execute("SELECT id,variation_id,file_name,relative_path,sha256,byte_length,created_at FROM artifacts WHERE id=?", (artifact_id,)).fetchone()
    if row is None:
        return None
    artifact = dict(row)
    artifact_path = data_directory() / "Gerados" / artifact["id"] / artifact["file_name"]
    return artifact, artifact_path


def artifact_archive(variation_id: str, artifact_ids: list[str]) -> bytes:
    """Download selected published returns without changing their contents."""
    import io
    import zipfile
    if not artifact_ids or len(artifact_ids) > 20 or len(set(artifact_ids)) != len(artifact_ids):
        raise ValueError("Selecione entre 1 e 20 artefatos distintos.")
    members, size = [], 0
    for artifact_id in artifact_ids:
        result = get_artifact(artifact_id)
        if result is None or result[0]["variation_id"] != variation_id or not result[1].is_file():
            raise ValueError("Artefato não encontrado neste arquivo.")
        artifact, path = result
        size += artifact["byte_length"]
        if size > 100_000_000:
            raise ValueError("A exportação selecionada excede 100 MB.")
        members.append((artifact, path))
    output, names = io.BytesIO(), set()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for artifact, path in members:
            filename = artifact["file_name"]
            base, suffix = Path(filename).stem, 2
            while filename.casefold() in names:
                filename = f"{base}_{suffix}.xml"; suffix += 1
            names.add(filename.casefold())
            archive.write(path, filename)
    return output.getvalue()


def artifacts_for_variation(variation_id: str) -> list[dict]:
    try:
        variation_id = str(uuid.UUID(variation_id))
    except (ValueError, AttributeError):
        return []
    with connect() as db:
        rows = db.execute("SELECT id,file_name,byte_length,sha256,created_at FROM artifacts WHERE variation_id=? ORDER BY created_at DESC LIMIT 30", (variation_id,)).fetchall()
    return [{**dict(row), "downloadUrl": f"/api/artifacts/{row['id']}"} for row in rows]


def _manifest_root_id() -> str:
    manifest = json.loads((data_directory() / "mockaize-root.json").read_text(encoding="utf-8"))
    return str(uuid.UUID(manifest["rootId"]))


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024): digest.update(chunk)
    return digest.hexdigest()


def create_operational_backup() -> dict:
    root = data_directory()
    backup_root = root / "Backups"
    backup_root.mkdir(exist_ok=True)
    if _has_reparse_point(backup_root):
        raise OSError("ROOT_AMBIGUOUS: a pasta de backups é um ponto de redirecionamento.")
    backup_id = str(uuid.uuid4())
    staging = backup_root / ("." + backup_id + ".tmp")
    destination = backup_root / (backup_id + ".sqlite3")
    root_id = _manifest_root_id()
    try:
        with DB_LOCK:
            with connect() as source:
                target = sqlite3.connect(staging)
                try:
                    source.backup(target, pages=256, sleep=0.01)
                    check = target.execute("PRAGMA integrity_check").fetchone()[0]
                    if check != "ok":
                        raise sqlite3.DatabaseError("O snapshot SQLite não passou pela verificação de integridade.")
                finally:
                    target.close()
            with staging.open("rb+") as stream:
                os.fsync(stream.fileno())
            digest = _hash_file(staging)
            length = staging.stat().st_size
            os.replace(staging, destination)
            created = datetime.now(timezone.utc).isoformat()
            with connect() as db:
                db.execute("INSERT INTO operational_backups(id,sha256,byte_length,root_id,created_at) VALUES(?,?,?,?,?)",
                           (backup_id, digest, length, root_id, created))
    except Exception:
        for path in (staging, destination):
            try: path.unlink()
            except FileNotFoundError: pass
        raise
    return {"id": backup_id, "sha256": digest, "byteLength": length, "rootId": root_id,
            "createdAt": created, "downloadUrl": f"/api/backups/{backup_id}"}


def list_operational_backups() -> list[dict]:
    with connect() as db:
        rows = db.execute("SELECT id,sha256,byte_length,root_id,created_at FROM operational_backups ORDER BY created_at DESC").fetchall()
    return [{"id": row["id"], "sha256": row["sha256"], "byteLength": row["byte_length"],
             "rootId": row["root_id"], "createdAt": row["created_at"], "downloadUrl": f"/api/backups/{row['id']}"} for row in rows]


def get_operational_backup(backup_id: str) -> tuple[dict, Path] | None:
    try: backup_id = str(uuid.UUID(backup_id))
    except (ValueError, AttributeError): return None
    with connect() as db:
        row = db.execute("SELECT id,sha256,byte_length,root_id,created_at FROM operational_backups WHERE id=?", (backup_id,)).fetchone()
    if row is None: return None
    record = dict(row); path = data_directory() / "Backups" / (backup_id + ".sqlite3")
    if not path.is_file() or path.is_symlink() or _has_reparse_point(path): return None
    return record, path


def restore_operational_backup(backup_id: str) -> dict:
    try: backup_id = str(uuid.UUID(backup_id))
    except (ValueError, AttributeError) as exc: raise ValueError("Identificador de backup inválido.") from exc
    root = data_directory(); live = root / "mockaize.sqlite3"; backup_root = root / "Backups"
    backup_root.mkdir(exist_ok=True)
    if _has_reparse_point(backup_root): raise OSError("ROOT_AMBIGUOUS: a pasta de backups é um ponto de redirecionamento.")
    staging = backup_root / (".restore-" + str(uuid.uuid4()) + ".tmp")
    rollback = backup_root / (".rollback-" + str(uuid.uuid4()) + ".tmp")
    with DB_LOCK:
        try:
            record_path = get_operational_backup(backup_id)
            if record_path is None: raise KeyError("Snapshot não encontrado.")
            record, source_path = record_path
            if record["root_id"] != _manifest_root_id(): raise ValueError("ROOT_ID_MISMATCH: o snapshot pertence a outra raiz.")
            if _hash_file(source_path) != record["sha256"] or source_path.stat().st_size != record["byte_length"]:
                raise ValueError("BACKUP_CORRUPT: o hash do snapshot não confere.")
            source = sqlite3.connect(source_path)
            try:
                integrity = source.execute("PRAGMA integrity_check").fetchone()[0]
                tables = {row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                meta = dict(source.execute("SELECT key,value FROM app_meta").fetchall()) if "app_meta" in tables else {}
                version = source.execute("SELECT value FROM schema_meta WHERE key='version'").fetchone()[0] if "schema_meta" in tables else None
                if integrity != "ok" or meta.get("root_id") != record["root_id"] or version != "2":
                    raise ValueError("BACKUP_CORRUPT: identidade, schema ou integridade do snapshot não confere.")
                required = {"workspaces", "applications", "communication_groups", "specific_files", "variations", "artifacts", "user_settings"}
                if not required.issubset(tables): raise ValueError("BACKUP_CORRUPT: schema incompleto.")
                target = sqlite3.connect(staging)
                try:
                    source.backup(target, pages=256, sleep=0.01)
                    if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise sqlite3.DatabaseError("A cópia de restauração não passou na verificação de integridade.")
                finally: target.close()
            finally: source.close()
            live_source = sqlite3.connect(live); rollback_target = sqlite3.connect(rollback)
            try: live_source.backup(rollback_target, pages=256, sleep=0.01)
            finally: rollback_target.close(); live_source.close()
            with connect() as db: db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            try:
                os.replace(staging, live)
                check = sqlite3.connect(live)
                try:
                    valid = check.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
                    root_meta = dict(check.execute("SELECT key,value FROM app_meta").fetchall()).get("root_id")
                    if not valid or root_meta != record["root_id"]: raise sqlite3.DatabaseError("A validação pós-restauração falhou.")
                finally: check.close()
                with connect() as db:
                    from .library import ensure_schema
                    ensure_schema(db)
                    db.execute("INSERT OR IGNORE INTO operational_backups(id,sha256,byte_length,root_id,created_at) VALUES(?,?,?,?,?)",
                               (record["id"], record["sha256"], record["byte_length"], record["root_id"], record["created_at"]))
            except Exception:
                if rollback.exists(): os.replace(rollback, live)
                raise
        finally:
            for path in (staging, rollback):
                try: path.unlink()
                except FileNotFoundError: pass
    return {"restoredBackupId": backup_id, "rootId": record["root_id"], "restoredAt": datetime.now(timezone.utc).isoformat()}
