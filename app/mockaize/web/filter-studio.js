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

 function values(doc,formula){const base=parts(formula.group),path=parts(formula.path);if(!prefix(base,path)||path.length<=base.length)throw Error('Selecione um campo dentro do grupo a somar.');return occurrences(doc,formula.group).flatMap(node=>select(node,path.slice(base.length))).map(node=>node.nodeType===2?node.value:node.textContent);}
 return{groups,fields,run,occurrences,operators,values,connector,expression};
})();
globalThis.FilterStudio=(()=>{
 'use strict';
 function create(o){
  const {state,X,h}=o,$=id=>document.getElementById(id),F=XmlFilter;
  let timer=null,cachedXml=null,cachedDoc=null,owner=null,previous=false,previewError='',exporting=false;
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
   if(owner!==state.draft.id+'\n'+o.inputText()){owner=state.draft.id+'\n'+o.inputText();previous=false;nameEditor=false;nameCache.clear();}
   const f=data(),doc=source();
   if(doc&&!f.group){const groups=F.groups(doc,headers());f.group=groups.find(g=>g.key===state.draft.inputGroup)?.key||groups.find(g=>g.count>1)?.key||groups[0]?.key||'';}
  }
  function select(id,label,options,value,attrs=''){return `<div class="filter-control"><label for="${id}">${label}</label><select id="${id}" ${attrs}>${options.map(([key,text])=>`<option value="${h(key)}" ${key===value?'selected':''}>${h(text)}</option>`).join('')}</select></div>`;}
  function head(){
   ensure();
   $('pageHead').innerHTML=`<div class="heading-row"><div><h1>${h(state.draft.name)}</h1><p class="subline">Filtre grupos por campos e valores · prévia em tempo real</p></div></div><div class="filter-head"><div class="operation-field"><label>Operação</label><div class="segmented"><button data-mode="return">Retorno</button><button data-mode="new">Novos registros</button><button data-mode="manual">Manual</button><button data-mode="filter" class="active">Filtro</button></div></div><div class="filter-name-summary"><span class="hint">Nome do XML filtrado</span><code id="filterNameSummary">${h(state.snapshot?.name||data().fileName||'filtrado.xml')}</code></div></div>`;
   $('editorToolbar').innerHTML='';
  }
  function presetHeader(){
   const selected=activePreset(),modified=selected&&JSON.stringify(selected.filter)!==JSON.stringify(data());
   const saveLabel=selected?'Salvar preset':'Salvar como preset';
   const svg=path=>`<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
   return `<div class="filter-preset-block filter-preset-header"><label class="sr-only" for="filterPresetTrigger">Preset do filtro${modified?' · alterações locais':''}</label><div id="filterPresetCombobox" class="return-combobox"></div><div class="filter-preset-actions"><button class="ghost small" data-filter-action="save-preset" aria-label="${saveLabel}" title="${saveLabel}" ${selected&&!modified?'disabled':''}>${svg('<path d="M4 3h14l3 3v15H3V3zm3 0v6h10V3M7 21v-8h10v8"/>')}</button><button class="ghost small" data-filter-action="rename-preset" aria-label="Renomear preset" title="Renomear preset" ${selected?'':'disabled'}>${svg('<path d="m16 3 5 5M4 20l4-1L21 6l-3-3L5 16z"/>')}</button><button class="ghost small danger" data-filter-action="delete-preset" aria-label="Excluir preset" title="Excluir preset" ${selected?'':'disabled'}>${svg('<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>')}</button></div></div>`;
  }
  function builder(){
   const f=data(),doc=source(),groups=doc?F.groups(doc,headers()):[],fields=doc&&f.group?F.fields(doc,f.group):[];
   return `<div class="filter-builder">${select('filterGroup','Grupo a filtrar',[['','Selecione um grupo'],...groups.map(g=>[g.key,g.display+' · '+g.count+' ocorrência(s)'])],f.group,'data-filter="group"')}${select('filterAction','Ação',[['keep','Manter grupos correspondentes'],['remove','Excluir grupos correspondentes']],f.action,'data-filter="action"')}<div class="filter-conditions">${f.conditions.map((c,i)=>`${i?`<div class="filter-connector">${select('filterConnector'+i,'Combinar com a condição '+(i+1),[['and','E'],['or','OU']],F.connector(f,i),`data-filter-condition="connector" data-index="${i}"`)}</div>`:''}<fieldset class="filter-condition"><legend>Condição ${i+1}</legend>${select('filterField'+i,'Campo ou grupo',[['','Selecione um campo'],...fields.map(n=>[n.key,n.display])],c.path,`data-filter-condition="path" data-index="${i}"`)}${select('filterOperator'+i,'Condição',Object.entries(F.operators),c.operator,`data-filter-condition="operator" data-index="${i}"`)}<div class="filter-control"><label for="filterValue${i}">Valor</label><input id="filterValue${i}" data-filter-condition="value" data-index="${i}" maxlength="2000" value="${h(c.value)}" ${['exists','missing','empty','notEmpty'].includes(c.operator)?'disabled placeholder="Não se aplica"':''}></div><button class="ghost small" data-filter-action="remove" data-index="${i}" aria-label="Remover condição ${i+1}">Remover condição</button></fieldset>`).join('')||'<p class="hint">Sem condições, o documento completo é mantido.</p>'}</div>${f.conditions.length>1?`<div class="filter-expression"><strong>Combinação das condições</strong><code>${h(F.expression(f))}</code><p class="hint">E é avaliado antes de OU, conforme os parênteses acima.</p></div>`:''}<button class="small soft" data-filter-action="add" ${!fields.length||f.conditions.length>=100?'disabled':''}>＋ Adicionar condição</button><p class="hint">Cada ocorrência do grupo é avaliada separadamente. A prévia atualiza enquanto você edita. Os valores diferenciam maiúsculas de minúsculas.</p><p id="filterError" class="callout error" role="status" ${previewError?'':'hidden'}>${h(previewError)}</p></div>`;
  }
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
   if(!rename&&presets().length>=50)return o.notify('Cada arquivo aceita até 50 presets.');
   o.openModal(rename?'Renomear preset':'Salvar preset de filtro','O preset guarda o grupo, as condições, a ação e o nome do XML.',`<div class="form-field"><label for="filterPresetName">Nome do preset</label><input id="filterPresetName" maxlength="120" value="${h(selected?.name||'')}" placeholder="Ex.: Correspondentes de Recife"></div>`,[
    {text:'Cancelar',run:o.closeModal},{text:rename?'Renomear':'Salvar preset',primary:true,run:async()=>{
     const name=validPresetName($('filterPresetName').value,selected?.id);if(!rename)checkPreset();
     const ok=await persistPreset(()=>{if(rename)selected.name=name;else{const preset={id:crypto.randomUUID(),name,filter:structuredClone(data())};presets().push(preset);state.draft.activeFilterPresetId=preset.id;}});
     if(ok){o.closeModal();o.notify(rename?'Preset renomeado.':'Preset salvo.');}
    }}]);
  }
  async function savePreset(){
   const selected=activePreset();if(!selected)return presetNameDialog();
   try{checkPreset();if(await persistPreset(()=>{selected.filter=structuredClone(data());}))o.notify('Preset atualizado.');}catch(error){o.notify(error.message);}
  }
  function deletePreset(){
   const selected=activePreset();if(!selected)return;
   o.openModal('Excluir preset?',selected.name,'<p>O preset será excluído. Os filtros atuais continuam disponíveis para edição.</p>',[
    {text:'Cancelar',run:o.closeModal},{text:'Excluir preset',danger:true,run:async()=>{if(await persistPreset(()=>{state.draft.filterPresets=presets().filter(p=>p.id!==selected.id);state.draft.activeFilterPresetId='';})){o.closeModal();o.notify('Preset excluído.');}}}]);
  }
  function context(snapshot=state.snapshot){
   const input=source(),output=snapshot?.xml?X.parse(snapshot.xml):input;
   const read=(doc,path)=>{const node=doc&&X.resolve(doc,path);if(!node)throw Error('Campo não encontrado: '+X.display(path));return node.nodeType===2?node.value:node.textContent;};
   return{...o.nameContext(),count:snapshot?.count??0,recordIndex:0,profiles:new Map(),sourceValue:path=>read(input,path),outputValue:path=>read(output,path),groupValues:f=>F.values(f.source==='input'?input:output,f)};
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
   previewError='';const doc=source(),f=data();state.snapshot=null;
   if(!doc){state.snapshot=null;state.stale=false;return;}
   try{
    if(f.conditions.length)state.snapshot=F.run(o.inputText(),f,headers());
    else{const count=f.group?F.occurrences(doc,f.group).length:0;state.snapshot={xml:X.serialize(doc),count,originalCount:count,removed:0,removedPaths:[],matched:0,group:f.group,name:'filtrado.xml'};}
    state.snapshot.name=evaluateName(f.filename,state.snapshot);
    state.stale=false;
   }catch(error){previewError=error.message;if(state.snapshot)state.snapshot.name='';state.stale=true;}
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
   $('outputPanel').innerHTML=`<div class="pane-head"><div class="pane-title-row"><span class="pane-title">${previous?'Versão anterior · XML original':'XML filtrado'}</span><div class="pane-actions"><button class="small ${previous?'soft':''}" data-filter-action="previous" aria-pressed="${previous}" ${doc?'':'disabled'}>${previous?'Voltar ao filtrado':'Versão anterior'}</button></div></div><div class="pane-subtitle"><span class="inline-badge" role="status">${previous?'Documento original · linhas excluídas destacadas em vermelho':previewError?(snap?'Revise a fórmula do nome · XML filtrado':'Complete as condições · exibindo XML original'):snap?snap.count+' mantido(s) · '+snap.removed+' excluído(s) · XML completo':'Carregue um XML para começar'}</span></div></div><div class="code-scroll" id="outputCode">${xml?markup(xml):'<div class="empty"><p>Cole ou importe um XML no painel de filtros.</p></div>'}</div>`;
   $('outputCode').scrollTop=position.top;$('outputCode').scrollLeft=position.left;
   const error=$('filterError');if(error){error.textContent=previewError;error.hidden=!previewError;}
  }
  function render(){
   ensure();compute();
   $('inputPanel').innerHTML=`<div class="pane-head"><div class="pane-title-row"><span class="pane-title">${nameEditor?'Nome do arquivo':'Filtros'}</span><div class="pane-actions"><button class="small ${nameEditor?'soft':''}" data-filter-action="filename" aria-expanded="${nameEditor}">ƒ Nome do arquivo</button>${nameEditor?'':'<button data-action="edit-input">Colar / editar XML</button><button data-action="upload-input">Importar</button>'}</div></div><div class="pane-subtitle"><span class="inline-badge">${nameEditor?'Configure a fórmula · clique novamente para voltar aos filtros':'Atualização em tempo real'}</span>${nameEditor?'':presetHeader()}</div></div><div class="code-scroll filter-form" id="inputCode">${nameEditor?'<div id="filterNameEditor" class="filter-name-editor"></div>':builder()}</div>`;
   $('inputPanel').classList.remove('mobile-hidden');$('outputPanel').classList.remove('mobile-hidden');if(!nameEditor)mountPresets();output();
  }
  function footer(){const snap=state.snapshot,ready=snap&&!state.stale;$('bottomBar').innerHTML=`<div class="bottom-summary" role="status">${h(previewError||(snap?snap.count+' de '+snap.originalCount+' grupo(s) mantido(s)':'Configure as condições no painel esquerdo.'))}</div><div class="export-actions"><span class="filename-summary">${h(snap?.name||'filtrado.xml')}</span><button data-filter-action="export" data-action="export-xml" ${ready&&!exporting?'':'disabled'}>↓ Exportar XML filtrado</button></div>`;}
  function refresh(){if(state.draft?.mode!=='filter')return;compute();output();footer();}
  async function apply(){refresh();}
  async function exportXml(){
   if(exporting)return;refresh();if(!state.snapshot||state.stale)return;
   exporting=true;footer();
   try{if(!await o.save())return;const snapshot=structuredClone(state.snapshot),artifact=await o.publish(snapshot);state.draft.revision=artifact.revision;state.draft.fileIndex=artifact.fileIndex;state.artifact=artifact;const a=document.createElement('a');a.href=artifact.downloadUrl;a.download=snapshot.name;document.body.append(a);a.click();a.remove();}
   catch(error){o.notify(error.message);}finally{exporting=false;footer();}
  }
  function edit(target){
   if(state.draft?.mode!=='filter')return false;
   const key=target.dataset.filter,prop=target.dataset.filterCondition;if(!key&&!prop)return false;
   o.remember();
   if(key){data()[key]=target.value;if(key==='group')data().conditions=[];}
   else data().conditions[Number(target.dataset.index)][prop]=target.value;
   o.changed();
   const selected=activePreset(),save=$('inputPanel').querySelector('[data-filter-action="save-preset"]');if(save)save.disabled=!!selected&&JSON.stringify(selected.filter)===JSON.stringify(data());
   if(target.tagName==='SELECT')o.render();
   else{if(timer)clearTimeout(timer);timer=setTimeout(refresh,150);}
   return true;
  }
  document.addEventListener('click',event=>{
   const button=event.target.closest('[data-filter-action]');if(!button||state.draft?.mode!=='filter')return;
   event.preventDefault();event.stopImmediatePropagation();const action=button.dataset.filterAction;
   if(action==='filename'){toggleName();return;}
   if(action==='export'){exportXml();return;}
   if(action==='save-preset'){savePreset();return;}
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
  return{ensure,head,render,footer,apply,edit,context,evaluateName,toggleName,nameEditorOpen:()=>nameEditor};
 }
 return{create};
})();
