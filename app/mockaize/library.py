"""Workspace library with arbitrary nested folders and transactional operations."""
from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from . import storage


def ensure_schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS library_nodes(
        id TEXT PRIMARY KEY, parent_id TEXT REFERENCES library_nodes(id),
        kind TEXT NOT NULL CHECK(kind IN ('workspace','folder','variation')),
        name TEXT NOT NULL, deleted_at TEXT, created_at TEXT NOT NULL)''')
    db.execute('CREATE INDEX IF NOT EXISTS library_parent ON library_nodes(parent_id)')
    db.execute('CREATE TABLE IF NOT EXISTS library_backing(id TEXT PRIMARY KEY)')
    # IDs and XML configurations survive the migration unchanged.
    for table, parent, kind in [('workspaces', None, 'workspace'),('applications','workspace_id','folder'),
                                ('communication_groups','application_id','folder'),('specific_files','communication_group_id','folder'),
                                ('variations','specific_file_id','variation')]:
        for row in db.execute(f'SELECT * FROM {table} WHERE id NOT IN (SELECT id FROM library_backing)').fetchall():
            db.execute('INSERT OR IGNORE INTO library_nodes(id,parent_id,kind,name,created_at) VALUES(?,?,?,?,?)',
                       (row['id'],row[parent] if parent else None,kind,row['name'],row['created_at']))


def snapshot():
    with storage.connect() as db:
        return {'nodes':[dict(row) for row in db.execute('''SELECT n.*,v.revision,v.file_index FROM library_nodes n
            LEFT JOIN variations v ON v.id=n.id WHERE n.deleted_at IS NULL ORDER BY n.name COLLATE NOCASE''')]}


def _name(value):
    if not isinstance(value,str) or not value.strip() or len(value.strip())>128 or any(ord(c)<32 or 127<=ord(c)<=159 for c in value):
        raise ValueError('Informe um nome entre 1 e 128 caracteres, sem caracteres de controle.')
    return value.strip()


def _node(db, node_id):
    row=db.execute('SELECT * FROM library_nodes WHERE id=? AND deleted_at IS NULL',(node_id,)).fetchone()
    if row is None: raise ValueError('Item não encontrado. Atualize a biblioteca.')
    return dict(row)


def _subtree(db, node_id):
    rows=db.execute('''WITH RECURSIVE branch(id,depth) AS (SELECT ?,0 UNION ALL
        SELECT n.id,b.depth+1 FROM library_nodes n JOIN branch b ON n.parent_id=b.id WHERE n.deleted_at IS NULL)
        SELECT n.*,b.depth FROM branch b JOIN library_nodes n ON n.id=b.id ORDER BY b.depth''',(node_id,)).fetchall()
    return [dict(row) for row in rows]


def _destination(db, parent_id):
    parent=_node(db,parent_id)
    if parent['kind']=='variation': raise ValueError('Escolha um workspace ou uma pasta como destino.')
    cursor=parent;depth=0
    while cursor['parent_id']:
        cursor=_node(db,cursor['parent_id']);depth+=1
        if depth>128: raise ValueError('O limite é de 128 níveis de pastas.')
    return cursor['id'],depth


def _backing_file(db, workspace_id, now):
    # Keep the old FK for backward compatible configurations and backups.
    aid=str(uuid.uuid5(uuid.NAMESPACE_URL,'mockaize:'+workspace_id+':application'))
    gid=str(uuid.uuid5(uuid.NAMESPACE_URL,'mockaize:'+workspace_id+':group'))
    fid=str(uuid.uuid5(uuid.NAMESPACE_URL,'mockaize:'+workspace_id+':file'))
    for table,key,parent,name in [('applications','workspace_id',workspace_id,aid),('communication_groups','application_id',aid,gid),('specific_files','communication_group_id',gid,fid)]:
        db.execute(f'INSERT OR IGNORE INTO {table}(id,{key},name,created_at) VALUES(?,?,?,?)',(name,parent,'Biblioteca',now))
        db.execute('INSERT OR IGNORE INTO library_backing VALUES(?)',(name,))
    return fid


def command(payload):
    if not isinstance(payload,dict): raise ValueError('Operação inválida.')
    action=payload.get('action');now=datetime.now(timezone.utc).isoformat()
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        if action in {'move_many','copy_many','delete_many'}:
            requested=payload.get('ids')
            if not isinstance(requested,list) or not requested or len(requested)>500 or any(not isinstance(item,str) for item in requested):
                raise ValueError('Selecione entre 1 e 500 itens.')
            if len(set(requested))!=len(requested): raise ValueError('A seleção contém itens repetidos.')
            selected=[_node(db,item) for item in requested]
            selected_ids={item['id'] for item in selected}
            roots=[]
            for item in selected:
                parent_id=item['parent_id'];nested=False
                while parent_id:
                    if parent_id in selected_ids:nested=True;break
                    parent_id=_node(db,parent_id)['parent_id']
                if not nested:roots.append(item)
            if action in {'move_many','copy_many'}:
                if any(item['kind']=='workspace' for item in roots): raise ValueError('Workspaces não podem ser movidos ou copiados.')
                parent_id=payload.get('parentId');workspace_id,depth=_destination(db,parent_id)
                branches=[_subtree(db,item['id']) for item in roots]
                branch_ids=[{entry['id'] for entry in branch} for branch in branches]
                if any(parent_id in ids for ids in branch_ids): raise ValueError('Uma pasta não pode ser colocada dentro dela mesma ou de uma subpasta.')
                if any(depth+max(entry['depth'] for entry in branch)+1>128 for branch in branches): raise ValueError('O limite é de 128 níveis de pastas.')
                if action=='move_many':
                    for item in roots:
                        if item['parent_id']!=parent_id:db.execute('UPDATE library_nodes SET parent_id=? WHERE id=?',(parent_id,item['id']))
                    node_id=roots[0]['id']
                else:
                    copied_roots=[]
                    for root,branch in zip(roots,branches):
                        mapping={item['id']:str(uuid.uuid4()) for item in branch};fid=_backing_file(db,workspace_id,now)
                        for item in branch:
                            new_id=mapping[item['id']];new_parent=parent_id if item['id']==root['id'] else mapping[item['parent_id']]
                            name=item['name']+' (cópia)' if item['id']==root['id'] and root['parent_id']==parent_id else item['name']
                            name=name[:128]
                            if item['kind']=='variation':
                                source=db.execute('SELECT config_json,file_index FROM variations WHERE id=?',(item['id'],)).fetchone()
                                db.execute('INSERT INTO variations(id,specific_file_id,name,config_json,file_index,revision,created_at) VALUES(?,?,?,?,?,1,?)',(new_id,fid,name,source['config_json'],source['file_index'],now))
                            db.execute('INSERT INTO library_nodes(id,parent_id,kind,name,created_at) VALUES(?,?,?,?,?)',(new_id,new_parent,item['kind'],name,now))
                        copied_roots.append(mapping[root['id']])
                    node_id=copied_roots[0]
            else:
                if payload.get('confirm') is not True: raise ValueError('Confirme a exclusão dos itens selecionados e de todo o seu conteúdo.')
                remove_ids={entry['id'] for root in roots for entry in _subtree(db,root['id'])}
                for item_id in remove_ids:db.execute('UPDATE library_nodes SET deleted_at=? WHERE id=?',(now,item_id))
                node_id=payload.get('parentId')
        elif action=='create':
            kind=payload.get('kind');name=_name(payload.get('name'));parent_id=payload.get('parentId')
            if kind not in {'workspace','folder','variation'}: raise ValueError('Tipo inválido.')
            if kind=='workspace':
                parent_id=None
            else: workspace_id,_=_destination(db,parent_id)
            node_id=str(uuid.uuid4())
            if kind=='workspace': db.execute('INSERT INTO workspaces VALUES(?,?,?)',(node_id,name,now))
            if kind=='variation':
                fid=_backing_file(db,workspace_id,now)
                db.execute('INSERT INTO variations(id,specific_file_id,name,created_at) VALUES(?,?,?,?)',(node_id,fid,name,now))
            db.execute('INSERT INTO library_nodes(id,parent_id,kind,name,created_at) VALUES(?,?,?,?,?)',(node_id,parent_id,kind,name,now))
        else:
            node_id=payload.get('id');node=_node(db,node_id)
            if action=='rename':
                name=_name(payload.get('name'));db.execute('UPDATE library_nodes SET name=? WHERE id=?',(name,node_id))
                table={'workspace':'workspaces','variation':'variations'}.get(node['kind'])
                if table: db.execute(f'UPDATE {table} SET name=?'+(',revision=revision+1' if table=='variations' else '')+' WHERE id=?',(name,node_id))
            elif action in {'move','copy'}:
                parent_id=payload.get('parentId');workspace_id,depth=_destination(db,parent_id)
                if node['kind']=='workspace': raise ValueError('Workspaces não podem ficar dentro de outros itens.')
                branch=_subtree(db,node_id);ids={item['id'] for item in branch}
                if parent_id in ids: raise ValueError('Uma pasta não pode ser colocada dentro dela mesma ou de uma subpasta.')
                if depth+max(item['depth'] for item in branch)+1>128: raise ValueError('O limite é de 128 níveis de pastas.')
                if action=='move': db.execute('UPDATE library_nodes SET parent_id=? WHERE id=?',(parent_id,node_id))
                else:
                    mapping={item['id']:str(uuid.uuid4()) for item in branch}
                    fid=_backing_file(db,workspace_id,now)
                    for item in branch:
                        new_id=mapping[item['id']];new_parent=parent_id if item['id']==node_id else mapping[item['parent_id']]
                        name=item['name']+' (cópia)' if item['id']==node_id and node['parent_id']==parent_id else item['name']
                        name=name[:128]
                        if item['kind']=='variation':
                            source=db.execute('SELECT config_json,file_index FROM variations WHERE id=?',(item['id'],)).fetchone()
                            db.execute('INSERT INTO variations(id,specific_file_id,name,config_json,file_index,revision,created_at) VALUES(?,?,?,?,?,1,?)',
                                       (new_id,fid,name,source['config_json'],source['file_index'],now))
                        db.execute('INSERT INTO library_nodes(id,parent_id,kind,name,created_at) VALUES(?,?,?,?,?)',(new_id,new_parent,item['kind'],name,now))
                    node_id=mapping[node_id]
            elif action=='delete':
                if payload.get('confirm') is not True: raise ValueError('Confirme a exclusão do item e de todo o seu conteúdo.')
                for item in _subtree(db,node_id): db.execute('UPDATE library_nodes SET deleted_at=? WHERE id=?',(now,item['id']))
            else: raise ValueError('Operação desconhecida.')
    return {'id':node_id,'library':snapshot()}
