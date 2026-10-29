import copy
import hashlib
import json
import tempfile
import sys
import threading
import unittest
from pathlib import Path
from runtime_support import cleanup_temporary
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mockaize import preset_codec as codec, storage

FIXTURES = Path(__file__).parent / "fixtures" / "preset-v1"
META = {"id": "fixture-1", "name": "São & XML", "libraryPath": "Equipe/Pasta", "revision": 3, "fileIndex": 0, "active": True}
CONTEXT = {"timeZone": "America/Fortaleza"}
PATH = json.dumps([{"name": "R", "ns": "urn:example", "index": 1}, {"name": "N", "ns": "urn:example", "index": 1}], separators=(",", ":"))


def complete_config():
    formulas = [{"type": name} for name in sorted(storage.GENERATOR_TYPES - {"compose"})]
    formulas.append({"type": "compose", "operation": "sum", "parts": [{"type": "literal", "value": "1.25"}, {"type": "literal", "value": "2.75"}]})
    for formula in formulas:
        if formula["type"] in ("copy", "field", "groupSum"):
            formula["path"] = PATH
        if formula["type"] == "groupSum":
            formula["group"] = json.dumps(json.loads(PATH)[:1], separators=(",", ":"))
        if formula["type"] == "literal":
            formula["value"] = "São ]]> < & \r\n\t"
    rules = {PATH.replace('"N"', f'"N{i}"'): {"generator": formula} for i, formula in enumerate(formulas)}
    config = storage.normalize_config({"inputXml": '<R xmlns="urn:example"><N a="&amp;">1</N><N>2</N></R>',
        "outputXml": '<R xmlns="urn:example"><N/></R>', "baseDate": "2026-10-27",
        "rulesByMode": {"new": rules, "return": rules},
        "inputNotes": {"types": [False, None, 0, -2, 1.5, "", "001", {"type": "literal", "value": "ordinary object"}]}})
    config["filterPresets"] = [{"id": "f1", "name": "Filtro", "filter": copy.deepcopy(config["filter"])}]
    config["activeFilterPresetId"] = "f1"
    config["manual"]["formulas"] = {PATH: formulas[-1]}
    config["manual"]["filename"] = {"type": "literal", "value": "manual"}
    config["returnModels"] = [{"id": f"r{i}", "name": f"Retorno {i}", "selected": bool(i), "outputXml": "<R><N/></R>", "outputGroup": "", "rules": rules,
        "presence": {}, "filename": {"type": "count"}, "outputNotes": {}, "headers": []} for i in (1, 2)]
    config["activeReturnId"] = "r1"
    return storage.normalize_config(config)


