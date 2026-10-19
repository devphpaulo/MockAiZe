from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from mockaize import powershell_export, server, storage, library
from mockaize.singleton import InstanceGuard


class ProductCase(unittest.TestCase):
    def setUp(self):
        temp_parent = ROOT / ".test-runtime"
        temp_parent.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="case-", dir=temp_parent)
        self.documents = Path(self.temp.name) / "Documents"
        self.documents.mkdir()
        self.docs_patch = patch.object(storage, "documents_directory", return_value=self.documents)
        self.docs_patch.start()
        storage.initialize()

    def tearDown(self):
        self.docs_patch.stop()
        if not Path(self.temp.name).resolve().is_relative_to((ROOT / ".test-runtime").resolve()):
            raise RuntimeError("Temporary test directory escaped the workspace.")
        for attempt in range(5):
            try:
                self.temp.cleanup()
                break
            except OSError as exc:
                if getattr(exc, "winerror", None) not in {32, 145} or attempt == 4:
                    raise
                time.sleep(0.1 * (attempt + 1))

    def hierarchy(self):
        workspace = storage.create_entity("workspace", None, "Integração")
        app = storage.create_entity("application", workspace["id"], "Aplicação")
        group = storage.create_entity("communication_group", app["id"], "Grupo")
        file = storage.create_entity("specific_file", group["id"], "Arquivo")
        variation = storage.create_entity("variation", file["id"], "Variação")
        return workspace, app, group, file, variation

    @unittest.skipUnless(shutil.which("powershell"), "Windows PowerShell unavailable")
    def test_powershell_date_formats_match_browser_engine(self):
        source = powershell_export.PS_ENGINE
        start = source.index("function Get-DateMask(")
        end = source.index("\nfunction ", source.index("function Get-DateValue(") + 10)
        script = source[start:end] + "\n$script:DateReference=[DateTimeOffset]::Parse('2026-12-31T21:26:39.123Z')\n"
        script += "$ctx=@{baseDate='2026-12-31';referenceDateTime='2026-12-31T21:26:39.123Z'}\n"
        cases = [("month,year", {"yearDigits": "2", "dateSeparator": ""}, "1226"),
                 ("year", {}, "2026"), ("month", {}, "12"), ("day", {}, "31"),
                 ("minute,second", {"timeSeparator": ""}, "2639"), ("second", {}, "39"),
                 ("day,month,year,hour,minute,second", {"order": "YMD", "dateSeparator": "", "timeSeparator": "", "join": ""}, "20261231182639"),
                 ("day,month,year,hour,minute,second", {"dateSeparator": ""}, "31122026 18:26:39"),
                 ("day,month,year,hour,minute,second", {"milliseconds": True, "timezone": True, "zone": "utc"}, "31/12/2026 21:26:39.123Z"),
                 ("day,month,year,hour,minute,second", {"milliseconds": True, "timezone": True, "zone": "app"}, "31/12/2026 18:26:39.123-03:00")]
        for components, extra, expected in cases:
            custom = {key: key in components.split(",") for key in ("day", "month", "year", "hour", "minute", "second")}
            formula = dict(type="date", mode="offset", days=0, format="custom", custom={**custom, **extra})
            encoded = base64.b64encode(json.dumps(formula).encode()).decode()
            script += f"$f=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{encoded}'))|ConvertFrom-Json\n"
            script += f"$value=Get-DateValue $f $ctx; if($value -cne '{expected}'){{throw \"Unexpected: $value\"}}\n"
        encoded = base64.b64encode(script.encode("utf-16le")).decode()
        result = subprocess.run(["powershell", "-NoProfile", "-EncodedCommand", encoded], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_library_migration_and_persistent_mode_documents(self):
        workspace, app, group, file, variation = self.hierarchy()
        path = '[{"ns":"","name":"R","index":1},{"ns":"","name":"N","index":1}]'
        config = {"inputXml": "<R><N>new</N></R>", "mode": "new",
                  "inputByMode": {"new": {"xml": "<R><N>new</N></R>", "group": ""},
                                  "return": {"xml": "<R><N>return</N></R>", "group": ""}},
                  "rulesByMode": {"new": {path: {"generator": {"type": "literal", "value": "novo"}}},
                                  "return": {path: {"generator": {"type": "literal", "value": "retorno"}}}}}
        storage.save_variation(variation["id"], 1, config)
        storage.initialize()
        nodes = {item["id"]: item for item in library.snapshot()["nodes"]}
        self.assertEqual(nodes[app["id"]]["kind"], "folder")
        self.assertEqual(nodes[variation["id"]]["parent_id"], file["id"])
        restored = storage.get_variation(variation["id"])["config"]
        self.assertEqual(restored["inputByMode"], config["inputByMode"])
        self.assertEqual(restored["rulesByMode"], config["rulesByMode"])

    def test_library_nested_move_copy_delete_and_backup(self):
        def create(kind, name, parent=None):
            return library.command(dict(action="create", kind=kind, name=name, parentId=parent))["id"]
        workspace = create("workspace", "Original")
        other = create("workspace", "Outro")
        folder = create("folder", "Pasta", workspace)
        child = create("folder", "Subpasta", folder)
        variation = create("variation", "XML", child)
        storage.save_variation(variation, 1, {"inputXml": "<R/>", "rulesByMode": {"new": {}, "return": {}}})
        with self.assertRaises(ValueError): library.command(dict(action="move", id=folder, parentId=child))
        clone = library.command(dict(action="copy", id=folder, parentId=other))["id"]
        library.command(dict(action="move", id=folder, parentId=other))
        library.command(dict(action="rename", id=folder, name="Renomeada"))
        storage.initialize()
        nodes = {item["id"]: item for item in library.snapshot()["nodes"]}
        self.assertEqual(nodes[folder]["parent_id"], other)
        self.assertEqual(nodes[folder]["name"], "Renomeada")
        clone_child = next(item for item in nodes.values() if item["parent_id"] == clone)
        clone_file = next(item for item in nodes.values() if item["parent_id"] == clone_child["id"])
        self.assertEqual(storage.get_variation(clone_file["id"])["config"]["inputXml"], "<R/>")
        with self.assertRaises(ValueError): library.command(dict(action="delete", id=folder))
        library.command(dict(action="delete", id=folder, confirm=True))
        storage.initialize()
        self.assertIsNone(storage.get_variation(variation))
        self.assertNotIn(folder, {item["id"] for item in library.snapshot()["nodes"]})
        backup = storage.export_workspace_backup()
        storage.import_workspace_backup(backup)
        active = library.snapshot()["nodes"]
        self.assertEqual(sum(item["name"] == "Outro" for item in active), 2)
        self.assertEqual(sum(item["kind"] == "variation" for item in active), 2)
        self.assertFalse(any(item["name"] == "Renomeada" for item in active))

    @unittest.skipUnless(shutil.which("powershell"), "Windows PowerShell unavailable")
    def test_group_sum_counts_all_occurrences_and_scopes_to_current_parent(self):
        import xml.etree.ElementTree as ET
        def path(*names): return json.dumps([dict(ns="", name=name, index=index) for name,index in names], separators=(",", ":"))
        record = path(("R",1),("Correspondente",1))
        group = path(("R",1),("Correspondente",1),("Agente",1))
        field = path(("R",1),("Correspondente",1),("Agente",1),("Valor",1))
        total = path(("R",1),("Correspondente",1),("Total",1))
        for count in (1,2,10):
            for source in ("input", "output"):
                with self.subTest(count=count, source=source):
                    values = [2884,4445] if count == 2 else list(range(1,count+1))
                    agents = "".join(f"<Agente><Valor>{value}</Valor></Agente>" for value in values)
                    others = "".join("<Agente><Valor>10000</Valor></Agente>" for _ in values)
                    xml = f"<R><Correspondente><Total>0</Total>{agents}</Correspondente><Correspondente><Total>0</Total>{others}</Correspondente></R>"
                    rules = {total: {"generator": dict(type="groupSum",source=source,group=group,path=field)}}
                    if source == "output":
                        for index in range(1,count+1):
                            key = path(("R",1),("Correspondente",1),("Agente",index),("Valor",1))
                            rules[key] = {"generator": dict(type="literal",value=str(index+10))}
                    config = storage.normalize_config(dict(inputXml=xml,outputXml=xml,inputGroup=record,outputGroup=record,
                        mode="return",returnSource="all",recordCount=2,rulesByMode={"new":{},"return":rules}))
                    config.update(name="soma",fileIndex=0)
                    work = Path(self.temp.name) / f"group-{count}-{source}"
                    work.mkdir()
                    encoded = base64.b64encode(json.dumps(config).encode()).decode()
                    script = work / "runner.ps1"
                    script.write_text(powershell_export.PS_ENGINE.replace("__CONFIG_B64__",encoded),encoding="utf-8-sig")
                    command = f"& ([scriptblock]::Create([IO.File]::ReadAllText('{script}'))) -OutputDirectory '{work}'"
                    result = subprocess.run(["powershell","-NoProfile","-Command",command],capture_output=True,text=True)
                    self.assertEqual(result.returncode,0,result.stderr)
                    generated = ET.parse(work / "mock.xml").getroot()
                    totals = [int(n.findtext("Total")) for n in generated.findall("Correspondente")]
                    self.assertEqual(totals,[sum(values),10000*count] if source == "input" else [sum(range(11,count+11))]*2)

    @unittest.skipUnless(shutil.which("powershell"), "Windows PowerShell unavailable")
    def test_global_group_sum_header_includes_every_generated_record(self):
        import xml.etree.ElementTree as ET
        def path(*names): return json.dumps([dict(ns="",name=name,index=1) for name in names],separators=(",", ":"))
        record=path("R","Corresp");field=path("R","Corresp","Reclamacoes");header=path("R","IF","Total")
        xml="<R><IF><Total>0</Total></IF><Corresp><Reclamacoes>3</Reclamacoes></Corresp><Corresp><Reclamacoes>7</Reclamacoes></Corresp></R>"
        for count in (1,2,10):
            for source in ("input","output"):
                for all_records in (False,True):
                    with self.subTest(count=count,source=source,all_records=all_records):
                        formula=dict(type="groupSum",source=source,group=record,path=field,allRecords=all_records)
                        config=storage.normalize_config(dict(inputXml=xml,outputXml=xml,inputGroup=record,outputGroup=record,recordCount=count,mode="new",
                            rulesByMode={"new":{header:{"generator":formula},field:{"generator":dict(type="literal",value="50")}},"return":{}}))
                        config.update(name="global",fileIndex=0)
                        work=Path(self.temp.name)/f"global-{count}-{source}-{all_records}";work.mkdir()
                        encoded=base64.b64encode(json.dumps(config).encode()).decode()
                        script=work/"runner.ps1";script.write_text(powershell_export.PS_ENGINE.replace("__CONFIG_B64__",encoded),encoding="utf-8-sig")
                        command=f"& ([scriptblock]::Create([IO.File]::ReadAllText('{script}'))) -OutputDirectory '{work}'"
                        result=subprocess.run(["powershell","-NoProfile","-Command",command],capture_output=True,text=True)
                        self.assertEqual(result.returncode,0,result.stderr)
                        generated=ET.parse(work/"mock.xml").getroot()
                        expected=(10 if all_records else 3) if source=="input" else (50*count if all_records else 50)
                        self.assertEqual(int(generated.findtext("IF/Total")),expected)
                        self.assertEqual(len(generated.findall("Corresp")),count)
        config["recordCount"]=2
        config["rulesByMode"]["new"][header]["generator"]["group"]=path("R")
        work=Path(self.temp.name)/"global-ancestor";work.mkdir()
        encoded=base64.b64encode(json.dumps(config).encode()).decode()
        script=work/"runner.ps1";script.write_text(powershell_export.PS_ENGINE.replace("__CONFIG_B64__",encoded),encoding="utf-8-sig")
        command=f"& ([scriptblock]::Create([IO.File]::ReadAllText('{script}'))) -OutputDirectory '{work}'"
        result=subprocess.run(["powershell","-NoProfile","-Command",command],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(ET.parse(work/"mock.xml").getroot().findtext("IF/Total"),"100")
        with self.assertRaises(ValueError): storage.validate_formula(dict(type="groupSum",source="output",group=record,path=field,allRecords="true"))

    @unittest.skipUnless(shutil.which("powershell"), "Windows PowerShell unavailable")
    def test_return_uses_each_input_record_even_with_legacy_first_setting(self):
        import xml.etree.ElementTree as ET
        def path(*names): return json.dumps([dict(ns="",name=name,index=1) for name in names],separators=(",", ":"))
        source_group=path("AMCBDOC","SISARQ","AMCB001","Grupo_AMCB001_DadCorresp")
        output_group=path("AMCBDOC","SISARQ","AMCB001RET","Grupo_AMCB001RET_DadCorrespActo")
        source=lambda name:path("AMCBDOC","SISARQ","AMCB001","Grupo_AMCB001_DadCorresp",name)
        target=lambda name:path("AMCBDOC","SISARQ","AMCB001RET","Grupo_AMCB001RET_DadCorrespActo",name)
        for count in (2,100):
            values=[("20261018000000146662","P606K19R000100"),("20261018000000314691","QM8FOAN6000105")]+[(f"CTRL{i:04}",f"CNPJ{i:04}") for i in range(2,count)]
            records="".join(f"<Grupo_AMCB001_DadCorresp><MesAnoRef>092026</MesAnoRef><NumCtrlIf>{control}</NumCtrlIf><CNPJCorresp>{cnpj}</CNPJCorresp></Grupo_AMCB001_DadCorresp>" for control,cnpj in values)
            xml=f"<AMCBDOC><BCARQ><Nome>origem</Nome></BCARQ><SISARQ><AMCB001>{records}</AMCB001></SISARQ></AMCBDOC>"
            model="<AMCBDOC><BCARQ><Nome>modelo</Nome></BCARQ><SISARQ><AMCB001RET><Grupo_AMCB001RET_DadCorrespActo><MesAnoRef>0</MesAnoRef><NumCtrlIF>0</NumCtrlIF><CNPJCorresp>0</CNPJCorresp><Chave>0</Chave></Grupo_AMCB001RET_DadCorrespActo></AMCB001RET></SISARQ></AMCBDOC>"
            rules={target("MesAnoRef"):{"generator":dict(type="copy",path=source("MesAnoRef"))},
                target("NumCtrlIF"):{"generator":dict(type="copy",path=source("NumCtrlIf"))},
                target("CNPJCorresp"):{"generator":dict(type="field",source="input",path=source("CNPJCorresp"))},
                target("Chave"):{"generator":dict(type="compose",operation="concat",separator="/",parts=[dict(type="copy",path=source("NumCtrlIf")),dict(type="field",source="input",path=source("CNPJCorresp"))])},
                path("AMCBDOC","BCARQ","Nome"):{"generator":dict(type="copy",path=path("AMCBDOC","BCARQ","Nome"))}}
            config=storage.normalize_config(dict(inputXml=xml,outputXml=model,inputGroup=source_group,outputGroup=output_group,mode="return",returnSource="first",recordCount=100,rulesByMode={"new":{},"return":rules}))
            config.update(name="retorno",fileIndex=0)
            work=Path(self.temp.name)/f"return-{count}";work.mkdir()
            encoded=base64.b64encode(json.dumps(config).encode()).decode();script=work/"runner.ps1"
            script.write_text(powershell_export.PS_ENGINE.replace("__CONFIG_B64__",encoded),encoding="utf-8-sig")
            command=f"& ([scriptblock]::Create([IO.File]::ReadAllText('{script}'))) -OutputDirectory '{work}'"
            result=subprocess.run(["powershell","-NoProfile","-Command",command],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            root=ET.parse(work/"mock.xml").getroot();generated=root.findall("SISARQ/AMCB001RET/Grupo_AMCB001RET_DadCorrespActo")
            self.assertEqual(len(generated),count)
            for node,(control,cnpj) in zip(generated,values):
                self.assertEqual(node.findtext("NumCtrlIF"),control)
                self.assertEqual(node.findtext("CNPJCorresp"),cnpj)
                self.assertEqual(node.findtext("Chave"),control+"/"+cnpj)
            self.assertEqual(root.findtext("BCARQ/Nome"),"origem")
            self.assertEqual(len(root.findall("BCARQ")),1)

    def test_custom_date_configuration_roundtrip_and_validation(self):
        *_, variation = self.hierarchy()
        custom = dict(day=False, month=True, year=True, hour=False, minute=False, second=False,
                      order="DMY", yearDigits="2", dateSeparator="", timeSeparator=":", join=" ",
                      milliseconds=False, timezone=False, zone="app")
        formula = {"type": "date", "mode": "offset", "days": -5, "format": "custom", "custom": custom}
        path = '[{"ns":"","name":"R","index":1},{"ns":"","name":"Data","index":1}]'
        config = {"rulesByMode": {"new": {path: {"generator": formula}}, "return": {}}}
        saved = storage.save_variation(variation["id"], 1, config)
        restored = storage.get_variation(variation["id"])["config"]["rulesByMode"]["new"][path]["generator"]
        self.assertEqual(restored, formula)
        formula["format"] = "yyyy-MM-dd"
        storage.validate_formula(formula)
        self.assertEqual(formula["custom"], custom)
        storage.validate_formula({"type": "date", "format": "dd/MM/yyyy"})
        formula["format"] = "custom"
        formula["custom"] = {key: False for key in ("day", "month", "year", "hour", "minute", "second")}
        with self.assertRaises(ValueError): storage.validate_formula(formula)
        formula["custom"] = {"order": "invalid"}
        with self.assertRaises(ValueError): storage.validate_formula(formula)

    def test_hierarchy_revision_artifact_and_workspace_backup(self):
        workspace, app, group, file, variation = self.hierarchy()
        self.assertEqual(len(storage.tree()["workspaces"][0]["applications"][0]["communication_groups"][0]["specific_files"][0]["variations"]), 1)
        config = {"inputXml": "<R><N>1</N></R>", "outputXml": "<R><N>1</N></R>", "recordCount": 1, "fileName": "mock"}
        item = storage.save_variation(variation["id"], 1, config)
        self.assertEqual(item["revision"], 2)
        with self.assertRaises(RuntimeError):
            storage.save_variation(variation["id"], 1, config)
        artifact = storage.publish_xml(variation["id"], 2, "resultado.xml", "<?xml version=\"1.0\"?><R>ok</R>")
        stored, path = storage.get_artifact(artifact["id"])
        self.assertTrue(path.is_file()); self.assertEqual(stored["sha256"], artifact["sha256"])
        self.assertEqual(storage.artifacts_for_variation(variation["id"])[0]["id"], artifact["id"])
        backup = storage.export_workspace_backup()
        result = storage.import_workspace_backup(backup)
        self.assertEqual(result["variations"], 1)
        self.assertEqual(len(storage.tree()["workspaces"]), 2)
        imported_ids = {workspace["id"] for workspace in storage.tree()["workspaces"]}
        self.assertIn(backup["hierarchy"][0]["id"], imported_ids)
        self.assertEqual(len(imported_ids), 2)

    def test_xml_output_can_exceed_input_limit_and_rejects_path_or_entity_tricks(self):
        *_, variation = self.hierarchy()
        with self.assertRaises(ValueError): storage.publish_xml(variation["id"], 1, "../outside.xml", "<R/>")
        with self.assertRaises(ValueError): storage.publish_xml(variation["id"], 1, "bad.xml", "<!DOCTYPE x [<!ENTITY y 'z'>]><R>&y;</R>")
        xml = "<R>" + ("x" * 2_100_000) + "</R>"
        artifact = storage.publish_xml(variation["id"], 1, "large.xml", xml)
        self.assertGreater(artifact["byteLength"], 2_000_000)

    def test_backup_import_is_validated_before_insert_and_migrates_legacy(self):
        invalid = {"format": "mockaize-workspace-backup", "version": 2, "pathEncodingVersion": 2,
                   "rootId": "x", "exportedAt": "", "hierarchy": [{"id": "x", "name": "bad"}], "settings": {}}
        with self.assertRaises(ValueError): storage.import_workspace_backup(invalid)
        self.assertEqual(storage.tree()["workspaces"], [])
        legacy = {"version": 1, "activeWorkspace": "old", "workspaces": [{"id": "old", "name": "Legado", "configs": [
            {"id": "c1", "name": "Teste", "mode": "new", "sourceTemplate": "<Root><Item><Value>1</Value></Item></Root>",
             "outputTemplate": "", "inputGroup": '[{"ns":"","name":"Root","index":1},{"ns":"","name":"Item","index":1}]',
             "outputGroup": "", "count": 1, "returnSource": "first", "baseDate": "2026-10-18", "fileIndex": 3,
             "rulesByMode": {"new": {}, "return": {}}, "filenameByMode": {"new": {"type": "literal", "value": "legacy"}, "return": {"type": "literal", "value": "legacy"}}}]}]}
        result = storage.import_workspace_backup(legacy)
        self.assertEqual(result["variations"], 1)
        imported = storage.tree()["workspaces"][0]
        self.assertEqual(imported["applications"][0]["name"], "Importados")

    def test_formula_schema_rejects_unknown_properties_and_operations(self):
        workspace, app, group, file, variation = self.hierarchy()
        config = {"inputXml": "<R><Value>1</Value></R>", "outputXml": "<R><Value /></R>",
                  "recordCount": 1, "fileName": "mock", "rulesByMode": {"return": {
                      '[{"ns":"","name":"R","index":1},{"ns":"","name":"Value","index":1}]': {
                          "generator": {"type": "literal", "value": "ok", "eval": "arbitrary"}}}}}
        with self.assertRaisesRegex(ValueError, "propriedades não reconhecidas"):
            storage.save_variation(variation["id"], 1, config)
        config["rulesByMode"]["return"].popitem()
        config["rulesByMode"]["return"]['[{"ns":"","name":"R","index":1},{"ns":"","name":"Value","index":1}]'] = {
            "generator": {"type": "compose", "operation": "execute", "parts": [{"type": "literal", "value": "x"}]}}
        with self.assertRaisesRegex(ValueError, "Operação de composição inválida"):
            storage.save_variation(variation["id"], 1, config)

    def test_root_identity_is_persistent_and_missing_manifest_does_not_adopt_database(self):
        manifest = storage.data_directory() / "mockaize-root.json"
        first = json.loads(manifest.read_text(encoding="utf-8"))["rootId"]
        storage.initialize()
        self.assertEqual(json.loads(manifest.read_text(encoding="utf-8"))["rootId"], first)
        manifest.unlink()
        with self.assertRaisesRegex(OSError, "ROOT_RECOVERY"):
            storage.initialize()

    def test_operational_snapshot_restore_is_atomic_and_keeps_root_identity(self):
        storage.create_entity("workspace", None, "Antes")
        snapshot = storage.create_operational_backup()
        saved = storage.get_operational_backup(snapshot["id"])
        self.assertIsNotNone(saved)
        storage.create_entity("workspace", None, "Depois")
        receipt = storage.restore_operational_backup(snapshot["id"])
        self.assertEqual(receipt["restoredBackupId"], snapshot["id"])
        self.assertEqual([workspace["name"] for workspace in storage.tree()["workspaces"]], ["Antes"])
        self.assertEqual(storage.list_operational_backups()[0]["id"], snapshot["id"])

    def test_powershell_bundle_publishes_only_the_two_allowlisted_members(self):
        *_, variation = self.hierarchy()
        config = {"inputXml": "<R><Item><Value>1</Value></Item></R>", "outputXml": "<R><Item><Value /></Item></R>",
                  "recordCount": 1, "fileName": "mock"}
        item = storage.save_variation(variation["id"], 1, config)
        bundle = powershell_export.create_bundle(variation["id"], item["revision"])
        self.assertEqual(len(list((storage.data_directory() / "PowerShell" / bundle["id"]).iterdir())), 2)
        ps1 = powershell_export.get_bundle_member(bundle["id"], "ps1")
        bat = powershell_export.get_bundle_member(bundle["id"], "bat")
        self.assertIn(b"ConvertFrom-Json", ps1[1]); self.assertIn(b"MockAize.ps1", bat[1])
        self.assertIsNone(powershell_export.get_bundle_member(bundle["id"], "zip"))

    @unittest.skipUnless(os.name == "nt", "mutex nomeado é específico do Windows")
    def test_singleton_mutex_and_rendezvous_live_inside_documents_root(self):
        owner, second = InstanceGuard(), InstanceGuard()
        self.assertTrue(InstanceGuard._is_safe_local_url("http://127.0.0.1:45678/"))
        self.assertFalse(InstanceGuard._is_safe_local_url("http://127.0.0.1:45678@evil.example/"))
        self.assertFalse(InstanceGuard._is_safe_local_url("http://127.0.0.1:0/"))
        self.assertTrue(owner.acquire())
        try:
            self.assertFalse(second.acquire())
            owner.publish("http://127.0.0.1:45678/")
            payload = json.loads(owner.path.read_text(encoding="utf-8"))
            self.assertEqual(payload["url"], "http://127.0.0.1:45678/")
            self.assertEqual(owner.path.parent, storage.data_directory())
        finally:
            owner.release()
        self.assertFalse(owner.path.exists())

    def test_http_local_session_and_csrf_boundary(self):
        from types import SimpleNamespace
        endpoint = object.__new__(server.Handler)
        endpoint.server = SimpleNamespace(server_port=45678, session_token="test-session-token", csrf_token="test-csrf-token")
        endpoint.headers = Message(); endpoint.headers["Host"] = "127.0.0.1:45678"
        endpoint.headers["Origin"] = "http://127.0.0.1:45678"
        endpoint.headers["Cookie"] = "mockaize_session=test-session-token"
        endpoint.headers["X-CSRF-Token"] = "test-csrf-token"
        self.assertTrue(server.Handler._is_local_request(endpoint))
        self.assertTrue(server.Handler._has_session(endpoint, mutation=True))
        endpoint.headers.replace_header("Origin", "https://example.test")
        self.assertFalse(server.Handler._is_local_request(endpoint))
        self.assertFalse(server.Handler._has_session(endpoint, mutation=True))
        endpoint.headers.replace_header("Origin", "http://127.0.0.1:45678")
        endpoint.headers.replace_header("X-CSRF-Token", "wrong")
        self.assertFalse(server.Handler._has_session(endpoint, mutation=True))

    @unittest.skipUnless(os.name == "nt" and shutil.which("powershell.exe"), "PowerShell 5.1 disponível somente no Windows")
    def test_standalone_powershell_runner_has_valid_syntax_without_policy_bypass(self):
        in_group = [{"ns": "", "name": "Root", "index": 1}, {"ns": "", "name": "Records", "index": 1}, {"ns": "", "name": "Record", "index": 1}]
        out_group = [{"ns": "", "name": "Reply", "index": 1}, {"ns": "", "name": "Items", "index": 1}, {"ns": "", "name": "Item", "index": 1}]
        source_path = json.dumps(in_group + [{"ns": "", "name": "Value", "index": 1}], separators=(",", ":"))
        target_path = json.dumps(out_group + [{"ns": "", "name": "Value", "index": 1}], separators=(",", ":"))
        config = {"name": "Runner", "mode": "return", "inputXml": "<Root><Records><Record><Value>A</Value></Record><Record><Value>B</Value></Record></Records></Root>",
            "outputXml": "<Reply><Items><Item><Value /></Item></Items></Reply>", "inputGroup": json.dumps(in_group, separators=(",", ":")),
            "outputGroup": json.dumps(out_group, separators=(",", ":")), "recordCount": 2, "returnSource": "all", "baseDate": "2026-10-18", "fileIndex": 0,
            "rulesByMode": {"new": {}, "return": {target_path: {"generator": {"type": "copy", "path": source_path}, "fixed": None, "exactLength": None}}},
            "presenceByMode": {"new": {}, "return": {}}, "filenameByMode": {"new": {"type": "literal", "value": "x"}, "return": {"type": "literal", "value": "smoke"}}}
        encoded = base64.b64encode(json.dumps(config, ensure_ascii=False, separators=(",", ":")).encode()).decode("ascii")
        runner = ROOT / "tests" / "_runner-smoke.ps1"
        script = powershell_export.PS_ENGINE.replace("__CONFIG_B64__", encoded)
        runner.write_text(script, encoding="utf-8")
        try:
            ps_path = str(runner).replace("'", "''")
            command_text = "$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('" + ps_path + "',[ref]$t,[ref]$e);$e|ForEach-Object{$_.Message};if($e.Count){exit 1}"
            run = subprocess.run(["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command_text],
                                cwd=ROOT, capture_output=True, text=True, timeout=30)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertNotIn("ExecutionPolicy", script)
            self.assertIn("FileMode]::CreateNew", script)
            self.assertIn("[string]$BaseDate", script)
            self.assertIn("[long]$FileIndex", script)
        finally:
            runner.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
