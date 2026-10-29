/* Filter whole XML groups by structural paths, independently of occurrence indexes. */
globalThis.XmlFilter=(()=>{
 'use strict';
 const X=MockXml,parts=path=>JSON.parse(path),same=(a,b)=>a.name===b.name&&(a.ns||'')===(b.ns||'')&&!!a.attribute===!!b.attribute;
 const prefix=(a,b)=>a.length<=b.length&&a.every((p,i)=>same(p,b[i]));
 const identity=path=>JSON.stringify(parts(path).map(p=>({...p,...(!p.attribute?{index:1}:{})})));
 function select(root,path){let current=[root];for(const p of path)current=current.flatMap(n=>p.attribute?Array.from(n.attributes||[]):Array.from(n.children||[])).filter(n=>(n.localName||n.nodeName)===p.name&&(n.namespaceURI||'')===(p.ns||''));return current;}
 const occurrences=(doc,path)=>select(doc,parts(path));
 function groups(doc,headers=[]){const seen=new Set();return X.nodes(doc).filter(n=>n.isGroup&&parts(n.key).length>1&&!headers.some(k=>{const a=parts(k),b=parts(n.key);return prefix(a,b)||prefix(b,a);})).filter(n=>{const k=identity(n.key);if(seen.has(k))return false;seen.add(k);return true;}).map(n=>({...n,count:occurrences(doc,n.key).length})).sort((a,b)=>b.count-a.count);}
 function fields(doc,group){const parent=parts(group),seen=new Set();return X.nodes(doc).filter(n=>parts(n.key).length>parent.length&&prefix(parent,parts(n.key))).filter(n=>{const k=identity(n.key);if(seen.has(k))return false;seen.add(k);return true;});}
 const operators={exists:'Campo presente',missing:'Campo ausente',equals:'Valor igual a',notEquals:'Valor diferente de',contains:'Valor contém',notContains:'Valor não contém',empty:'Valor vazio',notEmpty:'Valor preenchido'};
 function matches(node,group,condition){const path=parts(condition.path),base=parts(group);if(!prefix(base,path)||path.length<=base.length)throw Error('Escolha um campo dentro do grupo filtrado.');const values=select(node,path.slice(base.length)).map(n=>(n.nodeType===2?n.value:n.textContent).trim()),value=condition.value.trim();switch(condition.operator){case'exists':return values.length>0;case'missing':return !values.length;case'equals':return values.some(v=>v===value);case'notEquals':return values.length>0&&values.every(v=>v!==value);case'contains':return values.some(v=>v.includes(value));case'notContains':return values.length>0&&values.every(v=>!v.includes(value));case'empty':return values.some(v=>v==='');case'notEmpty':return values.some(v=>v!=='');default:throw Error('Condição de filtro inválida.');}}
 function connector(config,index){return config.conditions[index].connector||(config.match==='any'?'or':'and');}
 function combine(tests,config){
  // AND binds inside each term; OR separates the terms. No expression evaluation.
  let matched=false,term=tests[0];
  for(let i=1;i<tests.length;i++){if(connector(config,i)==='or'){matched=matched||term;term=tests[i];}else term=term&&tests[i];}
  return matched||term;
 }
 function expression(config){
  const terms=[];let current=[];
  config.conditions.forEach((_,i)=>{if(i&&connector(config,i)==='or'){terms.push(current);current=[];}current.push('Condição '+(i+1));});
  if(current.length)terms.push(current);
  return terms.map(term=>term.length>1?'('+term.join(' E ')+')':term[0]).join(' OU ');
 }
 function run(xml,config,headers=[]){
  const doc=X.parse(xml);
  if(!groups(doc,headers).some(g=>identity(g.key)===identity(config.group)))throw Error('Selecione um grupo válido que não seja cabeçalho nem contenha um cabeçalho.');
  if(!config.conditions.length)throw Error('Adicione pelo menos uma condição.');
  if(config.conditions.some(c=>!c.path))throw Error('Selecione o campo de cada condição.');
  const nodes=occurrences(doc,config.group),removedPaths=[];let matched=0;
  // Capture original indexed paths before removing siblings changes their indexes.
  const decisions=nodes.map(node=>{const tests=config.conditions.map(c=>matches(node,config.group,c)),match=combine(tests,config);return{node,match,path:X.key(node)};});
  for(const {node,match,path} of decisions){if(match)matched++;if(config.action==='remove'?match:!match){removedPaths.push(path);node.remove();}}
  return{xml:X.serialize(doc),count:nodes.length-removedPaths.length,originalCount:nodes.length,matched,removed:removedPaths.length,removedPaths,group:config.group,name:'filtrado.xml'};
 }

 function values(doc,formula,readNode=node=>node.nodeType===2?node.value:node.textContent){const base=parts(formula.group),path=parts(formula.path);if(!prefix(base,path)||path.length<=base.length)throw Error('Selecione um campo dentro do grupo a somar.');return occurrences(doc,formula.group).flatMap(node=>select(node,path.slice(base.length))).map(readNode);}
 return{groups,fields,run,occurrences,operators,values,connector,expression};
})();
globalThis.FilterStudio=(()=>{
 'use strict';
 function create(o){
  const {state,X,h}=o,$=id=>document.getElementById(id),F=XmlFilter;
  let timer=null,cachedXml=null,cachedDoc=null,owner=null,previous=false,previewError='',exporting=false,fakerValues={},fakerRevision=0,fakerSeed=crypto.randomUUID();
  const conditionIds=new WeakMap(),expandedConditions=new WeakSet();let sorting=null;
  const folds={current:{xml:null,closed:new Set()},previous:{xml:null,closed:new Set()}};
  const data=()=>state.draft.filter;
  const presets=()=>state.draft.filterPresets;
  const activePreset=()=>presets().find(p=>p.id===state.draft.activeFilterPresetId);
  let savingPreset=false,nameEditor=false;const nameCache=new Map();
  function headers(){return [...new Set([...(state.draft.headersByMode?.new||[]),...(state.draft.headersByMode?.return||[])])];}
  function source(){const xml=o.inputText();if(xml!==cachedXml){cachedXml=xml;cachedDoc=null;try{cachedDoc=X.parse(xml);}catch{}}return cachedDoc;}
  function ensure(){
   state.draft.filter??={group:'',action:'keep',match:'all',conditions:[],fileName:''};
   state.draft.filter.filename??={type:'literal',value:state.draft.filter.fileName||'filtrado.xml'};
   state.draft.filterPresets??=[];state.draft.activeFilterPresetId??='';
   if(owner!==state.draft.id+'\n'+o.inputText()){owner=state.draft.id+'\n'+o.inputText();fakerRevision++;fakerValues={};fakerSeed=crypto.randomUUID();previous=false;nameEditor=false;nameCache.clear();}
   const f=data(),doc=source();
   if(doc&&!f.group){const groups=F.groups(doc,headers());f.group=groups.find(g=>g.key===state.draft.inputGroup)?.key||groups.find(g=>g.count>1)?.key||groups[0]?.key||'';}
  }
  function select(id,label,options,value,attrs=''){return `<div class="filter-control"><label for="${id}">${label}</label><select id="${id}" ${attrs}>${options.map(([key,text])=>`<option value="${h(key)}" ${key===value?'selected':''}>${h(text)}</option>`).join('')}</select></div>`;}
  function head(){ensure();$('pageHead').innerHTML=`<div class="filter-head"><div class="operation-field"><label>Operação</label>${AppNavigation.operationControl('filter')}</div><div class="filter-name-summary" hidden><code id="filterNameSummary">${h(state.snapshot?.name||data().fileName||'filtrado.xml')}</code></div></div>`;$('editorToolbar').innerHTML='';}
  function presetHeader(){
   const selected=activePreset(),modified=selected&&JSON.stringify(selected.filter)!==JSON.stringify(data());
   const saveLabel=selected?'Salvar preset':'Salvar como preset';
   const svg=path=>`<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
   return `<div class="filter-preset-block filter-preset-header"><label class="sr-only" for="filterPresetTrigger">Preset do filtro${modified?' · alterações locais':''}</label><div id="filterPresetCombobox" class="return-combobox"></div><div class="filter-preset-actions"><button class="ghost small" data-filter-action="save-preset" aria-label="${saveLabel}" title="${saveLabel}" ${selected&&!modified?'disabled':''}>${svg('<path d="M4 3h14l3 3v15H3V3zm3 0v6h10V3M7 21v-8h10v8"/>')}</button><button class="ghost small" data-filter-action="new-preset" aria-label="Adicionar preset" title="Adicionar preset">＋</button><button class="ghost small" data-filter-action="rename-preset" aria-label="Renomear preset" title="Renomear preset" ${selected?'':'disabled'}>${svg('<path d="m16 3 5 5M4 20l4-1L21 6l-3-3L5 16z"/>')}</button><button class="ghost small danger" data-filter-action="delete-preset" aria-label="Excluir preset" title="Excluir preset" ${selected?'':'disabled'}>${svg('<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>')}</button></div></div>`;
  }
  function conditionId(condition){if(!conditionIds.has(condition))conditionIds.set(condition,crypto.randomUUID());return conditionIds.get(condition);}
  function conditionSummary(condition){
   let field='Selecione um campo';try{field=JSON.parse(condition.path).map(part=>part.name).slice(-2).join(' / ');}catch{}
   return field+' · '+(F.operators[condition.operator]||'Escolha a condição')+(['exists','missing','empty','notEmpty'].includes(condition.operator)?'':condition.value?' “'+condition.value+'”':'');
  }
  function conditionCard(c,i,fields){
   const id=conditionId(c),closed=!expandedConditions.has(c);
   const svg=content=>`<svg viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
   return `<section class="filter-condition ${closed?'is-collapsed':''}" data-condition-id="${id}" data-condition-index="${i}" aria-label="Condição ${i+1}"><div class="filter-condition-head"><button type="button" class="filter-sort-handle" data-filter-handle="${i}" aria-label="Mover condição ${i+1}" aria-describedby="filterSortHelp" title="Arraste para reordenar · ↑ e ↓ pelo teclado">${svg('<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>')}</button><button type="button" class="filter-condition-toggle" data-filter-action="toggle-condition" data-index="${i}" aria-expanded="${!closed}" aria-controls="conditionBody-${id}"><span class="filter-condition-heading"><strong>Condição ${i+1}</strong><span class="filter-condition-summary">${h(conditionSummary(c))}</span></span>${svg('<path d="m6 9 6 6 6-6"/>')}</button><button type="button" class="filter-condition-remove" data-filter-action="remove" data-index="${i}" aria-label="Remover condição ${i+1}" title="Remover condição">${svg('<path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/>')}</button></div><div class="filter-condition-body" id="conditionBody-${id}" ${closed?'hidden':''}>${select('filterField'+i,'Campo ou grupo',[['','Selecione um campo'],...fields.map(n=>[n.key,n.display])],c.path,`data-filter-condition="path" data-index="${i}"`)}${select('filterOperator'+i,'Condição',Object.entries(F.operators),c.operator,`data-filter-condition="operator" data-index="${i}"`)}<div class="filter-control"><label for="filterValue${i}">Valor</label><input id="filterValue${i}" data-filter-condition="value" data-index="${i}" maxlength="2000" value="${h(c.value)}" ${['exists','missing','empty','notEmpty'].includes(c.operator)?'disabled placeholder="Não se aplica"':''}></div></div></section>`;
  }
  function builder(){
   const f=data(),doc=source(),groups=doc?F.groups(doc,headers()):[],fields=doc&&f.group?F.fields(doc,f.group):[];
   return `<div class="filter-builder">${select('filterGroup','Grupo a filtrar',[['','Selecione um grupo'],...groups.map(g=>[g.key,g.display+' · '+g.count+' ocorrência(s)'])],f.group,'data-filter="group"')}${select('filterAction','Ação',[['keep','Manter grupos correspondentes'],['remove','Excluir grupos correspondentes']],f.action,'data-filter="action"')}<p class="sr-only" id="filterSortHelp">Arraste pela alça para reordenar. Com a alça em foco, use as setas para cima e para baixo.</p><div class="filter-conditions">${f.conditions.map((c,i)=>`${i?`<div class="filter-connector">${select('filterConnector'+i,'Combinar com a condição '+(i+1),[['and','E'],['or','OU']],F.connector(f,i),`data-filter-condition="connector" data-index="${i}"`)}</div>`:''}${conditionCard(c,i,fields)}`).join('')||'<p class="hint">Sem condições, o documento completo é mantido.</p>'}</div><span class="sr-only" role="status" id="filterSortStatus"></span>${f.conditions.length>1?`<div class="filter-expression"><strong>Combinação das condições</strong><code>${h(F.expression(f))}</code><p class="hint">E é avaliado antes de OU, conforme os parênteses acima.</p></div>`:''}<button class="small soft" data-filter-action="add" ${!fields.length||f.conditions.length>=100?'disabled':''}>＋ Adicionar condição</button><p class="hint">Cada ocorrência do grupo é avaliada separadamente. A prévia atualiza enquanto você edita. Os valores diferenciam maiúsculas de minúsculas.</p><p id="filterError" class="callout error" role="status" ${previewError?'':'hidden'}>${h(previewError)}</p></div>`;
  }
  function toggleCondition(index){
   const condition=data().conditions[index];if(!condition)return;
   const card=$('inputPanel').querySelector(`[data-condition-id="${conditionId(condition)}"]`),closed=expandedConditions.has(condition);
   if(closed)expandedConditions.delete(condition);else expandedConditions.add(condition);
   card.classList.toggle('is-collapsed',closed);card.querySelector('.filter-condition-body').hidden=closed;card.querySelector('.filter-condition-toggle').setAttribute('aria-expanded',String(!closed));
  }
  function moveCondition(from,to){
   const conditions=data().conditions;if(from===to||to<0||to>=conditions.length)return;
   const joins=conditions.slice(1).map((_,i)=>F.connector(data(),i+1)),moving=conditions[from];
   const positions=new Map([...$('inputPanel').querySelectorAll('[data-condition-id]')].map(card=>[card.dataset.conditionId,card.getBoundingClientRect().top]));
   o.remember();conditions.splice(from,1);conditions.splice(to,0,moving);
   // Operators belong to the gaps between cards, so reordering preserves E/OU choices.
   conditions.forEach((condition,i)=>{condition.connector=i?joins[i-1]:'and';});o.changed();o.render();
   const card=$('inputPanel').querySelector(`[data-condition-id="${conditionId(moving)}"]`);card?.querySelector('[data-filter-handle]')?.focus({preventScroll:true});
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const el of $('inputPanel').querySelectorAll('[data-condition-id]')){const old=positions.get(el.dataset.conditionId);if(old!==undefined){const offset=old-el.getBoundingClientRect().top;if(offset)el.animate([{transform:`translateY(${offset}px)`},{transform:'translateY(0)'}],{duration:180,easing:'ease-out'});}}
   const status=$('filterSortStatus');if(status)status.textContent='Condição movida para a posição '+(to+1)+'.';
  }
  function sortTarget(clientY){
   const cards=[...$('inputPanel').querySelectorAll('[data-condition-id]')].filter(card=>card.dataset.conditionId!==sorting.id);
   const before=cards.findIndex(card=>{const rect=card.getBoundingClientRect();return clientY<(rect.top+rect.bottom)/2;});
   return before<0?cards.length:before;
  }
  function sortFrame(){
   if(!sorting?.moved)return;
   if(state.draft!==sorting.draft||state.draft?.mode!=='filter'){endSort(true);return;}
   const scroll=$('inputCode'),rect=scroll.getBoundingClientRect(),y=sorting.y;
   if(y<rect.top+48)scroll.scrollTop-=Math.min(16,(rect.top+48-y)/3);else if(y>rect.bottom-48)scroll.scrollTop+=Math.min(16,(y-rect.bottom+48)/3);
   sorting.to=sortTarget(y);sorting.overlay.style.transform=`translate(${sorting.x-sorting.offsetX}px,${y-sorting.offsetY}px)`;
   const others=[...$('inputPanel').querySelectorAll('[data-condition-id]')].filter(card=>card.dataset.conditionId!==sorting.id);
   for(const card of $('inputPanel').querySelectorAll('[data-condition-id]'))card.classList.remove('sort-before','sort-after');
   if(sorting.to<others.length)others[sorting.to].classList.add('sort-before');else others.at(-1)?.classList.add('sort-after');
   sorting.frame=requestAnimationFrame(sortFrame);
  }
  function endSort(cancel=false){
   if(!sorting)return;if(!cancel&&sorting.moved)sorting.to=sortTarget(sorting.y);const done=sorting;sorting=null;cancelAnimationFrame(done.frame);done.overlay?.remove();
   for(const card of document.querySelectorAll('.filter-condition'))card.classList.remove('is-sorting','sort-before','sort-after');
   if(done.handle.hasPointerCapture(done.pointerId))done.handle.releasePointerCapture(done.pointerId);
   if(!cancel&&done.moved&&state.draft===done.draft&&data().conditions===done.conditions)moveCondition(done.from,done.to);
  }
  document.addEventListener('pointerdown',event=>{
   const handle=event.target.closest('[data-filter-handle]');if(!handle||state.draft?.mode!=='filter'||event.button!==0)return;
   event.preventDefault();endSort(true);handle.focus({preventScroll:true});handle.setPointerCapture(event.pointerId);
   const card=handle.closest('[data-condition-id]'),rect=card.querySelector('.filter-condition-head').getBoundingClientRect();
   sorting={handle,pointerId:event.pointerId,from:Number(handle.dataset.filterHandle),to:Number(handle.dataset.filterHandle),id:card.dataset.conditionId,card,draft:state.draft,conditions:data().conditions,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,width:rect.width,moved:false};
  });
  document.addEventListener('pointermove',event=>{
   if(!sorting||event.pointerId!==sorting.pointerId)return;
   sorting.x=event.clientX;sorting.y=event.clientY;
   if(!sorting.moved&&Math.hypot(event.clientX-sorting.startX,event.clientY-sorting.startY)>5){
    sorting.moved=true;sorting.card.classList.add('is-sorting');const overlay=sorting.card.querySelector('.filter-condition-head').cloneNode(true);overlay.className='filter-sort-overlay';overlay.setAttribute('aria-hidden','true');overlay.inert=true;overlay.style.width=sorting.width+'px';document.body.append(overlay);sorting.overlay=overlay;sortFrame();
   }
  });
  document.addEventListener('pointerup',event=>{if(sorting&&event.pointerId===sorting.pointerId)endSort();});
  document.addEventListener('pointercancel',()=>endSort(true));
  window.addEventListener('blur',()=>endSort(true));
  document.addEventListener('keydown',event=>{
   if(sorting&&event.key==='Escape'){event.preventDefault();endSort(true);return;}
   const handle=event.target.closest('[data-filter-handle]');if(!handle||state.draft?.mode!=='filter'||!['ArrowUp','ArrowDown'].includes(event.key))return;
   event.preventDefault();const from=Number(handle.dataset.filterHandle);moveCondition(from,from+(event.key==='ArrowUp'?-1:1));
  });
  function mountPresets(){
   const host=$('filterPresetCombobox');if(!host)return;
   ReturnCombobox.mount(host,{idPrefix:'filterPreset',items:[{id:'',name:'Personalizado (sem preset)'},...presets()],value:state.draft.activeFilterPresetId,
    text:{label:'Preset do filtro',placeholder:'Selecione um preset',search:'Pesquisar presets…',searchLabel:'Pesquisar presets',list:'Presets de filtros',empty:'Nenhum preset encontrado.',add:'Adicionar preset'},
    onChange:id=>{if(savingPreset)return;if(state.formulaDirty&&!o.applyName())return;state.formulaDraft=null;state.editorBaseline=null;state.formulaDirty=false;o.remember();state.draft.activeFilterPresetId=id;const selected=activePreset();if(selected)state.draft.filter=structuredClone(selected.filter);o.changed();o.render();},onAdd:()=>presetNameDialog()});
  }
  function validPresetName(value,exceptId=''){
   const name=value.trim();if(!name||name.length>120)throw Error('Informe um nome de preset com até 120 caracteres.');
   if(presets().some(p=>p.id!==exceptId&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Já existe um preset com esse nome.');
   return name;
  }
  function checkPreset(){
   if(data().conditions.some(c=>!c.path))throw Error('Selecione o campo de cada condição antes de salvar o preset.');
   if(state.formulaDirty&&!o.applyName())throw Error('Revise a fórmula do nome antes de salvar o preset.');
   evaluateName(data().filename);
  }
  async function persistPreset(change){
   if(savingPreset)return false;
   savingPreset=true;const before={presets:structuredClone(presets()),active:state.draft.activeFilterPresetId};
   try{o.remember();change();o.changed();o.render();if(!await o.save()){state.draft.filterPresets=before.presets;state.draft.activeFilterPresetId=before.active;o.changed(false);o.render();return false;}return true;}
   finally{savingPreset=false;}
  }
  function presetNameDialog(rename=false){
   if(savingPreset)return;
   const selected=rename?activePreset():null;if(rename&&!selected)return;
   if(!rename&&presets().length>=50)return o.notify('Cada arquivo aceita até 50 presets.','warning');
   o.openModal(rename?'Renomear preset':'Salvar preset de filtro','O preset guarda o grupo, as condições, a ação e o nome do XML.',`<div class="form-field"><label for="filterPresetName">Nome do preset</label><input id="filterPresetName" maxlength="120" value="${h(selected?.name||'')}" placeholder="Ex.: Correspondentes de Recife"></div>`,[
    {text:'Cancelar',run:o.closeModal},{text:rename?'Renomear':'Salvar preset',primary:true,run:async()=>{
     const name=validPresetName($('filterPresetName').value,selected?.id);if(!rename)checkPreset();
     const ok=await persistPreset(()=>{if(rename)selected.name=name;else{const preset={id:crypto.randomUUID(),name,filter:structuredClone(data())};presets().push(preset);state.draft.activeFilterPresetId=preset.id;}});
     if(ok){o.closeModal();o.notify(rename?'Preset renomeado.':'Preset salvo.','success');}
    }}]);
  }
  async function savePreset(){
   const selected=activePreset();if(!selected)return presetNameDialog();
   try{checkPreset();if(await persistPreset(()=>{selected.filter=structuredClone(data());}))o.notify('Preset atualizado.','success');}catch(error){o.notify(error.message,'error');}
  }
  function deletePreset(){
   const selected=activePreset();if(!selected)return;
   o.openModal('Excluir preset?',selected.name,'<p>O preset será excluído. Os filtros atuais continuam disponíveis para edição.</p>',[
    {text:'Cancelar',run:o.closeModal},{text:'Excluir preset',danger:true,run:async()=>{if(await persistPreset(()=>{state.draft.filterPresets=presets().filter(p=>p.id!==selected.id);state.draft.activeFilterPresetId='';})){o.closeModal();o.notify('Preset excluído.','success');}}}]);
  }
  function context(snapshot=state.snapshot){
   const input=source(),output=snapshot?.xml?X.parse(snapshot.xml):input;
   const read=(doc,path)=>{const node=doc&&X.resolve(doc,path);if(!node)throw Error('Campo não encontrado: '+X.display(path));return node.nodeType===2?node.value:node.textContent;};
   return{...o.nameContext(),count:snapshot?.count??0,recordIndex:0,profiles:new Map(),fakerValues,sourceValue:path=>read(input,path),outputValue:path=>read(output,path),groupValues:f=>F.values(f.source==='input'?input:output,f)};
  }
  function evaluateName(formula,snapshot=state.snapshot){
   const ctx=context(snapshot),key=JSON.stringify([formula,o.inputText(),snapshot?.xml,ctx.fileIndex,ctx.baseDate,ctx.configName]);
   if(!nameCache.has(key)){if(nameCache.size>=8)nameCache.delete(nameCache.keys().next().value);nameCache.set(key,MockEngine.filename(MockEngine.evaluate(formula,ctx)));}
   return nameCache.get(key);
  }
  function toggleName(){
   nameEditor=!nameEditor;state.inspectorOpen=false;
   if(nameEditor){state.inspectorMode='filename';state.inspectorTab='value';}
   o.render();
  }
  function compute(){
   if(timer){clearTimeout(timer);timer=null;}
   previewError='';const doc=source(),f=data();let snapshot;
   if(!doc){state.snapshot=null;state.stale=false;return;}
   try{
    if(f.conditions.length)snapshot=F.run(o.inputText(),f,headers());
    else{const count=f.group?F.occurrences(doc,f.group).length:0;snapshot={xml:X.serialize(doc),count,originalCount:count,removed:0,removedPaths:[],matched:0,group:f.group,name:'filtrado.xml'};}
    snapshot.name=evaluateName(f.filename,snapshot);state.snapshot=snapshot;
    state.stale=false;
   }catch(error){previewError=error.message;state.stale=true;}
  }
  const tokenPattern=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[^\s/!?<>](?:"[^"]*"|'[^']*'|[^'">])*>/g;
  function syntax(line){return h(line).replace(/(&lt;\/?[\w:.-]+)([\s\S]*?)(&gt;)/g,'<span class="xml-tag">$1</span>$2<span class="xml-tag">$3</span>');}
  function markup(xml){
   const fold=previous?folds.previous:folds.current;
   if(fold.xml!==xml){fold.xml=xml;fold.closed.clear();}
   const stack=[],ranges=new Map(),removedLines=new Set(),removed=new Set(previous?state.snapshot?.removedPaths||[]:[]),elements=previous&&source()?Array.from(source().getElementsByTagName('*')):[];let line=0,last=0,elementIndex=0;
   for(const match of xml.matchAll(tokenPattern)){
    line+=(xml.slice(last,match.index).match(/\n/g)||[]).length;
    const token=match[0],start=line;line+=(token.match(/\n/g)||[]).length;last=match.index+token.length;
    if(token.startsWith('</')){const open=stack.pop();if(open){if(line>open.line)ranges.set(open.line,{end:line,name:open.name});if(open.removed)for(let i=open.line;i<=line;i++)removedLines.add(i);}}
    else if(!/^<[/!?]/.test(token)){
     const element=elements[elementIndex++],deleted=element&&removed.has(X.key(element));
     if(token.endsWith('/>')){if(deleted)for(let i=start;i<=line;i++)removedLines.add(i);}
     else stack.push({line:start,name:token.match(/^<([^\s/>]+)/)[1],removed:deleted});
    }
   }
   let hiddenUntil=-1;
   return '<div class="filter-xml" aria-label="XML completo">'+xml.trimEnd().split('\n').map((text,i)=>{
    const hidden=i<=hiddenUntil,range=ranges.get(i),closed=range&&fold.closed.has(i);
    if(closed)hiddenUntil=Math.max(hiddenUntil,range.end);
    return `<div class="filter-xml-line ${removedLines.has(i)?'filter-line-removed':''}" data-filter-line="${i}" ${hidden?'hidden':''}><span class="filter-line-number" aria-hidden="true">${i+1}</span>${range?`<button type="button" class="filter-fold" data-filter-action="fold" data-line="${i}" aria-expanded="${!closed}" aria-label="${closed?'Expandir':'Recolher'} ${h(range.name)}" title="${closed?'Expandir':'Recolher'} tag">${closed?'+':'−'}</button>`:'<span class="filter-fold-space"></span>'}<code>${syntax(text)}${closed?'<span class="filter-fold-summary"> … &lt;/'+h(range.name)+'&gt;</span>':''}</code></div>`;
   }).join('')+'</div>';
  }
  function output(){
   const scroll=$('outputCode'),position={top:scroll?.scrollTop||0,left:scroll?.scrollLeft||0},doc=source();
   const summary=$('filterNameSummary');if(summary)summary.textContent=state.snapshot?.name||'Revise a fórmula do nome';
   const snap=state.snapshot,xml=previous||!snap?(doc?X.serialize(doc):''):snap.xml;
   $('outputPanel').innerHTML=`<div class="pane-head"><div class="pane-title-row"><span class="pane-title">${previous?'Versão anterior · XML original':'XML filtrado'}</span><div class="pane-actions"><button class="small ${previous?'soft':''}" data-filter-action="previous" aria-pressed="${previous}" ${doc?'':'disabled'}>${previous?'Voltar ao filtrado':'Versão anterior'}</button></div></div></div><div class="code-scroll" id="outputCode">${xml?markup(xml):'<div class="empty"><p>Cole ou importe um XML no painel de filtros.</p></div>'}</div>`;
   $('outputCode').scrollTop=position.top;$('outputCode').scrollLeft=position.left;
   const error=$('filterError');if(error){AppAlerts.render(error,previewError,{type:'error'});}
  }
  function render(){
   ensure();compute();
   $('inputPanel').innerHTML=`<div class="pane-head"><div class="pane-title-row"><span class="pane-title">${nameEditor?'Nome do arquivo':'Filtragem'}</span><div class="pane-actions">${nameEditor?'':o.loadXmlButton()}${nameEditor?'':presetHeader()}</div></div></div><div class="code-scroll filter-form" id="inputCode">${nameEditor?'<div id="filterNameEditor" class="filter-name-editor"></div>':builder()}</div>`;
   $('inputPanel').classList.remove('mobile-hidden');$('outputPanel').classList.remove('mobile-hidden');if(!nameEditor)mountPresets();output();refresh();
  }
  function footer(){o.presentation?.();const snap=state.snapshot,ready=snap&&!state.stale;$('bottomBar').innerHTML=`<div class="bottom-summary" role="status">${h(previewError||(snap?snap.count+' de '+snap.originalCount+' grupo(s) mantido(s)':'Configure as condições no painel esquerdo.'))}</div><div class="export-actions"><span class="filename-summary">${h(snap?.name||'filtrado.xml')}</span><button data-filter-action="export" data-action="export-xml" ${ready&&!exporting?'':'disabled'}>↓ Exportar XML filtrado</button></div>`;}
  async function hydrateFaker(formula=data().filename){const config=await o.resolveFaker({mode:'new',fakerSeed,count:1,rules:{},filename:formula},o.inputText());return config.fakerValues||{};}
  async function previewFormulaAsync(formula){const revision=fakerRevision,values=await hydrateFaker(formula);if(revision!==fakerRevision)throw new DOMException('A seleção mudou.','AbortError');Object.assign(fakerValues,values);return evaluateName(formula);}
  async function refresh(){if(state.draft?.mode!=='filter')return;const revision=++fakerRevision;let values;try{values=await hydrateFaker();}catch(error){if(revision!==fakerRevision)return;previewError=error.message;state.stale=true;output();footer();return;}if(revision!==fakerRevision||state.draft?.mode!=='filter')return;fakerValues=values;compute();output();footer();}
  async function apply(){await refresh();}
  async function exportXml(){
   if(exporting)return;exporting=true;footer();
   try{await refresh();if(!state.snapshot||state.stale)return;if(!await o.save())return;const snapshot=structuredClone(state.snapshot),artifact=await o.publish(snapshot);state.draft.revision=artifact.revision;state.draft.fileIndex=artifact.fileIndex;state.artifact=artifact;const a=document.createElement('a');a.href=artifact.downloadUrl;a.download=snapshot.name;document.body.append(a);a.click();a.remove();}
   catch(error){o.notify(error.message,'error');}finally{exporting=false;footer();}
  }
  function edit(target){
   if(state.draft?.mode!=='filter')return false;
   const key=target.dataset.filter,prop=target.dataset.filterCondition;if(!key&&!prop)return false;
   o.remember();
   if(key){data()[key]=target.value;if(key==='group')data().conditions=[];}
   else data().conditions[Number(target.dataset.index)][prop]=target.value;
   o.changed();
   if(prop){const condition=data().conditions[Number(target.dataset.index)],summary=$('inputPanel').querySelector(`[data-condition-id="${conditionId(condition)}"] .filter-condition-summary`);if(summary)summary.textContent=conditionSummary(condition);}
   const selected=activePreset(),save=$('inputPanel').querySelector('[data-filter-action="save-preset"]');if(save)save.disabled=!!selected&&JSON.stringify(selected.filter)===JSON.stringify(data());
   if(target.tagName==='SELECT')o.render();
   else{if(timer)clearTimeout(timer);timer=setTimeout(refresh,150);}
   return true;
  }
  document.addEventListener('click',event=>{
   const button=event.target.closest('[data-filter-action]');if(!button||state.draft?.mode!=='filter')return;
   event.preventDefault();event.stopImmediatePropagation();const action=button.dataset.filterAction;
   if(action==='toggle-condition'){toggleCondition(Number(button.dataset.index));return;}
   if(action==='filename'){toggleName();return;}
   if(action==='export'){exportXml();return;}
   if(action==='save-preset'){savePreset();return;}if(action==='new-preset'){presetNameDialog(false);return;}
   if(action==='rename-preset'){presetNameDialog(true);return;}
   if(action==='delete-preset'){deletePreset();return;}
   if(action==='previous'){previous=!previous;output();return;}
   if(action==='fold'){
    const fold=previous?folds.previous:folds.current,line=Number(button.dataset.line),scroll=$('outputCode'),top=scroll.scrollTop;
    if(fold.closed.has(line))fold.closed.delete(line);else fold.closed.add(line);
    output();$('outputCode').scrollTop=top;$('outputCode').querySelector(`[data-line="${line}"]`)?.focus({preventScroll:true});return;
   }
   o.remember();if(action==='add')data().conditions.push({path:'',operator:'equals',value:'',connector:'and'});else data().conditions.splice(Number(button.dataset.index),1);o.changed();o.render();
  },true);
  return{ensure,head,render,footer,apply,edit,context,evaluateName,previewFormulaAsync,toggleName,nameEditorOpen:()=>nameEditor};
 }
 return{create};
})();