class PresetCodecCase(unittest.TestCase):
    def test_rejects_ids_and_time_zones_the_api_cannot_consume(self):
        config = storage.normalize_config({})
        for identifier in ('../other', 'CON', 'with.dot', 'x' * 129):
            with self.subTest(identifier=identifier), self.assertRaises(codec.PresetError):
                codec.encode_preset({**META, 'id': identifier}, config, CONTEXT)
        with self.assertRaises(codec.PresetError):
            codec.encode_preset(META, config, {'timeZone': 'Mars/Olympus'})

    def test_full_roundtrip_all_modes_and_twenty_formulas(self):
        config = complete_config()
        for mode in ("new", "return", "manual", "filter"):
            with self.subTest(mode=mode):
                config["mode"] = mode
                xml = codec.encode_preset(META, config, CONTEXT)
                decoded = codec.decode_preset(xml)
                self.assertEqual(decoded, {"metadata": META, "configuration": config, "context": CONTEXT})
                self.assertIn(b'kind="formula"', xml)
                self.assertIn(b"<compose>", xml)
                self.assertIn(b"&#13;", xml)
                root = ET.fromstring(xml)
                types = {child.tag.split("}")[-1] for child in root.iter() if child.tag.split("}")[-1] in storage.GENERATOR_TYPES}
                self.assertEqual(types, storage.GENERATOR_TYPES)

    def test_known_fixture_and_independent_canonical_hash(self):
        for name in ("minimal", "complete"):
            with self.subTest(fixture=name):
                payload = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
                xml = (FIXTURES / f"{name}.mockaize.xml").read_bytes()
                expected = (FIXTURES / f"{name}.sha256").read_text().strip()
                canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
                self.assertEqual(hashlib.sha256(canonical).hexdigest(), expected)
                self.assertEqual(codec.decode_preset(xml), payload)
                self.assertEqual(codec.encode_preset(**payload), xml)

    def test_multiple_templates_above_http_input_limit(self):
        config = complete_config()
        for model in config["returnModels"]:
            model["outputXml"] = "<R>" + "x" * 1_100_000 + "</R>"
        config = storage.normalize_config(config)
        xml = codec.encode_preset(META, config, CONTEXT)
        self.assertGreater(len(xml), 2_000_000)
        self.assertEqual(codec.decode_preset(xml)["configuration"], config)

    def test_rejects_malformed_wire_types_structure_versions_and_hash(self):
        xml = codec.encode_preset(META, complete_config(), CONTEXT)
        mutations = [xml.replace(b'schemaVersion="1"', b'schemaVersion="2"', 1),
            xml.replace(b'kind="boolean">true', b'kind="boolean">TRUE', 1),
            xml.replace(b'kind="number">0', b'kind="number">NaN', 1),
            xml.replace(b'kind="null" />', b'kind="null">x</Value>', 1),
            xml.replace(b'kind="string"', b'kind="unknown"', 1),
            xml.replace(b'<Metadata>', b'<Metadata extra="1">', 1),
            xml.replace(b'<Property name="active">', b'<Property name="id">', 1),
            xml.replace(b'<cpf />', b'<unknown />', 1),
            xml.replace('São'.encode(), b'Wrong', 1),
            xml.replace(b'<Context>', b'<Context><!--ignored?-->', 1),
            xml.replace(b'<Value kind="object">', b'<Value kind="formula">', 1)]
        for index, bad in enumerate(mutations):
            with self.subTest(index=index), self.assertRaises(codec.PresetError):
                codec.decode_preset(bad)

    def test_dtd_and_alternate_encodings_are_rejected(self):
        xml = codec.encode_preset(META, storage.normalize_config({}), CONTEXT).decode()
        for bad in ('<!DOCTYPE x [<!ENTITY x "bad">]>' + xml, xml.encode('utf-16'), xml.replace('utf-8', 'iso-8859-1').encode()):
            with self.subTest(value=type(bad).__name__), self.assertRaises(codec.PresetError):
                codec.decode_preset(bad)

    def test_non_json_values_and_bad_metadata_rejected(self):
        for value in (float("nan"), float("inf"), (1, 2), {1: "bad"}, "bad\x01", "bad\ud800"):
            config = storage.normalize_config({})
            config["inputNotes"]["bad"] = value
            with self.subTest(value=str(value)), self.assertRaises(codec.PresetError):
                codec.encode_preset(META, config, CONTEXT)
        with self.assertRaises(codec.PresetError):
            codec.encode_preset({**META, "revision": True}, storage.normalize_config({}), CONTEXT)


