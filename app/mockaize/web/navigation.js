/* Shared navigation for the library and XML studio. Persistence belongs to the
   existing library/API modules; this component only presents navigation. */
globalThis.AppNavigation=(()=>{
 'use strict';
 const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const paths={code:'m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18',folder:'M3 7h7l2 2h9v12H3z',file:'M6 3h8l4 4v14H6zM14 3v5h4',chevron:'m7 10 5 5 5-5',plus:'M12 5v14M5 12h14',repeat:'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4',filter:'M3 4h18l-7 8v8l-4-2v-6z',edit:'m4 16-1 5 5-1L20 8l-4-4zM13 7l4 4',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l4 2',download:'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4',layers:'m3 7 9-5 9 5-9 5-9-5zm0 5 9 5 9-5M3 17l9 5 9-5',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',close:'m6 6 12 12M6 18 18 6',save:'M4 3h14l3 3v15H3V3zm3 0v6h10V3M7 21v-8h10v8'};
 const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.file}"/></svg>`;
 const modes={new:{name:'Novos Registros',description:'Crie registros com fórmulas e dados de exemplo.',icon:'plus'},return:{name:'Retorno',description:'Mapeie a entrada para modelos de retorno.',icon:'repeat'},filter:{name:'Filtragem',description:'Mantenha ou remova grupos com condições.',icon:'filter'},manual:{name:'Manual',description:'Preencha registros com valores e fórmulas.',icon:'edit'}};
 const operationControl=mode=>`<div class="nav-operation-current"><button type="button" class="soft" data-nav-menu="studioMenu" aria-haspopup="menu" aria-expanded="false">${icon(modes[mode].icon)}${modes[mode].name}${icon('chevron')}</button></div>`;
 const item=(kind,title,description,attributes)=>`<button type="button" ${attributes}>${icon(kind)}<span>${h(title)}${description?`<small>${h(description)}</small>`:''}</span></button>`;
 function create(options){
  const host=document.getElementById('navigation');
  let current={},anchor=null;
  const nodes=()=>options.library.state.nodes;
  const node=id=>options.library.node(id);
  function root(id){let n=node(id);while(n?.parent_id)n=node(n.parent_id);return n;}
  function workspace(){return node(current.workspaceId)||root(current.fileId)||nodes().find(n=>n.kind==='workspace');}
  function files(){const id=workspace()?.id;return nodes().filter(n=>n.kind==='variation'&&root(n.id)?.id===id);}
  function close(){for(const menu of host.querySelectorAll(':popover-open'))menu.hidePopover();anchor?.setAttribute('aria-expanded','false');}
  host.innerHTML=`<nav class="app-nav" aria-label="Navegação principal"><button class="nav-brand" data-nav-home title="Página inicial">${icon('code')}<span>MockAíZé</span></button><button id="navWorkspace" data-nav-menu="navWorkspaceMenu" aria-label="Trocar workspace" aria-haspopup="menu" aria-expanded="false"></button><span class="nav-spacer"></span><div class="nav-menu-links"><button class="navigation-link" data-nav-menu="navLibraryMenu" aria-haspopup="dialog" aria-expanded="false">Biblioteca ${icon('chevron')}</button><button class="navigation-link" data-nav-menu="studioMenu" aria-haspopup="menu" aria-expanded="false">Estúdio ${icon('chevron')}</button><button class="navigation-link" data-nav-menu="toolsMenu" aria-haspopup="menu" aria-expanded="false">Ferramentas ${icon('chevron')}</button></div><button id="navigationSearch" class="nav-search" aria-haspopup="dialog">${icon('search')}<span>Buscar no MockAíZé</span><kbd>Ctrl K</kbd></button><span class="nav-local"><i></i>Local</span><div id="navigationTheme"></div><button class="nav-help" data-nav-tool="help" aria-label="Ajuda" title="Ajuda">${icon('help')}</button></nav><div class="navigation-context" id="navigationContext" hidden><button data-nav-menu="navLibraryMenu" aria-label="Pastas e arquivos">${icon('folder')}</button><div class="breadcrumbs" id="breadcrumbs"></div><button id="navFile" data-nav-menu="navFileMenu" aria-haspopup="menu" aria-expanded="false"></button><span class="nav-spacer"></span><button data-nav-tool="history">${icon('history')}Histórico</button></div><div id="navWorkspaceMenu" class="nav-popover nav-workspace-menu" popover="auto" role="menu"></div><div id="studioMenu" class="nav-popover" popover="auto" role="menu"></div><div id="toolsMenu" class="nav-popover" popover="auto" role="menu"></div><div id="navFileMenu" class="nav-popover nav-files-menu" popover="auto" role="menu"></div><div id="navLibraryMenu" class="nav-popover nav-library-menu" popover="auto" role="dialog" aria-label="Pastas e arquivos"><header class="nav-library-head"><div><strong>Pastas e arquivos</strong><p>Navegue sem sair do arquivo atual.</p></div><button data-nav-close aria-label="Fechar biblioteca">${icon('close')}</button></header><div id="navigationTree" class="nav-library-grid"></div><footer class="nav-library-footer"><button data-nav-library>${icon('folder')}Organizar biblioteca</button><button class="soft" data-nav-create="variation">${icon('plus')}Novo arquivo</button></footer></div><dialog id="navigationSearchDialog" class="navigation-search-dialog" aria-labelledby="navigationSearchTitle"><header><h2 id="navigationSearchTitle">Buscar arquivo</h2><button data-nav-search-close aria-label="Fechar busca">×</button></header><input id="navigationSearchInput" type="search" placeholder="Nome do arquivo, pasta ou workspace" aria-label="Buscar arquivo"><div id="navigationSearchResults"></div><footer>Ctrl K para abrir · Esc para fechar</footer></dialog>`;
  const $=id=>host.querySelector('#'+id);
  $('navigationTheme').append(options.themeButton);
  options.library.mountTree($('navigationTree'),{workspaceColumns:true});
  function renderMenu(id){
   if(id==='studioMenu')return `<p class="nav-caption">OPERAÇÃO DO ARQUIVO${current.name?' · '+h(current.name):''}</p><div class="nav-operation-grid">${Object.entries(modes).map(([key,m])=>item(m.icon,m.name,m.description,`data-nav-mode="${key}" aria-current="${key===current.mode?'page':'false'}"`)).join('')}</div><footer class="nav-operation-footer">O arquivo continua aberto ao trocar de operação. A ação de gerar e a exportação ficam junto do resultado.</footer>`;
   if(id==='toolsMenu')return '<p class="nav-caption">FERRAMENTAS DO ARQUIVO</p>'+item('download','Carregar XML','Colar, editar ou importar um arquivo','data-nav-tool="load"')+item('layers','Campos e grupos','Presença e estrutura do XML','data-nav-tool="presence"')+'<div class="nav-separator"></div>'+item('code','Baixar scripts','PowerShell e inicializador BAT','data-nav-tool="scripts" id="navScripts" '+(['manual','filter'].includes(current.mode)?'disabled':''));
   if(id==='navWorkspaceMenu')return '<p class="nav-caption">TROCAR WORKSPACE</p>'+nodes().filter(n=>n.kind==='workspace').map(n=>item('folder',n.name,n.name==='CTC'?'Arquivos de transferência de crédito':'Pastas e modelos do workspace',`data-nav-workspace="${h(n.id)}"`)).join('')+'<div class="nav-separator"></div>'+item('plus','Novo workspace','Organizar uma nova biblioteca','data-nav-create="workspace"');
   if(id==='navFileMenu')return '<p class="nav-caption">ARQUIVOS DO WORKSPACE</p>'+files().map(n=>item('file',n.name,options.library.path(n.parent_id),`data-nav-file="${h(n.id)}"`)).join('');
   return null;
  }
  function position(menu,trigger){const r=trigger.getBoundingClientRect();menu.style.left=Math.max(16,Math.min(Math.round(r.left/8)*8,Math.floor((innerWidth-menu.offsetWidth-16)/8)*8))+'px';menu.style.top=Math.max(8,Math.min(Math.round((r.bottom+8)/8)*8,Math.floor((innerHeight-menu.offsetHeight-16)/8)*8))+'px';}
  function open(id,trigger){const menu=$(id);if(menu.matches(':popover-open')&&anchor===trigger){close();return;}close();const content=renderMenu(id);if(content!==null)menu.innerHTML=content;if(menu.getAttribute('role')==='menu')menu.querySelectorAll('button').forEach(button=>button.setAttribute('role','menuitem'));anchor=trigger;trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',id);menu.showPopover();position(menu,trigger);menu.querySelector('button,summary')?.focus({preventScroll:true});}
  function update(context){current={...current,...context};const ws=workspace();$('navWorkspace').innerHTML=icon('folder')+h(ws?.name||'Workspace')+icon('chevron');$('navigationContext').hidden=!current.fileId;const file=node(current.fileId);$('breadcrumbs').textContent=file?options.library.path(file.parent_id)+' /':'';$('navFile').innerHTML=icon('file')+'<strong>'+h(current.name||file?.name||'')+'</strong>'+icon('chevron');host.querySelectorAll('.navigation-link').forEach(b=>b.classList.toggle('is-current',b.dataset.navMenu===(current.fileId?'studioMenu':current.view==='library'?'navLibraryMenu':'')));}
  function results(){const q=$('navigationSearchInput').value.toLocaleLowerCase('pt-BR'),matches=nodes().filter(n=>n.kind==='variation'&&(n.name+' '+options.library.path(n.parent_id)).toLocaleLowerCase('pt-BR').includes(q));$('navigationSearchResults').innerHTML=matches.map(n=>item('file',n.name,options.library.path(n.parent_id),`data-nav-file="${h(n.id)}"`)).join('')||'<p>Nenhum arquivo encontrado.</p>';}
  function search(){close();$('navigationSearchInput').value='';results();$('navigationSearchDialog').showModal();$('navigationSearchInput').focus();}
  $('navigationSearch').onclick=search;$('navigationSearchInput').oninput=results;
  async function act(button){
   if(button.hasAttribute('data-nav-close')){close();return;}
   if(button.hasAttribute('data-nav-search-close')){$('navigationSearchDialog').close();return;}
   if(button.dataset.navMenu){open(button.dataset.navMenu,button);return;}
   close();if($('navigationSearchDialog').open)$('navigationSearchDialog').close();
   if(button.dataset.navFile)return options.onOpen(button.dataset.navFile);
   if(button.dataset.navMode)return options.onMode(button.dataset.navMode);
   if(button.dataset.navWorkspace)return options.onWorkspace(button.dataset.navWorkspace);
   if(button.dataset.navTool)return options.onTool(button.dataset.navTool);
   if(button.dataset.navCreate)return options.library.createItem(button.dataset.navCreate,options.library.state.current||options.library.state.selected||workspace()?.id);
   if(button.hasAttribute('data-nav-home'))return options.onHome();
   if(button.hasAttribute('data-nav-library'))return options.onLibrary();
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-nav-menu],[data-nav-file],[data-nav-mode],[data-nav-workspace],[data-nav-tool],[data-nav-create],[data-nav-home],[data-nav-library],[data-nav-close],[data-nav-search-close]');if(button)Promise.resolve(act(button)).catch(error=>options.notify(error.message,'error'));});
  document.addEventListener('keydown',event=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search();return;}
   const menu=event.target.closest('.nav-popover');if(!menu||event.target.closest('#navigationTree'))return;
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}
  });
  for(const popover of host.querySelectorAll('[popover]'))popover.addEventListener('toggle',event=>{if(event.newState==='closed')document.querySelectorAll(`[aria-controls="${popover.id}"]`).forEach(b=>b.setAttribute('aria-expanded','false'));});
  window.addEventListener('resize',()=>{if(anchor)for(const menu of host.querySelectorAll(':popover-open'))position(menu,anchor);});
  $('navigationTree').addEventListener('click',event=>{if(event.target.closest('[data-lib-open]')&&node(event.target.closest('[data-lib-open]').dataset.libOpen)?.kind==='variation')close();});
  update(options.context||{});
  return{update,close,search};
 }
 return{create,operationControl,modes,icon};
})();
