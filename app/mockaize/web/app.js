(() => {
 'use strict';
 const $=id=>document.getElementById(id),csrf=document.querySelector('meta[name="csrf-token"]').content;
 let settings={};
 function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,4200);}
 async function api(url,method='GET',body){const response=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível concluir a operação.');return result;}
 function showLibrary(open){document.querySelectorAll('.hero,.overview,.create-panel,.structure-guide').forEach(el=>el.hidden=open);$('libraryManager').hidden=!open;document.querySelector('.page-location h1').textContent=open?'Organizar diretórios':'Visão geral';const url=new URL(location);url.searchParams.set('view',open?'library':'home');history.replaceState(null,'',url);}
 const library=LibraryUI.create({notify,onOpen:id=>{location.href='/studio?id='+encodeURIComponent(id);},onSelect:()=>showLibrary(true),onRender:state=>{
  $('empty').hidden=state.nodes.length>0;$('exportPs').disabled=library?.node(state.selected)?.kind!=='variation';
  $('counts').innerHTML=[['workspace','Workspace','Workspaces'],['folder','Pasta','Pastas'],['variation','Arquivo / variação','Arquivos / variações']].map(([kind,single,plural])=>{const count=state.nodes.filter(n=>n.kind===kind).length;return `<div class="metric"><strong>${String(count).padStart(2,'0')}</strong><span>${count===1?single:plural}</span></div>`;}).join('');
  const parent=library?.node(state.selected);$('selection').textContent=$('kind').value==='workspace'?'Workspace é a pasta principal.':parent?`Criar dentro de “${parent.kind==='variation'?library.path(parent.parent_id):library.path(parent.id)}”.`:'Selecione um workspace ou uma pasta na lateral.';
 }});
 library.mountTree($('tree'));library.mountManager($('libraryManager'));
 document.querySelectorAll('.home-link,.brand').forEach(el=>el.addEventListener('click',()=>showLibrary(false)));
 $('organizeLibrary').onclick=()=>showLibrary(true);
 $('kind').onchange=()=>library.render();
 $('createForm').onsubmit=async event=>{event.preventDefault();const kind=$('kind').value;let parent=library.node(library.state.selected||library.state.current);if(parent?.kind==='variation')parent=library.node(parent.parent_id);const button=event.submitter;button.disabled=true;try{const result=await LibraryUI.request({action:'create',kind,parentId:kind==='workspace'?null:parent?.id,name:$('name').value});library.state.selected=result.id;library.setNodes(result.library.nodes);$('name').value='';if(kind==='variation')location.href='/studio?id='+encodeURIComponent(result.id);else{library.state.current=result.id;showLibrary(true);library.render();}}catch(e){notify(e.message);}finally{button.disabled=false;}};
 $('exportPs').onclick=()=>{const selected=library.node(library.state.selected);if(selected?.kind==='variation')location.href='/studio?id='+encodeURIComponent(selected.id)+'&export=1';else notify('Abra um arquivo no estúdio para exportar PS1 + BAT.');};
 function theme(){const value=settings.theme==='light'?'light':'dark';document.documentElement.dataset.theme=value;$('themeButton').textContent='Tema: '+(value==='light'?'claro':'escuro');}
 $('themeButton').onclick=async()=>{try{settings=await api('/api/settings','PUT',{theme:document.documentElement.dataset.theme==='light'?'dark':'light'});theme();}catch(e){notify(e.message);}};
 (async()=>{try{settings=await api('/api/settings');theme();await library.load();const params=new URLSearchParams(location.search),parent=params.get('parent');if(!params.has('view')&&!location.hash&&library.node(settings.lastSelection?.variationId)){location.replace('/studio?id='+encodeURIComponent(settings.lastSelection.variationId));return;}if(library.node(parent)){library.state.current=parent;library.state.selected=parent;library.render();}showLibrary(params.get('view')==='library');}catch(e){notify(e.message);}})();
})();