class PresetStoreCase(unittest.TestCase):
    def setUp(self):
        from mockaize import preset_store
        self.store = preset_store
        parent = Path(__file__).resolve().parents[1] / ".test-runtime"
        parent.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="presets-", dir=parent)
        self.docs = Path(self.temp.name) / "Documents"
        self.docs.mkdir()
        self.override = patch.object(storage, "documents_directory", return_value=self.docs)
        self.override.start()
        storage.initialize()
        with storage.connect() as db:
            db.execute("CREATE TABLE sync_probe(revision INTEGER NOT NULL, value INTEGER NOT NULL)")
            db.execute("INSERT INTO sync_probe VALUES(0,0)")
        self.root = storage.presets_directory()

    def tearDown(self):
        self.override.stop()
        cleanup_temporary(self.temp)

    def _save(self, expected, value, *, rotate=True, name="Arquivo", catalog_wide=False):
        def mutate(db):
            cursor = db.execute("UPDATE sync_probe SET revision=revision+1,value=? WHERE revision=?", (value, expected))
            if cursor.rowcount != 1:
                raise RuntimeError("revision conflict")
            revision = expected + 1
            config = storage.normalize_config({"inputNotes": {"value": value}})
            update = self.store.PresetUpdate({**META, "name": name, "revision": revision}, config, CONTEXT, rotate)
            return {"revision": revision, "value": value}, [update]
        return self.store.run_operation(mutate, kind="config-save" if rotate else "metadata", catalog_wide=catalog_wide)

    def _current(self):
        return codec.decode_preset((self.root / "fixture-1.mockaize.xml").read_bytes())

    def _old(self):
        path = self.root / "fixture-1.OLD.mockaize.xml"
        return path.read_bytes() if path.exists() else None

    def _revision(self):
        with storage.connect() as db:
            return db.execute("SELECT revision FROM sync_probe").fetchone()[0]

    def test_three_saves_and_metadata_preserve_exact_previous_configuration(self):
        self._save(0, 1)
        first = (self.root / "fixture-1.mockaize.xml").read_bytes()
        self.assertIsNone(self._old())
        self._save(1, 2)
        second = (self.root / "fixture-1.mockaize.xml").read_bytes()
        self.assertEqual(self._old(), first)
        self._save(2, 3)
        self.assertEqual(self._old(), second)
        self._save(3, 3, rotate=False, name="Renomeado")
        self.assertEqual(self._old(), second)
        self.assertEqual(self._current()["metadata"]["revision"], 4)
        self.assertEqual(self._current()["metadata"]["name"], "Renomeado")
        self._save(4, 3)  # Re-saving identical rules also keeps the sole OLD.
        self.assertEqual(self._old(), second)
        self.assertEqual(list((self.root / ".sync").iterdir()), [])
        self.assertEqual(list(self.root.glob(".*.tmp")), [])

    def test_boolean_to_number_edit_rotates_old_without_losing_json_types(self):
        self._save(0, False)
        before = (self.root / 'fixture-1.mockaize.xml').read_bytes()
        self._save(1, 0)
        self.assertEqual(self._old(), before)
        self.assertIs(type(self._current()['configuration']['inputNotes']['value']), int)

    def test_unpublished_temporary_is_ignored_and_cleaned_with_windows_casing(self):
        import uuid
        temporary = self.root / '.sync' / (str(uuid.uuid4()).upper() + '.PENDING.JSON.tmp')
        temporary.write_bytes(b'incomplete unpublished journal')
        self.assertFalse(self.store.pending(self.root))
        self.store.recover()
        self.assertFalse(temporary.exists())

    def test_excessively_nested_journal_preserves_pending_with_actionable_error(self):
        import uuid
        path = self.root / '.sync' / (str(uuid.uuid4()) + '.pending.json')
        path.write_text('[' * 2000 + '0' + ']' * 2000, encoding='utf-8')
        with self.assertRaises(self.store.PresetSyncError):
            self.store.pending(self.root)
        with self.assertRaises(self.store.PresetSyncError):
            self.store.recover()
        self.assertTrue(path.exists())

    def test_faults_before_and_after_commit_recover_on_restart(self):
        self._save(0, 1)
        for phase in ("journal_ready", "before_commit", "after_commit", "published_current", "published_old", "before_finalize"):
            with self.subTest(phase=phase):
                revision = self._revision()
                before = (self.root / "fixture-1.mockaize.xml").read_bytes()
                old = self._old()
                value = self._current()["configuration"]["inputNotes"]["value"] + 1
                fired = []
                def fail(current):
                    if current == phase and not fired:
                        fired.append(True)
                        raise OSError("injected disk failure")
                with patch.object(self.store, "_checkpoint", side_effect=fail):
                    with self.assertRaises(self.store.PresetSyncError) as raised:
                        self._save(revision, value)
                self.assertTrue(fired)
                committed = phase not in ("journal_ready", "before_commit")
                self.assertEqual(raised.exception.committed, committed)
                self.assertEqual(raised.exception.revisions, {"fixture-1": revision + 1} if committed else {})
                self.assertTrue(self.store.pending(self.root, "fixture-1"))
                self.assertTrue(self.store.pending(self.root))
                self.assertFalse(self.store.pending(self.root, "another-id"))
                storage.initialize()
                self.assertFalse(self.store.pending(self.root))
                self.assertEqual(self._revision(), revision + int(committed))
                if committed:
                    self.assertEqual(self._current()["configuration"]["inputNotes"]["value"], value)
                    self.assertEqual(self._old(), before)
                else:
                    self.assertEqual((self.root / "fixture-1.mockaize.xml").read_bytes(), before)
                    self.assertEqual(self._old(), old)
                self.store.recover()  # A second recovery is idempotent.

    def test_revision_conflict_leaves_database_and_files_unchanged(self):
        self._save(0, 1)
        before = {str(path.relative_to(self.root)): path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        with self.assertRaisesRegex(RuntimeError, "revision conflict"):
            self._save(0, 2)
        self.assertEqual(self._revision(), 1)
        self.assertEqual({str(path.relative_to(self.root)): path.read_bytes() for path in self.root.rglob("*") if path.is_file()}, before)
        with patch.object(self.store, "_checkpoint", side_effect=OSError("prepare denied")):
            with self.assertRaises(OSError):
                self._save(1, 2)
        self.assertEqual(self._revision(), 1)
        self.assertFalse(self.store.pending(self.root))

    def test_concurrent_revision_writers_do_not_mix_old_snapshots(self):
        self._save(0, 1)
        first = (self.root / "fixture-1.mockaize.xml").read_bytes()
        barrier = threading.Barrier(2)
        results = []
        def writer(value):
            barrier.wait()
            try:
                results.append(self._save(1, value))
            except RuntimeError as exc:
                results.append(str(exc))
        threads = [threading.Thread(target=writer, args=(value,)) for value in (2, 3)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)
            self.assertFalse(thread.is_alive())
        self.assertEqual(sum(isinstance(item, dict) for item in results), 1)
        self.assertIn("revision conflict", results)
        self.assertEqual(self._revision(), 2)
        self.assertEqual(self._old(), first)
        self.assertEqual(self._current()["configuration"]["inputNotes"]["value"], next(item["value"] for item in results if isinstance(item, dict)))

    def _leave_pending(self, *, catalog_wide=False):
        self._save(0, 1)
        def fail(phase):
            if phase == "after_commit":
                raise OSError("injected crash")
        with patch.object(self.store, "_checkpoint", side_effect=fail):
            with self.assertRaises(self.store.PresetSyncError):
                self._save(1, 2, catalog_wide=catalog_wide)
        return next((self.root / ".sync").glob("*.pending.json"))

    def test_catalog_wide_pending_and_read_only_check(self):
        journal = self._leave_pending(catalog_wide=True)
        before = {str(path): path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        self.assertTrue(self.store.pending(self.root, "another-id"))
        self.assertTrue(self.store.pending(self.root))
        self.assertEqual({str(path): path.read_bytes() for path in self.root.rglob("*") if path.is_file()}, before)
        self.assertTrue(journal.exists())
        self.store.recover()

    def test_corrupt_recovery_payload_preserves_pending_and_current(self):
        journal_path = self._leave_pending()
        journal = json.loads(journal_path.read_bytes())
        before = (self.root / "fixture-1.mockaize.xml").read_bytes()
        after = self.root / journal["files"][0]["after"]["staged"]
        original = after.read_bytes()
        after.write_bytes(b"corrupt")
        with self.assertRaises(self.store.PresetSyncError):
            storage.initialize()
        self.assertTrue(journal_path.exists())
        self.assertEqual((self.root / "fixture-1.mockaize.xml").read_bytes(), before)
        after.write_bytes(original)
        self.store.recover()
        self.assertEqual(self._current()["configuration"]["inputNotes"]["value"], 2)

    def test_journal_traversal_wrong_root_and_marker_hash_fail_closed(self):
        journal_path = self._leave_pending()
        original = journal_path.read_bytes()
        sentinel = self.root.parent / "sentinel.txt"
        sentinel.write_bytes(b"preserve")
        for change in ("path", "root", "hash", "duplicate"):
            with self.subTest(change=change):
                journal = json.loads(original)
                if change == "path":
                    journal["files"][0]["final"] = "../sentinel.txt"
                elif change == "root":
                    journal["rootId"] = "00000000-0000-0000-0000-000000000000"
                elif change == "hash":
                    journal["files"][0]["after"]["sha256"] = "0" * 64
                else:
                    journal["files"].append(journal["files"][0])
                journal_path.write_text(json.dumps(journal), encoding="utf-8")
                with self.assertRaises(self.store.PresetSyncError):
                    self.store.recover()
                if change in ("path", "duplicate"):
                    with self.assertRaises(self.store.PresetSyncError):
                        self.store.pending(self.root)
                self.assertEqual(sentinel.read_bytes(), b"preserve")
                self.assertTrue(journal_path.exists())
        journal_path.write_bytes(original)
        self.store.recover()

    def test_cleanup_after_journal_removal_is_safe_residue(self):
        self._save(0, 1)
        def fail(phase):
            if phase == "journal_removed":
                raise OSError("cleanup denied")
        with patch.object(self.store, "_checkpoint", side_effect=fail):
            result = self._save(1, 2)
        self.assertEqual(result["revision"], 2)
        self.assertFalse(self.store.pending(self.root))
        storage.initialize()
        self.assertEqual(list(self.root.glob(".*.tmp")), [])
        with storage.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM preset_sync_commits").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT value FROM schema_meta WHERE key='version'").fetchone()[0], "2")

    def test_batch_partial_publication_recovers_all_ids(self):
        def mutate(db):
            db.execute("UPDATE sync_probe SET revision=1,value=10")
            config = storage.normalize_config({"inputNotes": {"batch": 10}})
            return "batch", [self.store.PresetUpdate({**META, "id": identifier}, config, CONTEXT)
                              for identifier in ("fixture-1", "fixture-2")]
        def fail(phase):
            if phase == "published_current":
                raise OSError("crash after first batch member")
        with patch.object(self.store, "_checkpoint", side_effect=fail):
            with self.assertRaises(self.store.PresetSyncError):
                self.store.run_operation(mutate, kind="batch", catalog_wide=True)
        self.assertTrue((self.root / "fixture-1.mockaize.xml").exists())
        self.assertFalse((self.root / "fixture-2.mockaize.xml").exists())
        self.assertTrue(self.store.pending(self.root, "fixture-2"))
        self.assertTrue(self.store.pending(self.root, "unlisted-id"))
        storage.initialize()
        for identifier in ("fixture-1", "fixture-2"):
            payload = codec.decode_preset((self.root / f"{identifier}.mockaize.xml").read_bytes())
            self.assertEqual(payload["metadata"]["id"], identifier)
            self.assertEqual(payload["configuration"]["inputNotes"]["batch"], 10)
        self.assertFalse(self.store.pending(self.root))

    def test_unavailable_database_and_sync_directory_preserve_pending(self):
        journal_path = self._leave_pending()
        before = {str(path): path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        with patch.object(storage, "connect", side_effect=OSError("database inaccessible")):
            with self.assertRaises(self.store.PresetSyncError):
                self.store.recover()
        self.assertTrue(journal_path.exists())
        self.assertEqual({str(path): path.read_bytes() for path in self.root.rglob("*") if path.is_file()}, before)
        original = Path.lstat
        def inaccessible(path, *args, **kwargs):
            if path == self.root / ".sync":
                raise PermissionError("sync inaccessible")
            return original(path, *args, **kwargs)
        with patch.object(Path, "lstat", inaccessible):
            with self.assertRaises(self.store.PresetSyncError):
                self.store.pending(self.root)
        self.store.recover()

    def test_local_directory_override_is_absolute_and_outside_database(self):
        config = storage.data_directory() / "presets-config.json"
        target = Path(self.temp.name) / "Presets compartilháveis"
        config.write_text(json.dumps({"presetsDirectory": str(target)}, ensure_ascii=False), encoding="utf-8")
        self.assertEqual(storage.presets_directory(), target)
        self._save(0, 1)
        self.assertTrue((target / "fixture-1.mockaize.xml").is_file())
        config.write_text('{"presetsDirectory":"relative"}', encoding="utf-8")
        with self.assertRaises(ValueError):
            storage.presets_directory()
        config.write_text('{"presetsDirectory":false}', encoding="utf-8")
        with self.assertRaises(ValueError):
            storage.presets_directory()


class PresetIntegrationCase(unittest.TestCase):
    def setUp(self):
        from mockaize import library, preset_store
        self.library, self.store = library, preset_store
        parent = Path(__file__).resolve().parents[1] / ".test-runtime"
        parent.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="preset-integration-", dir=parent)
        self.override = patch.object(storage, "documents_directory", return_value=Path(self.temp.name) / "Documents")
        self.override.start()
        storage.initialize()
        self.root = storage.presets_directory()
        self.workspace = self.create("workspace", "Equipe")
        self.folder = self.create("folder", "Pasta", self.workspace)
        self.variation = self.create("variation", "Arquivo", self.folder)

    def tearDown(self):
        self.override.stop()
        cleanup_temporary(self.temp)

    def create(self, kind, name, parent=None):
        return self.library.command({"action": "create", "kind": kind, "name": name, "parentId": parent})["id"]

    def current(self, identifier=None):
        return codec.decode_preset((self.root / f"{identifier or self.variation}.mockaize.xml").read_bytes())

    def old(self, identifier=None):
        path = self.root / f"{identifier or self.variation}.OLD.mockaize.xml"
        return path.read_bytes() if path.exists() else None

    def save(self, value):
        revision = storage.get_variation(self.variation)["revision"]
        return storage.save_variation(self.variation, revision, {"inputNotes": {"value": value}})

    def test_real_saves_previous_old_snapshot_and_conflict(self):
        first = self.save("first")
        one = (self.root / f"{self.variation}.mockaize.xml").read_bytes()
        two = self.save("second")
        second = (self.root / f"{self.variation}.mockaize.xml").read_bytes()
        self.assertEqual(self.old(), one)
        third = self.save("third")
        self.assertEqual(self.old(), second)
        self.assertEqual(codec.decode_preset(one)["configuration"]["inputNotes"]["value"], "first")
        self.assertEqual(self.current()["configuration"], third["config"])
        self.assertEqual([first["revision"], two["revision"], third["revision"]], [2, 3, 4])
        current, old = (self.root / f"{self.variation}.mockaize.xml").read_bytes(), self.old()
        with self.assertRaises(RuntimeError):
            storage.save_variation(self.variation, 2, {"inputNotes": {"value": "conflict"}}, name="wrong")
        self.assertEqual((self.root / f"{self.variation}.mockaize.xml").read_bytes(), current)
        self.assertEqual(self.old(), old)
        self.assertEqual(storage.get_variation(self.variation)["name"], "Arquivo")

    def test_ancestor_rename_move_copy_many_delete_tombstones(self):
        self.save("one")
        self.save("two")
        old = self.old()
        revision = self.current()["metadata"]["revision"]
        self.library.command({"action": "rename", "id": self.folder, "name": "Renomeada"})
        self.assertEqual(self.current()["metadata"]["libraryPath"], "Equipe/Renomeada")
        destination = self.create("folder", "Destino", self.workspace)
        self.library.command({"action": "move", "id": self.folder, "parentId": destination})
        self.assertEqual(self.current()["metadata"]["libraryPath"], "Equipe/Destino/Renomeada")
        self.assertEqual(self.current()["metadata"]["revision"], revision)
        self.assertEqual(self.old(), old)
        copied = self.library.command({"action": "copy_many", "ids": [self.folder], "parentId": self.workspace})
        nodes = copied["library"]["nodes"]
        copy_id = next(node["id"] for node in nodes if node["kind"] == "variation" and node["id"] != self.variation)
        copy = self.current(copy_id)
        self.assertEqual(copy["metadata"]["libraryPath"], "Equipe/Renomeada")
        self.assertEqual(copy["configuration"], self.current()["configuration"])
        self.assertIsNone(self.old(copy_id))
        self.library.command({"action": "delete_many", "ids": [destination], "confirm": True})
        self.assertFalse(self.current()["metadata"]["active"])
        self.assertTrue(self.current(copy_id)["metadata"]["active"])
        self.assertIsNone(storage.get_variation(self.variation))
        self.assertEqual(self.old(), old)
        storage.initialize()
        self.assertFalse(self.current()["metadata"]["active"])

    def test_legacy_create_entity_publishes_same_ids_and_library_path(self):
        parent = storage.create_entity("workspace", None, "Legado")["id"]
        for kind, name in (("application", "Aplicação"), ("communication_group", "Grupo"), ("specific_file", "Arquivo")):
            parent = storage.create_entity(kind, parent, name)["id"]
        variation = storage.create_entity("variation", parent, "Variação")["id"]
        current = self.current(variation)
        self.assertEqual(current["metadata"]["id"], variation)
        self.assertEqual(current["metadata"]["libraryPath"], "Legado/Aplicação/Grupo/Arquivo")
        self.assertTrue(current["metadata"]["active"])
        self.assertIsNone(self.old(variation))

    def test_publish_and_timezone_update_metadata_without_rotating_old(self):
        self.save("one")
        self.save("two")
        old = self.old()
        revision = storage.get_variation(self.variation)["revision"]
        artifact = storage.publish_xml(self.variation, revision, "saida.xml", "<R><N>1</N></R>")
        current = self.current()
        self.assertEqual(current["metadata"]["revision"], artifact["revision"])
        self.assertEqual(current["metadata"]["fileIndex"], 1)
        self.assertEqual(self.old(), old)
        self.assertEqual(current["context"], {"timeZone": "America/Fortaleza"})
        storage.save_settings({"timeZone": "America/Sao_Paulo"})
        self.assertEqual(self.current()["context"], {"timeZone": "America/Sao_Paulo"})
        self.assertEqual(self.current()["metadata"], current["metadata"])
        self.assertEqual(self.current()["configuration"], current["configuration"])
        self.assertEqual(self.old(), old)
        with self.assertRaises(ValueError):
            storage.save_settings({"timeZone": "not a timezone"})
        before = (self.root / f"{self.variation}.mockaize.xml").read_bytes()
        with self.assertRaisesRegex(ValueError, "desconhecido"):
            storage.save_settings({"timeZone": "Mars/Olympus"})
        self.assertEqual(storage.get_settings()["timeZone"], "America/Sao_Paulo")
        self.assertEqual((self.root / f"{self.variation}.mockaize.xml").read_bytes(), before)
        self.assertEqual(self.old(), old)

    def test_committed_real_save_recovers_without_reapplying_mutation(self):
        self.save("before")
        def fail(phase):
            if phase == "after_commit":
                raise OSError("disk blocked")
        with patch.object(self.store, "_checkpoint", side_effect=fail):
            with self.assertRaises(self.store.PresetSyncError) as raised:
                self.save("after")
        self.assertTrue(raised.exception.committed)
        self.assertEqual(raised.exception.revisions, {self.variation: 3})
        self.assertEqual(self.current()["configuration"]["inputNotes"]["value"], "before")
        self.assertTrue(self.store.pending(self.root, self.variation))
        storage.initialize()
        self.assertEqual(self.current()["configuration"]["inputNotes"]["value"], "after")
        self.assertEqual(storage.get_variation(self.variation)["revision"], 3)
        self.assertEqual(self.current()["metadata"]["revision"], 3)

    def test_committed_artifact_keeps_file_during_pending_recovery(self):
        revision = storage.get_variation(self.variation)["revision"]
        def fail(phase):
            if phase == "after_commit":
                raise OSError("preset disk blocked")
        with patch.object(self.store, "_checkpoint", side_effect=fail):
            with self.assertRaises(self.store.PresetSyncError):
                storage.publish_xml(self.variation, revision, "saida.xml", "<R>kept</R>")
        artifacts = storage.artifacts_for_variation(self.variation)
        self.assertEqual(len(artifacts), 1)
        record, path = storage.get_artifact(artifacts[0]["id"])
        self.assertEqual(path.read_bytes(), b"<R>kept</R>")
        storage.initialize()
        self.assertEqual(self.current()["metadata"]["fileIndex"], 1)
        self.assertEqual(storage.get_variation(self.variation)["file_index"], 1)
        with self.assertRaises(RuntimeError):
            storage.publish_xml(self.variation, revision, "conflict.xml", "<R/>")
        self.assertEqual(len(list((storage.data_directory() / "Gerados").iterdir())), 1)

    def test_legacy_backfill_is_idempotent_and_keeps_first_current_without_old(self):
        current_path = self.root / f"{self.variation}.mockaize.xml"
        current_path.unlink()
        with storage.connect() as db:
            db.execute("DELETE FROM app_meta WHERE key IN ('presets_backfill_v1','presets_upgrade_backup')")
        before = storage.get_variation(self.variation)

        storage.initialize()

        current = self.current()
        self.assertEqual(current["configuration"], storage.normalize_config(before["config"]))
        self.assertEqual(current["metadata"]["revision"], before["revision"])
        self.assertIsNone(self.old())
        with storage.connect() as db:
            backup_id = db.execute("SELECT value FROM app_meta WHERE key='presets_upgrade_backup'").fetchone()[0]
            self.assertEqual(db.execute("SELECT value FROM app_meta WHERE key='presets_backfill_v1'").fetchone()[0], "1")
        archive_path = storage.data_directory() / "Backups" / f"{backup_id}.presets.zip"
        self.assertTrue(archive_path.is_file())
        first_bytes = current_path.read_bytes()
        storage.initialize()
        self.assertEqual(current_path.read_bytes(), first_bytes)
        self.assertIsNone(self.old())
        self.assertEqual(storage.get_variation(self.variation)["revision"], before["revision"])

    def test_import_publishes_new_ids_with_imported_configuration(self):
        self.save("shared configuration")
        backup = storage.export_workspace_backup()
        existing = {path.stem.removesuffix(".OLD") for path in self.root.glob("*.mockaize.xml")}

        result = storage.import_workspace_backup(backup)

        self.assertEqual(result["variations"], 1)
        imported = [path for path in self.root.glob("*.mockaize.xml")
                    if path.stem.removesuffix(".OLD") not in existing and ".OLD." not in path.name]
        self.assertEqual(len(imported), 1)
        imported_preset = codec.decode_preset(imported[0].read_bytes())
        self.assertEqual(imported_preset["configuration"], self.current()["configuration"])
        self.assertEqual(imported_preset["metadata"]["revision"], 1)
        self.assertIsNone(self.old(imported_preset["metadata"]["id"]))

    def test_restore_tombstones_newer_preset_and_recovers_pending_swap(self):
        snapshot = storage.create_operational_backup()
        extra = self.create("variation", "Criada depois", self.folder)
        self.assertTrue((self.root / f"{extra}.mockaize.xml").is_file())
        def fail(phase):
            if phase == "after_database_swap":
                raise OSError("simulated interruption after database swap")

        with patch.object(self.store, "_checkpoint", side_effect=fail):
            with self.assertRaises(self.store.PresetSyncError) as raised:
                storage.restore_operational_backup(snapshot["id"])
        self.assertTrue(raised.exception.committed)
        self.assertTrue(self.store.pending(self.root))
        rollback_files = list((storage.data_directory() / "Backups").glob(".rollback-*.tmp"))
        self.assertEqual(len(rollback_files), 1)

        storage.initialize()

        self.assertIsNone(storage.get_variation(extra))
        tombstone = self.current(extra)
        self.assertFalse(tombstone["metadata"]["active"])
        self.assertFalse(self.store.pending(self.root))
        self.assertEqual(list((storage.data_directory() / "Backups").glob(".rollback-*.tmp")), [])
        self.assertEqual(storage.get_variation(self.variation)["revision"], 1)


if __name__ == "__main__":
    unittest.main()
