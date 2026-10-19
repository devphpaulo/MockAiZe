import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from mockaize import library, storage

class ReturnPersistenceCase(unittest.TestCase):
    def setUp(self):
        parent = ROOT / '.test-runtime'
        parent.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=parent)
        self.documents = Path(self.temp.name) / 'Documents'
        self.documents.mkdir()
        self.override = patch.object(storage, 'documents_directory', return_value=self.documents)
        self.override.start()
        storage.initialize()
        workspace = library.command({'action':'create','kind':'workspace','name':'Retornos'})['id']
        self.variation = library.command({'action':'create','kind':'variation','name':'Arquivo','parentId':workspace})['id']

    def tearDown(self):
        self.override.stop()
        self.temp.cleanup()

    def model(self, model_id, value):
        path = json.dumps([{'name':'R','ns':'','index':1},{'name':'N','ns':'','index':1}], separators=(',',':'))
        return {'id':model_id,'name':model_id,'selected':True,'outputXml':'<R><N/></R>',
                'outputGroup':'','rules':{path:{'generator':{'type':'literal','value':value}}},
                'presence':{},'filename':{'type':'literal','value':model_id},'outputNotes':{},'headers':[]}

    def test_independent_models_survive_save_restart_and_backup(self):
        models = [self.model('first','um'), self.model('second','dois')]
        config = {'mode':'return','returnModels':models,'activeReturnId':'second'}
        saved = storage.save_variation(self.variation, 1, config)
        storage.initialize()
        restored = storage.get_variation(self.variation)['config']
        self.assertEqual(restored['returnModels'],models)
        self.assertEqual(restored['activeReturnId'],'second')
        backup = storage.export_workspace_backup()
        storage._validate_backup(backup)
        self.assertIn('dois',json.dumps(backup))
        self.assertEqual(saved['revision'],2)

    def test_model_validation_rejects_bad_formula_xml_and_duplicate_ids(self):
        for change in ('xml','formula','id','active'):
            with self.subTest(change=change):
                models = [self.model('first','um'),self.model('second','dois')]
                config = {'returnModels':models,'activeReturnId':'first'}
                if change == 'xml': models[1]['outputXml']='<invalid>'
                if change == 'formula': next(iter(models[1]['rules'].values()))['generator']={'type':'unknown'}
                if change == 'id': models[1]['id']='first'
                if change == 'active': config['activeReturnId']='missing'
                with self.assertRaises(ValueError): storage.normalize_config(config)

    def test_legacy_configuration_remains_accepted(self):
        normalized = storage.normalize_config({'outputXml':'<Original/>'})
        self.assertEqual(normalized['outputXml'],'<Original/>')
        self.assertEqual(normalized['returnModels'],[])

    def test_zip_preserves_each_xml_handles_collisions_and_checks_ownership(self):
        first = storage.publish_xml(self.variation,1,'retorno.xml','<R>um</R>')
        second = storage.publish_xml(self.variation,first['revision'],'retorno.xml','<R>dois</R>')
        archive = storage.artifact_archive(self.variation,[first['id'],second['id']])
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            self.assertEqual(zipped.namelist(),['retorno.xml','retorno_2.xml'])
            self.assertEqual(zipped.read('retorno.xml'),b'<R>um</R>')
            self.assertEqual(zipped.read('retorno_2.xml'),b'<R>dois</R>')
        with self.assertRaises(ValueError): storage.artifact_archive('another-file',[first['id']])
        with self.assertRaises(ValueError): storage.artifact_archive(self.variation,[first['id'],first['id']])

if __name__ == '__main__': unittest.main()

