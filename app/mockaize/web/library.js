/* Shared library explorer: same actions in navigation and organization screen. */
globalThis.LibraryUI=(()=>{
 'use strict';
 const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=kind=>`<svg class="lib-icon" viewBox="0 0 24 24" aria-hidden="true">${kind==='variation'?'<path d="M6 3h8l4 4v14H6zM14 3v5h5"/>':'<path d="M3 6h7l3 3h8v12H3z"/>'}</svg>`;
 const label=kind=>({workspace:'Workspace',folder:'Pasta',variation:'Arquivo / variação'})[kind];
 async function request(payload){const response=await fetch('/api/library',payload?{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':document.querySelector('meta[name="csrf-token"]').content},body:JSON.stringify(payload)}:{credentials:'same-origin'});const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível atualizar a biblioteca.');return data;}
 function create(options={}){
  const state={nodes:options.nodes||[],selected:options.selected||null,current:null,filter:'',closed:new Set(),checked:new Set(),tree:null,workspaceColumns:false,manager:null,busy:false};
  let menu=null,menuTrigger=null,dragIds=[];
  const node=id=>state.nodes.find(item=>item.id===id);
  const children=id=>state.nodes.filter(item=>item.parent_id===id).sort((a,b)=>(a.kind==='variation')-(b.kind==='variation')||a.name.localeCompare(b.name,'pt-BR'));
  const path=id=>{const names=[];for(let item=node(id);item;item=node(item.parent_id))names.unshift(item.name);return names.join(' / ');};
  const descendants=id=>{const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const item of state.nodes)if(ids.has(item.parent_id)&&!ids.has(item.id)){ids.add(item.id);changed=true;}}return ids;};
  const drawings={
   workspace:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
   up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',folder:'<path d="M3 7h7l2 2h9v11H3zM12 12v5m-2.5-2.5h5"/>',
   variation:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M12 11v7m-3.5-3.5h7"/>',
   open:'<path d="M5 12h14m-6-6 6 6-6 6"/>',rename:'<path d="m4 16-1 5 5-1L20 8l-4-4zM13 7l4 4"/>',
   move:'<path d="M3 7h7l2 2h9v11H3zM8 14h8m-3-3 3 3-3 3"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H4v13h4"/>',
   delete:'<path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/>',
   more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  const actionIcon=action=>`<svg class="lib-icon" viewBox="0 0 24 24" aria-hidden="true">${drawings[action]||drawings.open}</svg>`;
  const actionButton=(action,text,attrs='',disabled=false)=>`<button type="button" ${attrs} class="lib-action-button ${action==='delete'?'lib-danger':''}" ${disabled?'disabled':''}>${actionIcon(action)}<span>${text}</span></button>`;
  function close(){document.getElementById('libraryDialog')?.close();}
  function dialog(title,content,actions){let d=document.getElementById('libraryDialog');if(!d){d=document.createElement('dialog');d.id='libraryDialog';d.className='library-dialog';document.body.append(d);}d.innerHTML=`<form method="dialog"><header><h2>${h(title)}</h2><button type="button" data-lib-dismiss aria-label="Fechar">×</button></header><div class="lib-dialog-body">${content}<p class="lib-error" role="alert" hidden></p></div><footer><button type="button" data-lib-dismiss>Cancelar</button>${actions.map((a,i)=>`<button type="button" data-lib-confirm="${i}" class="${a.danger?'danger':'primary'}">${h(a.text)}</button>`).join('')}</footer></form>`;d.querySelectorAll('[data-lib-dismiss]').forEach(b=>b.onclick=close);d.querySelector('form').onsubmit=event=>event.preventDefault();d.onclick=event=>{if(event.target!==d)return;const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();};d.oncancel=event=>{event.preventDefault();close();};d.querySelectorAll('[data-lib-confirm]').forEach(b=>b.onclick=async()=>{if(!d.querySelector('form').reportValidity())return;b.disabled=true;try{await actions[Number(b.dataset.libConfirm)].run(d);}catch(error){const e=d.querySelector('.lib-error');AppAlerts.render(e,error.message,{type:'error'});}finally{b.disabled=false;}});d.showModal();d.querySelector('input,select')?.focus();}

  function hideMenu(){menuTrigger?.setAttribute('aria-expanded','false');if(menu?.matches(':popover-open'))menu.hidePopover();}
  async function mutate(payload){
   if(state.busy)throw Error('Aguarde a atualização da biblioteca.');
   state.busy=true;
   try{
    if(options.beforeChange&&await options.beforeChange()===false)throw Error('Salve ou revise as alterações abertas antes de organizar.');
    const result=await request(payload);
    state.nodes=result.library.nodes;
    state.checked.clear();
    state.selected=payload.action.startsWith('delete')?payload.parentId||null:result.id;
    if(state.current&&!node(state.current))state.current=null;
    if(payload.action.startsWith('move'))for(let id=payload.parentId;id;id=node(id)?.parent_id)state.closed.delete(id);
    render();
    await options.onChange?.(state.nodes,result);
    return result;
   }finally{state.busy=false;}
  }
  function destinations(excluded=[],selected){
   const blocked=new Set(excluded.flatMap(id=>[...descendants(id)]));
   return state.nodes.filter(item=>item.kind!=='variation'&&!blocked.has(item.id)).map(item=>`<option value="${h(item.id)}" ${item.id===selected?'selected':''}>${h(path(item.id))}</option>`).join('');
  }
  function createItem(kind,parentId=state.current||state.selected){
   const parent=node(parentId);if(parent?.kind==='variation')parentId=parent.parent_id;
   dialog('Criar '+label(kind).toLowerCase(),`<label>Nome<input name="name" maxlength="128" required autocomplete="off"></label>${kind!=='workspace'?`<label>Dentro de<select name="parent" required>${destinations([],parentId)}</select></label>`:''}`,[{text:'Criar',run:async d=>{
    const result=await mutate({action:'create',kind,name:d.querySelector('[name=name]').value,parentId:kind==='workspace'?null:d.querySelector('[name=parent]').value});
    close();state.current=kind==='variation'?node(result.id)?.parent_id:result.id;render();
   }}]);
  }
  function browse(id){hideMenu();state.current=id;state.checked.clear();render();}
  function openItem(id,fromTree=false){
   const item=node(id);if(!item)return;state.selected=id;
   if(item.kind==='variation'){options.onOpen?.(id);return;}
   state.current=id;state.checked.clear();
   if(fromTree){toggleBranch(id);for(const row of state.tree.querySelectorAll('[data-lib-row]'))row.classList.toggle('active',row.dataset.libRow===id);}
   render(fromTree);options.onSelect?.(item);
  }
  function act(action,ids=state.selected?[state.selected]:[]){
   if(!Array.isArray(ids))ids=[ids];ids=[...new Set(ids)].filter(id=>node(id));if(!ids.length)return;
   const item=node(ids[0]);hideMenu();
   if(action==='menu'){showMenu(item.id);return;}
   if(action==='open'){openItem(item.id);return;}
   if(action==='rename'){
    if(ids.length!==1)return;
    dialog('Renomear '+label(item.kind).toLowerCase(),`<label>Novo nome<input name="name" maxlength="128" value="${h(item.name)}" required></label>`,[{text:'Renomear',run:async d=>{await mutate({action,id:item.id,name:d.querySelector('input').value});close();}}]);return;
   }
   if(action==='move'||action==='copy'){
    if(ids.some(id=>node(id).kind==='workspace'))return;
    dialog(action==='move'?'Mover para…':'Copiar para…',`<p>${ids.length===1?h(item.name):ids.length+' itens selecionados'}</p><label>Workspace ou pasta de destino<select name="parent" required>${destinations(ids,item.parent_id)}</select></label><p class="lib-hint">Inclui subpastas, XMLs e configurações.</p>`,[{text:action==='move'?'Mover':'Copiar',run:async d=>{await mutate({action:action+'_many',ids,parentId:d.querySelector('select').value});close();}}]);return;
   }
   if(action==='delete'){
    const affected=new Set(ids.flatMap(id=>[...descendants(id)])),extra=affected.size-ids.length;
    dialog(ids.length===1?'Excluir '+label(item.kind).toLowerCase()+'?':`Excluir ${ids.length} itens?`,`<p>${ids.length===1?`Excluir <strong>${h(item.name)}</strong>?`:`Excluir os ${ids.length} itens selecionados?`}</p><p>${extra?`Inclui ${extra} item(ns) dentro das pastas selecionadas.`:'O item será removido da biblioteca.'}</p>`,[{text:'Excluir',danger:true,run:async()=>{await mutate({action:'delete_many',ids,confirm:true,parentId:item.parent_id});close();}}]);
   }
  }
  function showMenu(id,trigger=state.tree?.querySelector(`[data-lib-menu="${CSS.escape(id)}"]`)){
   const item=node(id);if(!item||!trigger)return;
   if(menu?.matches(':popover-open')&&menuTrigger===trigger){hideMenu();return;}
   hideMenu();
   if(!menu){
    menu=document.createElement('div');menu.id='library-actions-'+crypto.randomUUID();menu.className='lib-context-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');document.body.append(menu);
    menu.addEventListener('toggle',()=>menuTrigger?.setAttribute('aria-expanded',String(menu.matches(':popover-open'))));
    menu.onclick=event=>{const button=event.target.closest('[data-menu-action]');if(!button)return;const action=button.dataset.menuAction;hideMenu();if(action==='folder'||action==='variation')createItem(action,menu.dataset.item);else act(action,menu.dataset.item);};
    menu.onkeydown=event=>{
     const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
     if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}
     if(event.key==='Escape'){hideMenu();menuTrigger?.focus();}
    };
   }
   menuTrigger=trigger;trigger.setAttribute('aria-controls',menu.id);menu.dataset.item=id;menu.setAttribute('aria-label','Ações de '+item.name);
   const entry=(action,text)=>`<button type="button" role="menuitem" data-menu-action="${action}" class="${action==='delete'?'lib-danger':''}">${actionIcon(action)}<span>${text}</span></button>`;
   menu.innerHTML=entry('open',item.kind==='variation'?'Abrir no estúdio':'Abrir pasta')+(item.kind==='variation'?'':entry('folder','Nova pasta')+entry('variation','Novo arquivo'))+'<div class="lib-menu-separator" role="separator"></div>'+entry('rename','Renomear')+(item.kind==='workspace'?'':entry('move','Mover')+entry('copy','Copiar'))+entry('delete','Excluir');
   menu.showPopover();
   const rect=trigger.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(rect.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(rect.bottom+8,innerHeight-menu.offsetHeight-8))+'px';
   trigger.setAttribute('aria-expanded','true');menu.querySelector('button')?.focus({preventScroll:true});
  }
  function treeMarkup(parent=null){
   return children(parent).map(item=>{
    const expanded=!state.closed.has(item.id),folder=item.kind!=='variation',nested=children(item.id),contentId='lib-children-'+item.id;
    const folderIcons='<svg class="lib-icon folder-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg><svg class="lib-icon folder-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17V7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2M5 11h17l-3 10H2z"/></svg>';
    return `<div class="lib-branch" data-lib-branch="${h(item.id)}" data-state="${expanded?'open':'closed'}"><div class="lib-tree-row ${item.id===state.selected?'active':''}" data-lib-row="${h(item.id)}" data-kind="${folder?'folder':'file'}" ${folder?`data-lib-drop="${h(item.id)}"`:''} ${item.kind!=='workspace'?`draggable="true" data-lib-drag="${h(item.id)}"`:''}><button type="button" class="lib-disclosure" data-lib-toggle="${h(item.id)}" aria-label="${expanded?'Recolher':'Expandir'} ${h(item.name)}" ${folder?`aria-controls="${h(contentId)}" aria-expanded="${expanded}"`:'disabled tabindex="-1"'}>${folder?'<svg class="lib-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>':''}</button><button type="button" class="lib-node" data-lib-open="${h(item.id)}" ${folder?`aria-expanded="${expanded}" aria-controls="${h(contentId)}"`:''} title="${h(path(item.id))}">${folder?folderIcons:icon(item.kind)}<span>${h(item.name)}${state.workspaceColumns&&!folder?`<small>Arquivo · ${h(({new:'Novos Registros',return:'Retorno',filter:'Filtragem',manual:'Manual'})[item.mode]||'Estúdio')}</small>`:''}</span></button><button type="button" class="lib-more" data-lib-menu="${h(item.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Opções de ${h(item.name)}">${actionIcon('more')}</button></div>${folder?`<div class="lib-children" id="${h(contentId)}" ${expanded?'':'inert'}><div class="lib-children-inner">${nested.length?treeMarkup(item.id):'<p class="lib-folder-empty">Pasta vazia</p>'}</div></div>`:''}</div>`;
   }).join('');
  }
  function updateTreeWidth(){
   if(!state.tree||state.workspaceColumns)return;let depth=0;
   function visit(parent,level){for(const item of children(parent)){depth=Math.max(depth,level);if(item.kind!=='variation'&&!state.closed.has(item.id))visit(item.id,level+1);}}
   visit(null,0);state.tree.style.setProperty('--library-tree-min-width',(120+depth*24)+'px');
  }
  function toggleBranch(id,expand){
   const item=node(id);if(!item||item.kind==='variation')return;
   const expanded=expand??state.closed.has(id);expanded?state.closed.delete(id):state.closed.add(id);
   const branch=state.tree?.querySelector(`[data-lib-branch="${CSS.escape(id)}"]`);if(!branch)return;
   branch.dataset.state=expanded?'open':'closed';const button=branch.querySelector('.lib-disclosure');button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',(expanded?'Recolher ':'Expandir ')+item.name);branch.querySelector('.lib-node').setAttribute('aria-expanded',String(expanded));branch.querySelector('.lib-children').inert=!expanded;updateTreeWidth();
  }
  function validDrop(ids,parentId){
   return !state.busy&&node(parentId)?.kind!=='variation'&&!!node(parentId)&&ids.length>0&&ids.every(id=>node(id)&&node(id).kind!=='workspace'&&!descendants(id).has(parentId))&&ids.some(id=>node(id).parent_id!==parentId);
  }
  function clearDrag(){for(const root of [state.tree,state.manager])root?.querySelectorAll('.lib-drop-active,.lib-dragging').forEach(el=>el.classList.remove('lib-drop-active','lib-dragging'));}
  function bind(root){
   root.onclick=event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    try{
     if(button.hasAttribute('data-lib-toggle'))return toggleBranch(button.dataset.libToggle);
     if(button.hasAttribute('data-lib-open'))return openItem(button.dataset.libOpen,root===state.tree);
     if(button.hasAttribute('data-lib-menu'))return showMenu(button.dataset.libMenu,button);
     if(button.hasAttribute('data-lib-action'))return act(button.dataset.libAction,[...state.checked]);
     if(button.hasAttribute('data-lib-create'))return createItem(button.dataset.libCreate);
     if(button.hasAttribute('data-lib-browse'))return browse(button.dataset.libBrowse==='root'?null:button.dataset.libBrowse);
    }catch(error){options.notify?.(error.message,'error');}
   };
   root.onchange=event=>{
    const input=event.target;
    if(input.hasAttribute('data-lib-check')){const id=input.dataset.libCheck;input.checked?state.checked.add(id):state.checked.delete(id);render(true);state.manager.querySelector(`[data-lib-check="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}
    else if(input.hasAttribute('data-lib-check-all')){for(const box of root.querySelectorAll('[data-lib-check]'))input.checked?state.checked.add(box.dataset.libCheck):state.checked.delete(box.dataset.libCheck);render(true);state.manager.querySelector('[data-lib-check-all]')?.focus({preventScroll:true});}
   };
   root.onkeydown=event=>{const button=event.target.closest('[data-lib-toggle],[data-lib-open]');if(button&&root===state.tree&&['ArrowLeft','ArrowRight'].includes(event.key)){const id=button.dataset.libToggle||button.dataset.libOpen;if(node(id)?.kind!=='variation'){event.preventDefault();toggleBranch(id,event.key==='ArrowRight');}}};
   root.oncontextmenu=event=>{if(root!==state.tree)return;const row=event.target.closest('[data-lib-row]');if(row){event.preventDefault();showMenu(row.dataset.libRow,row.querySelector('[data-lib-menu]'));}};
   root.ondragstart=event=>{
    const row=event.target.closest('[data-lib-drag]');if(!row||state.busy){event.preventDefault();return;}
    hideMenu();const id=row.dataset.libDrag;dragIds=root===state.manager&&state.checked.has(id)?[...state.checked]:[id];
    if(dragIds.some(id=>node(id)?.kind==='workspace')){event.preventDefault();dragIds=[];return;}
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-mockaize-library',JSON.stringify(dragIds));row.classList.add('lib-dragging');
   };
   const destination=target=>target.closest('[data-lib-row],[data-lib-destination]');
   root.ondragover=event=>{const target=destination(event.target);clearDrag();if(target&&validDrop(dragIds,target.dataset.libDrop)){event.preventDefault();event.dataTransfer.dropEffect='move';target.classList.add('lib-drop-active');}};
   root.ondragleave=event=>{const target=destination(event.target);if(target&&!target.contains(event.relatedTarget))target.classList.remove('lib-drop-active');};
   root.ondragend=()=>{clearDrag();dragIds=[];};
   root.ondrop=async event=>{
    const target=destination(event.target),ids=[...dragIds],parentId=target?.dataset.libDrop;event.preventDefault();clearDrag();dragIds=[];
    if(!validDrop(ids,parentId))return;
    try{await mutate({action:'move_many',ids:ids.filter(id=>node(id).parent_id!==parentId),parentId});options.notify?.('Itens movidos para '+node(parentId).name+'.','success');}catch(error){options.notify?.(error.message,'error');}
   };
  }
  function breadcrumb(){
   const chain=[];for(let item=node(state.current);item;item=node(item.parent_id))chain.unshift(item);
   return `<button type="button" data-lib-browse="root">Workspaces</button>${chain.map(item=>`<span aria-hidden="true">/</span><button type="button" data-lib-browse="${h(item.id)}" data-lib-destination data-lib-drop="${h(item.id)}">${h(item.name)}</button>`).join('')}`;
  }
  function renderManager(){
   const current=node(state.current),rows=state.filter?state.nodes.filter(item=>item.name.toLocaleLowerCase().includes(state.filter.toLocaleLowerCase())):children(state.current);
   const checked=[...state.checked].map(node).filter(Boolean),hasRoots=checked.some(item=>item.kind==='workspace'),all=rows.length>0&&rows.every(item=>state.checked.has(item.id));
   state.manager.innerHTML=`<header class="lib-manager-heading"><div><p class="lib-eyebrow">SUA BIBLIOTECA</p><h2>Organizar diretórios</h2><p>Workspaces, pastas e arquivos. Do seu jeito.</p></div>${actionButton('workspace','Novo workspace','data-lib-create="workspace"')}</header><div class="lib-toolbar">${actionButton('workspace','Workspaces','data-lib-browse="root"')}${actionButton('up','Acima',`data-lib-browse="${h(current?.parent_id||'root')}"`,!current)}${actionButton('folder','Nova pasta','data-lib-create="folder"',!current)}${actionButton('variation','Novo arquivo','data-lib-create="variation"',!current)}<label class="lib-search">Buscar<input aria-label="Buscar na biblioteca" type="search" value="${h(state.filter)}" placeholder="Nome de pasta ou arquivo"></label></div><nav class="lib-breadcrumb" aria-label="Diretório atual">${breadcrumb()}</nav><div class="lib-bulk-actions"><span role="status">${checked.length?checked.length+' selecionado(s)':'Selecione itens para organizar'}</span>${actionButton('rename','Renomear','data-lib-action="rename"',checked.length!==1)}${actionButton('move','Mover','data-lib-action="move"',!checked.length||hasRoots)}${actionButton('copy','Copiar','data-lib-action="copy"',!checked.length||hasRoots)}${actionButton('delete','Excluir','data-lib-action="delete"',!checked.length)}</div><div class="lib-table" role="table" aria-label="Diretórios"><div class="lib-table-head" role="row"><span role="columnheader"><input aria-label="Selecionar todos os itens visíveis" type="checkbox" data-lib-check-all ${all?'checked':''} ${!rows.length?'disabled':''}></span><span role="columnheader">Nome</span><span role="columnheader">Tipo</span></div>${rows.map(item=>`<div class="lib-table-row ${state.checked.has(item.id)?'lib-checked':''}" role="row" data-lib-row="${h(item.id)}" ${item.kind!=='variation'?`data-lib-drop="${h(item.id)}"`:''} ${item.kind!=='workspace'?`draggable="true" data-lib-drag="${h(item.id)}"`:''}><span role="cell"><input type="checkbox" data-lib-check="${h(item.id)}" aria-label="Selecionar ${h(item.name)}" ${state.checked.has(item.id)?'checked':''}></span><span class="lib-name-cell" role="cell"><button type="button" data-lib-open="${h(item.id)}">${icon(item.kind)}<span>${h(item.name)}</span></button></span><span class="lib-type-cell" role="cell">${label(item.kind)}</span></div>`).join('')||'<div class="lib-empty">Esta pasta está vazia. Crie uma pasta ou um arquivo para começar.</div>'}</div>`;
   bind(state.manager);
   state.manager.querySelector('[data-lib-check-all]').indeterminate=!all&&rows.some(item=>state.checked.has(item.id));
   state.manager.querySelector('input[type=search]').oninput=event=>{const start=event.target.selectionStart;state.filter=event.target.value;state.checked.clear();render(true);const input=state.manager.querySelector('input[type=search]');input.focus();if(start!==null)try{input.setSelectionRange(start,start);}catch{}};
  }
  function render(preserveTree=false){
   hideMenu();
   if(state.tree&&!preserveTree){state.tree.innerHTML=(state.workspaceColumns?children(null).map(ws=>`<section><p class="nav-caption">WORKSPACE · ${h(ws.name.toLocaleUpperCase('pt-BR'))}</p>${treeMarkup(ws.id)||'<p class="lib-hint">Pasta vazia</p>'}</section>`).join(''):treeMarkup())||'<p class="lib-hint">Crie seu primeiro workspace.</p>';bind(state.tree);updateTreeWidth();}
   if(state.manager)renderManager();
   options.onRender?.(state);
  }
  return {state,node,path,act,createItem,render,mountTree:(root,{workspaceColumns=false}={})=>{state.tree=root;state.workspaceColumns=workspaceColumns;render();},mountManager:root=>{state.manager=root;render();},setNodes:nodes=>{state.nodes=nodes;render();},select:id=>{state.selected=id;render();},load:async()=>{state.nodes=(await request()).nodes;render();return state.nodes;}};
 }
 return{create,request};
})();
