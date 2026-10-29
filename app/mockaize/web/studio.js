(async () => {
 'use strict';
 const R=ReturnModels; const dateReference=new Date().toISOString(); const E=MockEngine,X=MockXml,$=id=>document.getElementById(id),h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const boot=await StudioApi.bootstrap().catch(error=>{document.querySelector('.workspace').innerHTML='<div class="empty"><h2>Não foi possível abrir o estúdio</h2>'+AppAlerts.markup(error.message,{type:'error'})+'<a href="/?view=library">Voltar à biblioteca</a></div>';});
 if(!boot)return;
 const {book,settings}=boot;
 const fakerCatalog=await StudioApi.fakerCatalog().catch(()=>null);
 const requestedId=new URLSearchParams(location.search).get('id')||settings.lastSelection?.variationId;
 const selectedWorkspace=book.workspaces.find(w=>w.configs.some(c=>c.id===requestedId));
 if(!selectedWorkspace){location.replace('/');return;}
 book.activeWorkspace=selectedWorkspace.id;
 document.documentElement.dataset.theme=settings.theme==='light'?'light':'dark';
 const LABELS={list:'Lista de valores',hash:'Hash / código aleatório',person:'Pessoa fictícia',company:'Empresa fictícia',address:'Endereço fictício',faker:'Dados fictícios Faker',template:'Manter valor do modelo',copy:'Copiar da entrada',literal:'Valor informado',cpf:'CPF',cnpj:'CNPJ',date:'Data e hora',zeros:'Zeros',sequence:'Sequencial',alpha:'Alfanumérico',random:'Número aleatório',id:'ID / UUID',compose:'Compor fórmulas',config:'Nome da configuração',count:'Quantidade de registros',groupSum:'Somar campo de grupo repetido',field:'Valor de campo · entrada ou saída'};
 const icons={file:'<path d="M5 2h9l4 4v14H5zM13 2v5h5"/>',link:'<path d="m8 12 4-4m-6 7-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0m2 2 2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-5 0"/>',save:'<path d="M4 3h14l3 3v15H3V3zm3 0v6h10V3M7 21v-8h10v8"/>',download:'<path d="M12 2v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',note:'<path d="M3 3h18v14H9l-6 4z"/>',undo:'<path d="M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7"/>',folder:'<path d="M2 5h8l3 3h9v13H2z"/>'};
 const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.file}</svg>`;
 function loadXmlButton(action='edit-input',small=false){return `<button type="button" class="xml-load-button ${small?'small':''}" data-action="${action}">${icon('download')}Carregar XML</button>`;}
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());


 let navigation=null,presentationQueued=false,formulaSampleToken=0,formulaSampleTimer=null;const filenamePreviews=new Map();
 const state={book,draft:null,workspaceId:book.activeWorkspace,configId:null,sessionXml:null,snapshot:null,dirty:false,stale:false,selectedKey:null,sourceKey:null,inspectorMode:'field',inspectorTab:'value',inspectorOpen:false,mobileTab:'input',inputRecord:0,outputRecord:0,formulaDraft:null,undo:[],drag:null,loading:false,operationToken:0,returnResults:{},generationUpdates:new Set(),syncPending:null,syncFingerprint:null,recovering:false};
 const recoverButton=document.createElement('button');recoverButton.id='recoverSync';recoverButton.className='ghost small';recoverButton.type='button';recoverButton.textContent='Recuperar';recoverButton.hidden=true;$('saveConfig').before(recoverButton);
 const layout=StudioLayout.create({preferences:settings.studioLayout,save:StudioApi.layout,redraw:()=>drawConnections(),notify:toast,
  closeInspector:()=>{state.inspectorOpen=false;layout.present(false);drawConnections();}});

 const libraryUI=LibraryUI.create({nodes:boot.library.nodes,selected:requestedId,notify:toast,
  onOpen:id=>safeSwitch(async()=>{const next=state.book.workspaces.find(w=>w.configs.some(c=>c.id===id));if(next){state.workspaceId=next.id;await loadConfig(id);}}),
  beforeChange:async()=>{if(state.loading||state.saving)throw Error('Aguarde ou cancele a operação em andamento.');if(state.syncPending)throw Error('Recupere a sincronização pendente antes de alterar a biblioteca.');return state.dirty||state.formulaDirty?await saveConfig({silent:true}):true;},
  onChange:async()=>{const next=await StudioApi.bootstrap();state.book.workspaces=next.book.workspaces;const ws=state.book.workspaces.find(w=>w.configs.some(c=>c.id===state.configId));if(!ws){location.href='/?view=library';return;}state.workspaceId=ws.id;await loadConfig(state.configId);}});
 const manual=ManualStudio.create({presentation:refreshPresentation,state,X,E,h,inputText,resolveFaker,validateFaker:formula=>E.validateFaker(formula,fakerCatalog),nameContext:()=>({referenceDateTime:dateReference,timeZone:settings.timeZone||'America/Fortaleza',baseDate:state.draft.baseDate,fileIndex:state.draft.fileIndex||0,configName:state.draft.name}),appliedBaseline:()=>{state.editorBaseline=editorFingerprint();},applyName:applyRule,loadXml:editXml,loadXmlButton,renderXml:(doc,keyFor)=>codeMarkup(doc,'manual',keyFor),notify:toast,changed,edited:manualEdited,remember,render,save:()=>saveConfig({silent:true}),publish:publishSnapshot,openModal,closeModal});
 const filter=FilterStudio.create({presentation:refreshPresentation,state,X,h,inputText,resolveFaker,loadXmlButton,remember,changed,render,openModal,closeModal,notify:toast,applyName:applyRule,nameContext:()=>({referenceDateTime:dateReference,timeZone:settings.timeZone||'America/Fortaleza',baseDate:state.draft.baseDate,fileIndex:state.draft.fileIndex||0,configName:state.draft.name}),save:()=>saveConfig({silent:true}),publish:publishSnapshot});
 function workspace(){return state.book.workspaces.find(w=>w.id===state.workspaceId)||state.book.workspaces[0];}
 function rules(){return state.draft?.rulesByMode[state.draft.mode]||{};}
 function bindingSource(rule){return rule?.sourcePath||(rule?.generator?.type==='copy'?rule.generator.path:null);}
 function inputText(){return state.sessionXml??state.draft?.sourceTemplate??'';}
 function engineConfig(){return{...state.draft,referenceDateTime:dateReference,timeZone:settings.timeZone||'America/Fortaleza',rules:rules(),presence:presencePolicies(),filename:state.draft.filenameByMode[state.draft.mode]};}
 async function resolveFaker(config,input,signal){
  const items=X.fakerRequests(config,input);
  if(!items.length)return config;
  const values={},seed=config.fakerSeed||crypto.randomUUID();
  for(let start=0;start<items.length;start+=2500){
   if(signal?.aborted)throw new DOMException('Geração cancelada','AbortError');
   if(state.loading)$('processingText').textContent=`Gerando dados fictícios… ${start} de ${items.length}`;
   const result=await StudioApi.fakerBatch(items.slice(start,start+2500),{signal,seed});
   Object.assign(values,result.values);
  }
  if(signal?.aborted)throw new DOMException('Geração cancelada','AbortError');
  return {...config,fakerValues:values};
 }

 const documentCache={};
 function cachedDocument(side,xml,maxBytes=2000000){
  const cached=documentCache[side];
  if(cached&&cached.xml===xml)return cached.doc;
  let doc=null;try{doc=X.parse(xml,{maxBytes});}catch{}
  documentCache[side]={xml,doc};return doc;
 }
 function docs(){return{
  source:cachedDocument('source',inputText()),
  target:cachedDocument('target',state.draft?.mode==='new'?inputText():state.draft?.outputTemplate),
  generated:cachedDocument('generated',state.snapshot?.xml,100000000)
 };}

 function outputGroup(){return state.draft?.mode==='new'?state.draft.inputGroup:state.draft?.outputGroup;}
 function allFields(side,full=false){if(state.draft?.mode==='manual'){const doc=manual.document();return doc?X.fields(doc):[];}if(state.draft?.mode==='filter'){const xml=side==='input'?inputText():state.snapshot?.xml||inputText();const doc=cachedDocument('filter-fields-'+side,xml);return doc?X.fields(doc):[];}const d=docs();const doc=side==='input'?d.source:(full&&d.generated?d.generated:d.target);if(!doc)return[];if(full){const fields=X.fields(doc);return side==='output'&&d.generated?fields.map(f=>{const key=X.templatePath(f.key,state.snapshot);return{...f,key,display:X.display(key)};}).filter(f=>f.key):fields;}return X.fields(X.project(doc,side==='input'?state.draft.inputGroup:outputGroup(),0));}
 function selectedField(){if(state.draft?.mode==='manual')return manual.fieldByKey(state.selectedKey);return allNodes('output').find(f=>f.key===state.selectedKey)||null;}
 function toast(message,type='info'){UiMotion.toast($('toast'),message,{type});}

 async function saveConfig({silent=false,duringGeneration=false}={}) {
  if(state.loading&&!duringGeneration)return false;
  if(!state.draft||state.saving)return false;
  if(state.syncPending){toast('Recupere a sincronização pendente antes de salvar novamente.','warning');return false;}
  refreshDirty();if(state.formulaDirty&&!applyRule())return false;
  if(state.draft.mode!=='manual'){state.draft.sourceTemplate=inputText();state.sessionXml=null;
  state.draft.inputByMode??={};state.draft.inputByMode[state.draft.mode]={xml:state.draft.sourceTemplate,group:state.draft.inputGroup};}
  const savedDraft=E.clone(state.draft);
  state.saving=true;$('saveConfig').disabled=true;$('savedState').textContent='Salvando…';
  try {
   const saved=await StudioApi.save(savedDraft);
   state.syncPending=null;state.syncFingerprint=null;
   Object.assign(state.draft,{revision:saved.revision});
   const meta=workspace().configs.find(c=>c.id===state.configId);if(meta)meta.name=saved.name;
   state.savedFingerprint=contentFingerprint(savedDraft);refreshDirty();renderNav();renderSaved();
   if(!silent)toast('Configuração salva em Documentos\\MockAíZé.','success');
   return true;
  }catch(error){
   if(error.synchronization?.pending){
    rememberSyncPending(error,savedDraft);toast(error.message+' Use “Recuperar” antes de tentar salvar novamente.','error');
   }else{toast(error.message,'error');renderSaved();}
   return false;
  }
  finally{state.saving=false;$('saveConfig').disabled=!state.draft||!!state.syncPending;}
 }
 async function publishSnapshot(snapshot){
  try{return await StudioApi.publish(state.draft,snapshot);}
  catch(error){rememberSyncPending(error);throw error;}
 }
 function rememberSyncPending(error,draft=state.draft){
  if(!error.synchronization?.pending)return false;
  state.syncPending=error.synchronization;state.syncFingerprint=contentFingerprint(draft);
  if(error.synchronization.committed===true&&Number.isInteger(error.synchronization.revision)){
   state.draft.revision=error.synchronization.revision;
   const meta=workspace().configs.find(c=>c.id===state.configId);if(meta)meta.revision=state.draft.revision;
  }
  renderSaved();return true;
 }
 function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,stable(value[k])]));return value;}
 function comparableRules(rules){return Object.fromEntries(Object.entries(rules||{}).map(([path,rule])=>[path,Object.fromEntries(Object.entries(rule).filter(([key,value])=>value!=null&&(!['sourcePath','comment','formulaComment','lineComment'].includes(key)||value!=='')))]).filter(([,rule])=>Object.keys(rule).length));}
 function contentFingerprint(draft=state.draft){
  if(!draft)return '';
  const config=E.clone(StudioApi.configForSave(draft)),fallback=state.inputFallback||{xml:draft.sourceTemplate,group:draft.inputGroup};
  config.inputByMode={...config.inputByMode,new:E.clone(config.inputByMode.new||fallback),return:E.clone(config.inputByMode.return||fallback)};
  if(draft.mode!=='manual')config.inputByMode[draft.mode]={xml:draft===state.draft?inputText():draft.sourceTemplate,group:draft.inputGroup};
  for(const mode of ['new','return']){
   config.rulesByMode[mode]=comparableRules(config.rulesByMode[mode]);
   config.outputNotesByMode[mode]=Object.fromEntries(Object.entries(config.outputNotesByMode[mode]||{}).filter(([,value])=>value!==''));
  }
  config.inputNotes=Object.fromEntries(Object.entries(config.inputNotes||{}).filter(([,value])=>value!==''));
  for(const model of config.returnModels||[]){model.rules=comparableRules(model.rules);model.outputNotes=Object.fromEntries(Object.entries(model.outputNotes||{}).filter(([,value])=>value!==''));}
  if(config.returnModels?.length){
   delete config.activeReturnId;delete config.outputXml;delete config.outputGroup;
   for(const key of ['rulesByMode','presenceByMode','filenameByMode','outputNotesByMode','headersByMode'])delete config[key].return;
  }
  delete config.mode;delete config.inputXml;delete config.inputGroup;
  return JSON.stringify(stable({name:draft.name,config}));
 }
 function editorFingerprint(){return JSON.stringify(stable(state.inspectorMode==='filename'?{formula:state.formulaDraft}:{formula:state.formulaDraft,fixed:!!state.fixedDraft,value:state.fixedDraft?state.fixedDraftValue:null,length:String(state.exactLengthDraft??''),lengthTarget:state.lengthTargetDraft||'validate',presence:state.presenceDraft,notes:state.notesDraft}));}
 function refreshDirty(){
  state.formulaDirty=!!state.formulaDraft&&state.editorBaseline!=null&&editorFingerprint()!==state.editorBaseline;
  state.dirty=state.savedFingerprint!=null&&(contentFingerprint()!==state.savedFingerprint||state.formulaDirty);
  StudioApi.report(state.loading||state.dirty);return state.dirty;
 }
 function manualEdited(){
  // Keep input synchronous and cheap. Navigation/save still compare exact content.
  state.dirty=true;StudioApi.report(true);renderSaved();
  clearTimeout(state.manualDirtyTimer);const draft=state.draft;
  state.manualDirtyTimer=setTimeout(()=>{if(state.draft===draft){refreshDirty();renderSaved();}},300);
 }
 function changed(generationAffected=true){refreshDirty();if(generationAffected&&state.draft&&state.dirty&&['new','return'].includes(state.draft.mode))state.generationUpdates.add(state.draft.id+':'+state.draft.mode);if(generationAffected){for(const result of Object.values(state.returnResults))result.stale=true;if(state.snapshot)state.stale=true;}renderSaved();renderFooter();}
 function canUndo(){return !!state.undo.length&&(state.draft?.mode!=='filter'||state.undo.at(-1).draft.mode==='filter');}
 function renderSaved(){refreshPresentation();$('savedState').textContent=state.syncPending?'⚠ Sincronização pendente':state.dirty?'● Alterações pendentes':'✓ Salvo';$('savedState').classList.toggle('dirty',state.dirty||!!state.syncPending);$('recoverSync').hidden=!state.syncPending;$('recoverSync').disabled=state.recovering;$('saveConfig').disabled=!state.draft||!!state.syncPending||state.saving;document.querySelectorAll('[data-action="undo"]').forEach(button=>button.disabled=!canUndo());}
 async function recoverPending(){
  if(!state.syncPending||state.recovering)return false;
  state.recovering=true;renderSaved();
  try{
   const recovered=await StudioApi.recover(state.configId),remoteMatches=!!state.syncFingerprint&&contentFingerprint(recovered)===state.syncFingerprint;
   // A different remote draft may belong to another tab. Preserve our
   // expected revision so recovery cannot silently bypass a save conflict.
   if(remoteMatches){state.draft.revision=recovered.revision;state.draft.fileIndex=recovered.fileIndex;}
   const meta=workspace().configs.find(c=>c.id===state.configId);if(meta){meta.revision=recovered.revision;meta.file_index=recovered.fileIndex;}
   if(remoteMatches)state.savedFingerprint=state.syncFingerprint;
   state.syncPending=null;state.syncFingerprint=null;refreshDirty();renderNav();renderSaved();
   toast(remoteMatches?'Sincronização recuperada; configuração disponível.':'Sincronização recuperada. Seu rascunho continua pendente de salvar.',remoteMatches?'success':'warning');
   return remoteMatches;
  }catch(error){toast(error.message,'error');return false;}
  finally{state.recovering=false;renderSaved();}
 }
 function remember(){state.undo.push({draft:E.clone(state.draft),sessionXml:state.sessionXml});if(state.undo.length>25)state.undo.shift();}
 function undo(){if(!canUndo())return toast('Nenhuma alteração para desfazer.','warning');const previous=state.undo.pop();if(!previous)return toast('Nenhuma alteração para desfazer.','warning');const {revision,fileIndex}=state.draft;state.draft={...previous.draft,revision,fileIndex};state.sessionXml=previous.sessionXml;changed();state.formulaDraft=null;render();toast('Alteração desfeita.','success');}
 function safeSwitch(action){
  if(state.loading||state.saving||state.switching)return toast('Aguarde ou cancele a operação em andamento.','warning');
  if(state.syncPending)return toast('Recupere a sincronização pendente antes de sair desta configuração.','warning');
  refreshDirty();if(!state.dirty){Promise.resolve(action()).catch(error=>toast(error.message,'error'));return;}
  openModal('Salvar alterações antes de sair?','Regras, fórmulas e comentários têm alterações pendentes.',
   '<p class="hint">O XML carregado e as configurações de cada operação serão salvos.</p>',[
    {text:'Cancelar',run:closeModal},
    {text:'Descartar alterações',run:()=>{state.dirty=false;StudioApi.report(false);closeModal();return action();}},
    {text:'Salvar e continuar',primary:true,run:async()=>{if(await saveConfig()){closeModal();await action();}}}]);
 }
 function preferredConfig(){return workspace().configs.find(c=>c.id===workspace().activeConfigId)?.id||workspace().configs[0]?.id;}
 async function loadConfig(id){
  if(!id)return;
  const meta=workspace().configs.find(c=>c.id===id);if(!meta)return;
  state.loadId=id;state.switching=true;$('savedState').textContent='Carregando…';
  document.querySelector('.app').setAttribute('aria-busy','true');
  $('saveConfig').disabled=true;$('studioLoadError').hidden=true;
  try {
   const config=await StudioApi.load(id);
   state.configId=id;state.draft=config;state.savedFingerprint=null;state.editorBaseline=null;
   if(config.inputByMode?.[config.mode]){config.sourceTemplate=config.inputByMode[config.mode].xml;config.inputGroup=config.inputByMode[config.mode].group;}
   for(const modeRules of Object.values(config.rulesByMode))for(const rule of Object.values(modeRules)){const source=bindingSource(rule);if(source)rule.sourcePath=source;}
   state.inputFallback={xml:config.sourceTemplate,group:config.inputGroup};
   state.returnResults={};state.sessionXml=null;state.snapshot=null;state.artifact=null;state.dirty=false;state.stale=false;state.resetScroll=true;
   state.selectedKey=null;state.sourceKey=null;state.formulaDraft=null;state.undo=[];state.inputRecord=0;state.outputRecord=0;
   state.inspectorMode='field';state.inspectorTab='value';state.inspectorOpen=false;
   if(config.mode==='manual'){manual.ensure(inputText());state.inspectorOpen=false;}
   const next=new URL(location.href);next.searchParams.set('id',id);history.replaceState(null,'',next);
   document.title=config.name+' · MockAíZé';StudioApi.report(false);render();state.savedFingerprint=contentFingerprint();refreshDirty();renderSaved();
   document.querySelector('.app').classList.remove('load-failed');
   await StudioApi.select(meta).catch(error=>toast(`Variação aberta. Não foi possível lembrar a seleção: ${error.message}`,'warning'));
  }catch(error){
   renderNav();document.querySelector('.app').classList.add('load-failed');
   $('savedState').textContent='Falha ao carregar';
   AppAlerts.render($('studioLoadErrorMessage'),error.message,{type:'error'});$('studioLoadError').hidden=false;
  }
  finally{state.switching=false;$('saveConfig').disabled=!state.draft;document.querySelector('.app').setAttribute('aria-busy','false');}
 }
 function renderNav(){
  const current=libraryUI.node(state.configId),draft=state.draft;
  const changedLabel=current&&draft&&(current.name!==draft.name||current.mode!==draft.mode);
  if(current&&draft){current.name=draft.name;current.mode=draft.mode;}
  if(libraryUI.state.selected!==state.configId||changedLabel){libraryUI.state.selected=state.configId;libraryUI.render();}
  refreshPresentation();
 }
 function renderHeadContent(){if(state.draft?.mode==='filter')return filter.head();if(state.draft?.mode==='manual')return manual.head();if(!state.draft){$('pageHead').innerHTML=`<h1>${h(workspace().name)}</h1><p class="subline">Crie uma configuração para começar a gerar seus mocks.</p>`;$('editorToolbar').innerHTML='';return;}const c=state.draft,d=docs(),group=c.mode==='new'?c.inputGroup:c.outputGroup;const groups=d.target?X.recordGroups(d.target,headerPaths()):[];const validGroup=groups.some(item=>item.key===group);const automaticCount=c.mode==='return';const displayedCount=automaticCount&&d.source?(X.records(d.source,c.inputGroup).length||1):c.count;$('pageHead').innerHTML=`<div class="mode-row"><div class="operation-field"><label>Operação</label>${AppNavigation.operationControl(c.mode)}</div><div class="group-field"><label for="recordGroup">${c.mode==='new'?'Unidade do registro':'Grupo de saída'}</label><select id="recordGroup">${!validGroup?`<option value="" selected disabled>${groups.length?'Selecione um grupo de tags':d.target?'Nenhum grupo de tags disponível':'Importe ou cole um XML'}</option>`:''}${groups.length?groups.map(g=>`<option value="${h(g.key)}" ${g.key===group?'selected':''}>${h(g.display)} · ${g.count} ocorrência(s)</option>`).join(''):''}</select></div></div>${d.target&&X.resolve(d.target,group)===d.target.documentElement&&Number(displayedCount)>1?'<p class="hint root-notice">A raiz será repetida dentro de &lt;MockRegistros&gt; para manter um único XML válido.</p>':''}`;$('editorToolbar').innerHTML=`<button class="small soft" data-action="automap">${icon('link')}Mapear nomes iguais</button><button class="small" data-action="presence">Campos e grupos</button><span class="toolbar-spacer"></span><button class="ghost small" data-action="base-date" title="Configurar data-base">${h(c.baseDate)}</button><button class="ghost small" data-action="undo" title="Desfazer alteração" ${state.undo.length?'':'disabled'}>${icon('undo')}Desfazer</button><label class="editor-mode-toggle"><input id="editorModalMode" type="checkbox">Fórmulas em modal</label><button class="ghost small" data-action="inspector" aria-label="Mostrar ou ocultar inspetor">☷</button>`;}
 function renderHead(){renderHeadContent();renderReturnSelection();layout.controls();UiMotion.operations($('pageHead'));refreshPresentation();}

 function noteLabel(key){if(key==='@declaration')return'Declaração XML';if(key.startsWith('@open:'))return X.display(key.slice(6))+' · abertura';if(key.startsWith('@close:'))return X.display(key.slice(7))+' · fechamento';return X.display(key);}
 function rowMarkup(content,index,side,key=null,annotationKey=null){const noteKey=key||annotationKey;const groupKey=side==='output'&&annotationKey?.startsWith('@open:')?annotationKey.slice(6):null;const policy=side==='output'?presencePolicies()[key||groupKey]:null;const rule=key&&side==='output'?rules()[key]:null;let kind='';if(rule?.fixed!==null&&rule?.fixed!==undefined)kind='fixed';else if(rule?.generator)kind=rule.generator.type==='copy'?'copy':'formula';const label=kind==='fixed'?'Fixo':kind==='copy'?'Copiado':kind==='formula'?'Fórmula':'';const note=side==='input'?state.draft.inputNotes?.[noteKey]:state.draft.outputNotesByMode?.[state.draft.mode]?.[noteKey]||rule?.lineComment||rule?.comment||rule?.formulaComment;const selected=!!key&&side==='output'&&key===state.selectedKey;const sourceSelected=!!key&&side==='input'&&key===state.sourceKey;return`<div data-row-key="${h(noteKey||'@line:'+index)}" class="xml-row ${selected?'selected':''} ${sourceSelected?'source-selected':''}"${key?` data-key="${h(key)}" data-side="${side}"`:''}><span class="line-number">${index}</span>${key?`<button class="port ${side}-port ${sourceSelected?'armed':''}" data-field="${h(key)}" data-side="${side}" aria-label="${side==='input'?'Selecionar origem':'Selecionar destino'} ${h(X.display(key))}"></button>`:''}<span class="xml-code ${key?'field-content':''}"${key?` role="button" tabindex="0" data-field="${h(key)}" data-side="${side}" aria-label="${h(X.display(key))}"`:''}>${content}</span>${groupKey?`<button class="group-settings" data-group="${h(groupKey)}" aria-label="Configurar grupo ${h(X.display(groupKey))}" title="Presença e comentários do grupo">⚙</button>`:''}${side==='output'&&groupKey&&headerPaths().includes(groupKey)?'<span class="header-badge">Cabeçalho único</span>':''}${policy?`<span class="presence-badge">${policy.requirement==='optional'?'Opcional':'Obrigatório'}</span>`:''}${label?`<span class="field-mark ${kind}">${kind==='fixed'?'♙':kind==='formula'?'ƒ':'↗'} ${label}</span>`:''}${noteKey?`<button class="note-marker" data-note="${h(noteKey)}" data-side="${side}" aria-label="Comentário em ${h(noteLabel(noteKey))}" title="${note?h(note):'Adicionar comentário'}">${icon('note')}</button>`:''}</div>`;}
 function codeMarkup(doc,side,transform=key=>key){const keys=new WeakMap();const keyFor=node=>{if(!keys.has(node))keys.set(node,side==='output'&&state.snapshot?X.templatePath(X.key(node),state.snapshot,state.outputRecord):transform(X.key(node)));return keys.get(node);};const rows=[];let line=1;const add=(text,key=null,annotationKey=null)=>rows.push(rowMarkup(text,line++,side,key,annotationKey));add('<span class="xml-tag">&lt;?xml</span> <span class="xml-attr">version</span>=<span class="xml-string">"1.0"</span><span class="xml-tag">?&gt;</span>');function walk(node,depth){const indent='  '.repeat(depth),tag=h(node.nodeName),attrs=Array.from(node.attributes||[]);const namespaceAttrs=attrs.filter(a=>a.namespaceURI==='http://www.w3.org/2000/xmlns/'||a.name==='xmlns');const mutableAttrs=attrs.filter(a=>!namespaceAttrs.includes(a));const ns=namespaceAttrs.map(a=>` <span class="xml-attr">${h(a.name)}</span>=<span class="xml-string">"${h(a.value)}"</span>`).join('');if(mutableAttrs.length){add(indent+`<span class="xml-tag">&lt;${tag}</span>`+ns,null,keyFor(node)?'@open:'+keyFor(node):null);for(const attr of mutableAttrs)add(indent+'  '+`<span class="xml-attr">${h(attr.name)}</span>=<span class="xml-string">"${h(attr.value)}"</span>`,keyFor(attr));add(indent+'<span class="xml-tag">&gt;</span>');if(!node.children.length){add(indent+'  '+`<span class="xml-value">${h(node.textContent)}</span>`,keyFor(node));add(indent+`<span class="xml-tag">&lt;/${tag}&gt;</span>`,null,keyFor(node)?'@close:'+keyFor(node):null);return;}}else if(!node.children.length){add(indent+`<span class="xml-tag">&lt;${tag}${ns}&gt;</span><span class="xml-value">${h(node.textContent)}</span><span class="xml-tag">&lt;/${tag}&gt;</span>`,keyFor(node));return;}else add(indent+`<span class="xml-tag">&lt;${tag}</span>${ns}<span class="xml-tag">&gt;</span>`,null,keyFor(node)?'@open:'+keyFor(node):null);for(const child of node.childNodes){if(child.nodeType===1)walk(child,depth+1);if(child.nodeType===8)add('  '.repeat(depth+1)+`<span class="xml-comment">&lt;!--${h(child.textContent)}--&gt;</span>`);if((child.nodeType===3||child.nodeType===4)&&child.textContent.trim())add('  '.repeat(depth+1)+`<span class="xml-text">${h(child.textContent.trim())}</span>`);}add(indent+`<span class="xml-tag">&lt;/${tag}&gt;</span>`,null,keyFor(node)?'@close:'+keyFor(node):null);}walk(doc.documentElement,0);return rows.join('');}
 function renderPanelsContent(scope=null){if(state.draft?.mode==='filter')return filter.render();if(state.draft?.mode==='manual')return manual.render();if(!state.draft){$('inputPanel').innerHTML=`<div class="empty"><div class="empty-icon">⟐</div><h2>Seu próximo mock começa aqui</h2><p>Crie uma configuração, adicione um XML e escolha quais dados copiar, fixar ou gerar.</p><button class="primary" data-action="new-config">＋ Nova configuração</button></div>`;$('outputPanel').innerHTML='';return;}const d=docs();const sourceCount=d.source?(X.records(d.source,state.draft.inputGroup).length||1):0;state.inputRecord=Math.max(0,Math.min(state.inputRecord,sourceCount-1));if(scope!=='output')$('inputPanel').innerHTML=`<div class="pane-head"><div class="pane-title-row"><span class="pane-title">XML de entrada</span><div class="pane-actions">${loadXmlButton()}</div></div></div><div class="code-scroll" id="inputCode">${d.source?codeMarkup(X.project(d.source,state.draft.inputGroup,state.inputRecord),'input'):`<div class="empty"><p>Carregue um arquivo ou cole seu XML de entrada.</p>${loadXmlButton()}</div>`}</div>${d.source?RecordPagination.footer(state.inputRecord,sourceCount,'input'):''}`;const outputDoc=d.generated||d.target;const outputCount=outputDoc?(state.snapshot?.count||(X.records(outputDoc,outputGroup()).length||1)):0;state.outputRecord=Math.max(0,Math.min(state.outputRecord,outputCount-1));if(scope!=='input'){const preview=outputDoc?X.project(outputDoc,state.snapshot?.group||outputGroup(),state.outputRecord):null;$('outputPanel').innerHTML=`<div class="pane-head"><div class="pane-title-row"><span class="pane-title">XML de saída</span><div class="pane-actions"><span class="inline-badge ${state.stale?'amber':''}">${state.stale?'Prévia anterior · regenere':state.snapshot?(state.snapshot.wrapperPath?'Prévia gerada · agrupada em MockRegistros':'Prévia gerada'):'Modelo de saída'}</span></div></div></div><div class="code-scroll" id="outputCode">${preview?codeMarkup(preview,'output'):`<div class="empty"><p>${state.draft.mode==='new'?'O XML de entrada fornece a estrutura para os novos registros.':'Adicione o modelo de saída para gerar um retorno.'}</p><button data-action="edit-output">Adicionar modelo</button></div>`}</div>${outputDoc?RecordPagination.footer(state.outputRecord,outputCount):''}`;}$('inputPanel').classList.toggle('mobile-hidden',state.mobileTab!=='input');$('outputPanel').classList.toggle('mobile-hidden',state.mobileTab!=='output');document.querySelectorAll('[data-mobile-tab]').forEach(el=>el.classList.toggle('active',el.dataset.mobileTab===state.mobileTab));}
 function renderPanels(scope=null){
  const positions=state.resetScroll?null:layout.captureScroll();
  renderPanelsContent(scope);if(scope!=='input')renderReturnControls();RecordPagination.bind(scope?$(scope+'Panel'):$('workArea'),(index,scope)=>{if(scope.startsWith('manual'))manual.goToRecord(index);else{if(scope==='input')state.inputRecord=index;else state.outputRecord=index;renderPanels(scope);layout.scheduleDraw();}});if(!['manual','filter'].includes(state.draft?.mode))layout.bindScroll();layout.restoreScroll(positions);state.resetScroll=false;refreshPresentation();
 }

 function fieldPort(side,key){return Array.from(document.querySelectorAll(`.port[data-side="${side}"]`)).find(e=>e.dataset.field===key);}
 function drawConnections(){if(['manual','filter'].includes(state.draft?.mode)){$('connections').innerHTML='';return;}StudioLayout.drawConnections({rules:rules(),sourceFor:bindingSource,selectedKey:state.selectedKey,drag:state.drag});}

 function curve(x1,y1,x2,y2,extra){const bend=Math.max(28,Math.abs(x2-x1)*.45);return`<path class="connection ${extra}" d="M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2}"/>`;}
 function generationControls(){
  const c=state.draft,d=docs(),automatic=c.mode==='return',count=automatic&&d.source?(X.records(d.source,c.inputGroup).length||1):c.count;
  const group=c.mode==='new'?c.inputGroup:c.outputGroup,valid=d.target&&X.recordGroups(d.target,headerPaths()).some(g=>g.key===group);
  return `<div class="generation-controls"><div class="generation-count"><label for="recordCount">Registros</label><input id="recordCount" type="number" min="1" max="10000" value="${h(count)}" ${automatic?'disabled title="Quantidade definida pelo arquivo de entrada"':''}></div><button class="primary" id="generateButton" ${state.loading||state.saving||!valid?'disabled':''} ${!valid?'title="Selecione um grupo de tags para gerar os registros"':''}>Gerar registros</button></div>`;
 }
 function generationSignal(ready){
  const d=docs(),c=state.draft,group=c.mode==='new'?c.inputGroup:c.outputGroup;
  const valid=!!d.source&&!!d.target&&X.recordGroups(d.target,headerPaths()).some(g=>g.key===group);
  const updated=state.generationUpdates.has(c.id+':'+c.mode)||state.stale||Object.values(state.returnResults).some(r=>r.stale);
  const color=ready?'green':valid&&updated?'orange':'red';
  const label=ready?'Arquivo gerado e pronto para exportar':color==='orange'?'Arquivo alterado. Gere novamente para exportar.':'Nenhum arquivo gerado disponível para exportar.';
  return `<span class="generation-signal ${color}" role="status" aria-label="${h(label)}" title="${h(label)}"><span class="sr-only">${h(label)}</span></span>`;
 }
 function renderFooter(){refreshPresentation();if(state.draft?.mode==='filter')return filter.footer();if(state.draft?.mode==='return')return renderReturnsFooter();if(state.draft?.mode==='manual')return manual.footer();if(!state.draft){$('bottomBar').innerHTML='<span class="hint">Modelos, regras e comentários ficam organizados por configuração.</span>';return;}let copied=0,formulas=0,fixed=0;for(const r of Object.values(rules())){if(r.fixed!==null&&r.fixed!==undefined)fixed++;else if(r.generator?.type==='copy')copied++;else if(r.generator)formulas++;}const snap=state.snapshot;$('bottomBar').innerHTML=`<div class="bottom-summary"><span>↗ <b>${copied}</b> copiado(s)</span><span>ƒ <b>${formulas}</b> fórmula(s)</span><span>♙ <b>${fixed}</b> fixo(s)</span><span>${snap?`Exportação inclui <b>${snap.count}</b> registro(s)`:'Gere para revisar e exportar'}</span></div><div class="export-actions generation-actions"><span class="filename-summary" title="${h(snap?.name||'Configure o nome do arquivo')}">${h(snap?.name||'Nome do arquivo configurável')}</span>${generationControls()}${generationSignal(!!snap&&!state.stale)}<button class="${snap&&!state.stale?'soft':''}" data-action="export-xml" ${!snap||state.stale?'disabled':''}>${icon('download')}Exportar XML</button></div>`;}
 function render(){document.querySelector('.app').classList.toggle('generation-mode',['new','return'].includes(state.draft?.mode));document.querySelector('.app').classList.toggle('filter-mode',state.draft?.mode==='filter');document.querySelector('.app').classList.toggle('manual-mode',state.draft?.mode==='manual');renderNav();renderHead();renderSaved();renderPanels();renderInspector();renderFooter();layout.present(state.inspectorOpen&&!!state.draft&&state.draft.mode!=='manual');layout.scheduleDraw();}

 function fieldOptions(side,current){const list=allFields(side,state.inspectorMode==='filename');const options=list.slice(0,5000).map(f=>`<option value="${h(f.key)}" ${f.key===current?'selected':''}>${h(f.display)}${f.ns?' · '+h(f.ns):''}</option>`);if(current&&!list.some(f=>f.key===current))options.unshift(`<option selected value="${h(current)}">Campo ausente: ${h(X.display(current))}</option>`);return`<option value="">Selecione um campo…</option>`+options.join('');}
 function control(label,name,value,type='text',extra=''){return`<div class="form-field"><label>${h(label)}<input aria-label="${h(label)}" data-f="${h(name)}" type="${type}" value="${h(value)}" ${extra}></label></div>`;}
 function selectControl(label,name,options,current){return`<div class="form-field"><label>${h(label)}<select aria-label="${h(label)}" data-f="${h(name)}">${options.map(([value,text])=>`<option value="${h(value)}" ${String(value)===String(current)?'selected':''}>${h(text)}</option>`).join('')}</select></label></div>`;}
 function typeOptions(current,depth=0,categoryId='person'){const legacy={person:'person',company:'company',address:'address'};const types=['template','copy','literal','cpf','cnpj','date','zeros','sequence','alpha','random','id','hash','list','compose','count','field','groupSum'];if(state.inspectorMode==='filename')types.push('config');const options=types.filter(t=>!(state.draft?.mode==='manual'&&t==='template')&&!(depth>2&&t==='compose')&&!((depth>0||state.inspectorMode==='filename')&&t==='template')).map(type=>({value:type,label:LABELS[type]}));for(const category of fakerCatalog?.categories||[])options.splice(options.findIndex(item=>item.value==='compose'),0,{value:'faker:'+category.id,label:category.label});if(current==='faker'&&!fakerCatalog?.categories.some(c=>c.id===categoryId)){const legacy=fakerCatalog?.legacyItems.find(i=>i.category===categoryId);if(legacy)options.push({value:'faker:'+categoryId,label:legacy.categoryLabel+' (preset existente)'});}const selected=current==='faker'?'faker:'+categoryId:legacy[current]?'faker:'+legacy[current]:current;return options.map(item=>`<option value="${item.value}" ${item.value===selected?'selected':''}>${item.label}</option>`).join('');}
 function datePreview(f){try{return `<div class="date-preview"><strong>Prévia no XML</strong><output>${h(f===state.formulaDraft&&state.inspectorMode==='field'?E.ruleValue(state.fixedDraft?state.fixedDraftValue:E.evaluate(f,E.ruleContext(formulaContext(),lengthRule())),lengthRule()):E.evaluate(f,formulaContext()))}</output><code>${h(E.dateMask(f))}</code></div>`;}catch(error){return `<div class="date-preview" role="alert">${h(error.message)}</div>`;}}
 function dateFormatControls(f,prefix){
  const masks=['yyyy-MM-dd','yyyyMMdd','dd/MM/yyyy','ddMMyyyy','HH:mm:ss','HHmmss','yyyyMMddHHmmss','dd/MM/yyyy HH:mm:ss',"yyyy-MM-dd'T'HH:mm:ss"];
  const options=masks.map(mask=>[mask,mask+' · '+E.formatDate(new Date('2026-10-23T18:26:39Z'),mask)]);
  if(f.format&&f.format!=='custom'&&!masks.includes(f.format))options.push([f.format,f.format]);options.push(['custom','Personalizado…']);
  let body=selectControl('Formato',prefix+'format',options,f.format||'yyyy-MM-dd');
  if(f.format==='custom'){
   f.custom={...E.dateCustomDefaults(),...f.custom};const v=f.custom,hasDate=v.day||v.month||v.year,hasTime=v.hour||v.minute||v.second;
   const check=(key,label)=>`<label class="date-check"><input type="checkbox" data-f="${h(prefix+'custom.'+key)}" ${v[key]?'checked':''}>${label}</label>`;
   const select=(label,key,values)=>selectControl(label,prefix+'custom.'+key,values,v[key]);
   body+='<fieldset class="date-custom"><legend>Componentes</legend><div class="date-components">'+[['day','Dia'],['month','Mês'],['year','Ano'],['hour','Hora'],['minute','Minuto'],['second','Segundo']].map(([k,l])=>check(k,l)).join('')+'</div><div class="date-controls">';
   if([v.day,v.month,v.year].filter(Boolean).length>1)body+=select('Ordem da data','order',[['DMY','Dia/Mês/Ano'],['YMD','Ano/Mês/Dia'],['MDY','Mês/Dia/Ano']]);
   if(v.year)body+=select('Ano','yearDigits',[['4','4 dígitos'],['2','2 dígitos']]);
   if([v.day,v.month,v.year].filter(Boolean).length>1)body+=select('Separador da data','dateSeparator',[['','Nenhum'],['/','/'],['-','-'],['.','.']]);
   if([v.hour,v.minute,v.second].filter(Boolean).length>1)body+=select('Separador da hora','timeSeparator',[['','Nenhum'],[':',':'],['.','.']]);
   if(hasDate&&hasTime)body+='<div class="date-full">'+select('Entre data e hora','join',[[' ','Espaço'],['T','T'],['','Nenhum']])+'</div>';
   body+='</div><div class="date-extras">'+(v.second?check('milliseconds','Milissegundos'):'')+(hasTime?check('timezone','Fuso horário'):'')+'</div>';
   if(hasTime&&v.timezone)body+=select('Fuso horário','zone',[['app','Fuso do app · '+(settings.timeZone||'America/Fortaleza')],['utc','UTC · Z']]);
   body+='</fieldset>';
  }
  return body+`<div data-date-preview="${h(prefix)}">${datePreview(f)}</div>`;
 }
 function refreshDatePreviews(){document.querySelectorAll('[data-date-preview]').forEach(el=>{let f=state.formulaDraft;for(const key of el.dataset.datePreview.split('.').filter(Boolean))f=f?.[key];if(f?.type==='date')el.innerHTML=datePreview(f);});}
 function parameters(f,prefix='',depth=0){if(['list','hash','person','company','address','faker'].includes(f.type))return extraParameters(f,prefix);const p=name=>prefix+name;const input=(label,name,value,type='text',extra='')=>control(label,p(name),value,type,extra);const select=(label,name,options,current)=>selectControl(label,p(name),options,current);let body='';
  if(f.type==='template')body='<div class="callout">O campo mantém o valor existente no modelo. Nenhum gerador será aplicado.</div>';
  if(f.type==='literal')body=input('Valor', 'value',f.value??'');
  if(f.type==='copy')body=`<div class="form-field"><label>Campo do XML de entrada</label><select aria-label="Campo do XML de entrada" data-f="${p('path')}">${fieldOptions('input',f.path)}</select></div>`;
  if(f.type==='groupSum'){
   const side=f.source==='input'?'input':'output',d=docs(),doc=state.draft.mode==='manual'?manual.document():side==='input'?d.source:state.draft.mode==='filter'?d.generated:d.target;
   const groups=doc?X.groups(['manual','filter'].includes(state.draft.mode)?doc:X.project(doc,side==='input'?state.draft.inputGroup:outputGroup(),0)).filter(g=>(X.resolve(doc,g.key)?.children?.length||Array.from(X.resolve(doc,g.key)?.attributes||[]).some(a=>a.namespaceURI!=='http://www.w3.org/2000/xmlns/'))):[];
   let fields=[];
   if(f.group){try{const group=JSON.parse(f.group);fields=allFields(side).filter(field=>{const path=JSON.parse(field.key);return path.length>group.length&&group.every((part,i)=>part.ns===path[i]?.ns&&part.name===path[i]?.name&&part.index===path[i]?.index);});}catch{}}
   body=select('Documento','source',[['input','XML de entrada'],['output','XML de saída gerado']],f.source||'output')+select('Grupo que se repete','group',[['','Selecione um grupo…'],...groups.map(g=>[g.key,g.display+' · todas as ocorrências'])],f.group||'')+select('Campo a somar em cada ocorrência','path',[['','Selecione um campo…'],...fields.map(field=>[field.key,field.display])],f.path||'')+`<label class="aggregate-scope"><input type="checkbox" data-f="${p('allRecords')}" ${f.allRecords?'checked':''}>Incluir todos os registros</label><p class="hint">${f.allRecords?(side==='input'?'Soma no XML de entrada completo.':'Soma em todos os registros gerados, mesmo exibindo apenas o primeiro.'):'Soma os grupos do registro atual.'} Os valores calculados são reutilizados, sem novo sorteio.</p>`;
  }
  if(f.type==='field')body=select('Documento','source',[['output','XML de saída gerado'],['input','XML de entrada']],f.source||'output')+`<div class="form-field"><label>Campo e ocorrência</label><select aria-label="Campo e ocorrência" data-f="${p('path')}">${fieldOptions(f.source==='input'?'input':'output',f.path)}</select><p class="hint">Reutiliza o valor calculado, sem sortear novamente. O caminho identifica o grupo e a ocorrência [n].</p></div>`;
  if(f.type==='cpf'||f.type==='cnpj'){if(f.type==='cnpj')body+=`<div class="segmented"><button data-set-f="${p('mode')}" data-value="A" class="${f.mode==='A'?'active':''}">A · Alfanumérico</button><button data-set-f="${p('mode')}" data-value="N" class="${f.mode!=='A'?'active':''}">N · Numérico</button></div>`;if(f.type==='cnpj')body+=input('Estabelecimento (4 caracteres)','establishment',f.establishment??'0001','text','maxlength="4"')+'<p class="hint">Raiz aleatória de 8 caracteres + estabelecimento + 2 DVs. Padrão: 0001 (matriz); altere para uma filial.</p>';body+=`<div class="switch-row"><label>Aplicar máscara</label><input aria-label="Aplicar máscara" type="checkbox" data-f="${p('mask')}" ${f.mask?'checked':''}></div><p class="hint">${f.type==='cpf'?(f.mask?'14 caracteres com máscara (000.000.000-00)':'11 dígitos sem máscara'):(f.mask?'18 caracteres com máscara (00.000.000/0001-00)':'14 caracteres sem máscara')}. DVs calculados pelo módulo 11; dado fictício para testes.</p>`;}
  if(f.type==='date'){body+=select('Regra da data','mode',[['specific','Data específica'],['business','Próximo dia útil'],['offset','Dias adiante']],f.mode||'offset');if(f.mode==='specific')body+=input('Data','value',f.value||state.draft.baseDate,'date');if(f.mode==='offset')body+=`<div class="quick-days">${[5,10,15,30].map(n=>`<button data-set-f="${p('days')}" data-number="${n}" class="${Number(f.days)===n?'soft':''}">+${n}</button>`).join('')}</div>`+input('Quantidade de dias corridos','days',f.days??5,'number','min="-36500" max="36500"');body+=dateFormatControls(f,prefix);if(f.mode==='business')body+=input('Feriados (AAAA-MM-DD, separados por vírgula)','holidays',f.holidays||'')+'<p class="hint">Segunda a sexta. Apenas os feriados informados serão descontados.</p>';body+=`<p class="hint">Data-base desta geração: ${h(state.draft.baseDate)}.</p>`;}
  if(f.type==='zeros')body+=input('Quantidade de zeros','length',f.length??8,'number','min="1" max="1000"');
  if(f.type==='sequence')body+=`<div class="form-grid three">${input('Início','start',f.start??1,'number','min="0"')}${input('Passo','step',f.step??1,'number','min="1"')}${input('Largura','width',f.width??4,'number','min="1" max="30"')}</div>`+select('Escopo do sequencial','scope',[['record','Por registro'],['file','Por arquivo']],f.scope||'record')+'<p class="hint">A prévia não consome o sequencial. Largura mínima com zeros à esquerda.</p>';
  if(f.type==='alpha')body+=input('Quantidade de caracteres','length',f.length??9,'number','min="1" max="512"')+input('Caracteres permitidos','alphabet',f.alphabet||'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  if(f.type==='random')body+=`<div class="form-grid">${input('Mínimo','min',f.min??100,'number','step="any"')}${input('Máximo','max',f.max??5000,'number','step="any"')}</div>`+input('Casas decimais','decimals',f.decimals??2,'number','min="0" max="6"');
  if(f.type==='id'){body+=select('Formato do ID','mode',[['common','ID comum · tamanho configurável'],['uuid','UUID v4 · 36 caracteres']],f.mode||'uuid');if(f.mode==='common')body+=input('Prefixo','prefix',f.prefix||'')+input('Quantidade de caracteres do ID','length',f.length??12,'number','min="1" max="128"')+'<p class="hint">Tamanho total, incluindo o prefixo. O restante usa letras e números aleatórios.</p>';else body+='<div class="callout">36 caracteres, incluindo hífens. UUID v4 no formato 8-4-4-4-12.</div>'; }
  if(f.type==='config')body+='<div class="callout">Usa o nome da configuração, removendo espaços.</div>';
  if(f.type==='count')body+='<div class="callout">Usa a quantidade total de registros gerados. Útil para contadores do cabeçalho.</div>';
  if(f.type==='compose'){body+=select('Operação','operation',[['concat','Concatenar'],['sum','Somar numericamente']],f.operation||'concat');if(f.operation!=='sum')body+=input('Separador entre partes','separator',f.separator||'');body+=(f.parts||[]).map((part,i)=>`<div class="composer-part"><div class="part-heading"><span>PARTE ${i+1}</span><div class="part-actions"><button data-part="up" data-parent="${h(prefix)}" data-index="${i}" ${i===0?'disabled':''} aria-label="Mover parte acima">↑</button><button data-part="down" data-parent="${h(prefix)}" data-index="${i}" ${i===f.parts.length-1?'disabled':''} aria-label="Mover parte abaixo">↓</button><button data-part="remove" data-parent="${h(prefix)}" data-index="${i}" aria-label="Remover parte">×</button></div></div><select aria-label="Gerador da parte ${i+1}" data-f="${p('parts.'+i+'.type')}">${typeOptions(part.type,depth+1,part.category)}</select>${parameters(part,p('parts.'+i+'.'),depth+1)}</div>`).join('')+`<button class="small soft" data-part="add" data-parent="${h(prefix)}">＋ Adicionar parte</button>`;}
  return body;
 }
 function initRuleDraft(){if(state.formulaDraft)return;state.editorBaseline=null;state.formulaDirty=false;if(state.inspectorMode==='filename'){state.formulaDraft=E.upgradeLegacyFormula(E.clone(state.draft.mode==='manual'?state.draft.manual.filename:state.draft.mode==='filter'?state.draft.filter.filename:state.draft.filenameByMode[state.draft.mode]));state.notesDraft={};return;}const field=selectedField(),rule=rules()[state.selectedKey]||{};state.formulaDraft=E.upgradeLegacyFormula(E.clone(rule.generator||{type:'template'}));state.fixedDraft=rule.fixed!==null&&rule.fixed!==undefined;state.fixedDraftValue=state.fixedDraft?String(rule.fixed):field?.value||'';state.presenceDraft=E.clone(presencePolicies()[state.selectedKey]||{requirement:'inherit',include:true});state.exactLengthDraft=rule.exactLength??'';state.lengthTargetDraft=rule.lengthTarget||(rule.exactLength!=null?'validate':'output');state.notesDraft={comment:rule.comment||'',formulaComment:rule.formulaComment||'',lineComment:rule.lineComment||''};state.sampleText='';}
 function formulaTransferControls(){const copied=state.formulaClipboard;return `<div class="formula-transfer" role="group" aria-label="Copiar e colar fórmulas"><button type="button" class="small" data-action="copy-formula" ${!state.fixedDraft&&state.formulaDraft.type==='template'?'disabled':''}>Copiar fórmula</button><button type="button" class="small" data-action="paste-formula" ${copied?'':'disabled'} title="${copied?'Colar fórmula copiada de '+h(copied.name):'Copie uma fórmula de outro campo primeiro'}">Colar fórmula</button></div>${copied?`<p class="hint formula-clipboard-label">Fórmula copiada de ${h(copied.name)}</p>`:''}`;}
 function copyFormula(){
  if(state.inspectorMode!=='field'||!selectedField()||selectedField().isGroup)return;
  initRuleDraft();if(!state.fixedDraft&&state.formulaDraft.type==='template')return toast('Este campo mantém o valor do modelo e não tem fórmula para copiar.');
  state.formulaClipboard={name:selectedField().name,formula:E.clone(state.fixedDraft?{type:'literal',value:state.fixedDraftValue}:state.formulaDraft)};
  renderInspector();toast('Fórmula copiada. Selecione outro campo e clique em Colar fórmula.','success');
 }
 function pasteFormula(){
  if(!state.formulaClipboard)return toast('Copie uma fórmula primeiro.','warning');
  if(state.inspectorMode!=='field'||!selectedField()||selectedField().isGroup)return;
  initRuleDraft();state.formulaDraft=E.clone(state.formulaClipboard.formula);state.fixedDraft=false;state.sampleText='';
  renderInspector();changed(false);toast('Fórmula colada. Revise e clique em Aplicar ou Salvar configuração.','success');
 }
 function lengthRule(){return {exactLength:state.exactLengthDraft===''?null:Number(state.exactLengthDraft),lengthTarget:state.lengthTargetDraft||'validate'};}
 function sampleParts(){const text=state.sampleText||'',at=state.inspectorMode==='filename'?-1:text.lastIndexOf('\n');return {value:text?(at<0?text:text.slice(0,at)):'Clique em Testar fórmula',meta:at<0?'':text.slice(at+1)};}
 function formulaSampleCard(title='Amostra da fórmula'){const sample=sampleParts();return `<section class="date-preview formula-sample-card" aria-label="${h(title)}"><strong>${h(title)}</strong><output id="formulaSample" aria-live="polite">${h(sample.value)}</output><code id="formulaSampleMeta" ${sample.meta?'':'hidden'}>${h(sample.meta)}</code><button type="button" class="primary small" data-action="test-formula">Testar fórmula</button></section>`;}
 function refreshFormulaSample(){const sample=sampleParts();if($('formulaSample'))$('formulaSample').textContent=sample.value;if($('formulaSampleMeta')){$('formulaSampleMeta').textContent=sample.meta;$('formulaSampleMeta').hidden=!sample.meta;}}
 function fieldSettings(){
  const source=bindingSource(rules()[state.selectedKey]),hint=state.lengthTargetDraft==='input'?'Usa os primeiros caracteres dos valores lidos do XML de entrada, antes da fórmula.':state.lengthTargetDraft==='output'?'Usa os primeiros caracteres do valor final. Ex.: gere CNPJ de 14 e limite a saída a 8 para obter o CNPJ base.':'Valida o tamanho final, sem cortar o valor.';
  return (source?`<div class="callout mapping-summary"><strong>Origem vinculada</strong><div>${h(X.display(source))}</div><p class="hint">O vínculo fica salvo ao aplicar uma fórmula ou fixar um valor. A regra escolhida define o valor gerado.</p><button class="small" data-action="disconnect">Desconectar origem</button></div>`:'')+`<div class="section-divider"></div><div class="length-settings"><div class="length-field"><label for="exactLength">Quantidade exata de caracteres</label><input id="exactLength" aria-label="Quantidade exata de caracteres" type="number" min="1" max="4096" placeholder="Sem restrição" value="${h(state.exactLengthDraft)}"></div><div class="length-field"><label for="lengthTarget">Aplicar limite em</label><select id="lengthTarget" aria-label="Aplicar limite em">${[['input','Entrada'],['output','Saída'],['validate','Validar sem cortar']].map(([value,label])=>`<option value="${value}" ${state.lengthTargetDraft===value?'selected':''}>${label}</option>`).join('')}</select></div></div><p class="hint length-hint">Opcional. ${hint} Valores menores que a quantidade exigida geram erro. Prefixos e máscara contam como caracteres.</p>`;
 }
 function filenameEditorBody(){return `<p class="hint">Combine partes para definir o nome do XML exportado. A extensão .xml é adicionada automaticamente.</p><div class="form-field"><label for="filenameGeneratorType">Gerador do nome</label><select id="filenameGeneratorType" aria-label="Tipo de fórmula" data-f="type">${typeOptions(state.formulaDraft.type,0,state.formulaDraft.category)}</select></div>${parameters(state.formulaDraft)}${formulaSampleCard('Prévia do nome')}<p class="hint">${state.draft.mode==='manual'?'Pode usar os valores preenchidos no XML manual. A quantidade considera os registros adicionados.':state.draft.mode==='filter'?'Pode usar campos da entrada ou do XML filtrado. A quantidade considera os grupos mantidos.':'Pode usar campos do XML gerado. Dez registros dentro do XML continuam sendo um arquivo.'}</p>`;}
 function renderLeftFilename(id){
  const host=$(id);if(!host)return;
  initRuleDraft();const top=$('inputCode').scrollTop;
  host.innerHTML=`<div class="inspector-body">${filenameEditorBody()}<div id="ruleError" class="callout error" role="alert" hidden></div></div><div class="inspector-footer"><button class="small" data-action="cancel-rule">Cancelar edição</button><button class="primary" data-action="apply-rule">Aplicar</button></div>`;
  if(state.editorBaseline===null)state.editorBaseline=editorFingerprint();
  for(const [index,input] of [...host.querySelectorAll('input:not([type=checkbox]),textarea')].entries()){const label=input.closest('.form-field')?.querySelector('label');if(label&&!input.labels?.length){input.id||='filter-name-control-'+index;label.htmlFor=input.id;}}
  $('inputCode').scrollTop=top;
 }
 function renderInspectorContent(){const pane=$('inspector');if(!state.draft)return;if(state.inspectorMode==='field'&&!selectedField()){pane.innerHTML='<div class="inspector-head"><div class="inspector-title"><h2>Regras do campo</h2><button class="ghost" data-action="close-inspector" aria-label="Fechar inspetor">×</button></div></div><div class="inspector-body"><p class="hint">Selecione um campo no XML de saída para copiar um valor, aplicar uma fórmula, fixar dados ou deixar comentários.</p></div>';return;}initRuleDraft();const isFile=state.inspectorMode==='filename',field=selectedField();const title=isFile?'Nome do arquivo':field.name;const path=isFile?'Uma regra por arquivo, salva nesta configuração':field.display;let body='';if(isFile){body=filenameEditorBody();}else if(state.inspectorTab==='comments'){body=`<p class="hint">Comentários internos da configuração. Não serão inseridos no XML exportado.</p>${[['comment','Comentário da regra'],['formulaComment','Comentário da fórmula'],['lineComment','Anotação na linha do XML de saída']].map(([id,label])=>`<div class="form-field"><label for="note-${id}">${label}</label><textarea id="note-${id}" data-note-draft="${id}" maxlength="2000">${h(state.notesDraft[id])}</textarea></div>`).join('')}`;}else if(field.isGroup){body=headerControls()+presenceControls()+'<div class="callout">Configuração de grupo. Ao omiti-lo, seus campos e subgrupos saem juntos do XML gerado.</div>';}else{body=`${formulaTransferControls()}${headerFieldNote()}${presenceControls()}<div class="switch-row"><label for="fixedToggle">Fixar valor</label><input id="fixedToggle" type="checkbox" ${state.fixedDraft?'checked':''} aria-label="Fixar valor"></div>${state.fixedDraft?`<div class="form-field"><label for="fixedValue">Valor fixo</label><input id="fixedValue" value="${h(state.fixedDraftValue)}"></div>${state.formulaDraft.type==='date'?`<div data-date-preview="">${datePreview(state.formulaDraft)}</div>`:''}<div class="pill-success">Fixo em todos os registros deste grupo</div><p class="hint">A fórmula ou o mapeamento anterior fica preservado. Desafixar restaura a regra.</p>`:`<div class="form-field"><label>Fonte do valor</label><select aria-label="Tipo de fórmula" data-f="type">${typeOptions(state.formulaDraft.type,0,state.formulaDraft.category)}</select></div><div class="formula-parameters">${parameters(state.formulaDraft)}</div>`}${fieldSettings()}${formulaSampleCard()}<div class="section-divider"></div><div class="form-field"><label>Comentário da regra</label><textarea aria-label="Comentário da regra" data-note-draft="comment" maxlength="2000" placeholder="Por que este campo usa essa regra?">${h(state.notesDraft.comment)}</textarea><p class="hint">Comentário interno · não será exportado</p></div>`;}pane.innerHTML=`<div class="inspector-head"><div class="inspector-title"><h3>${isFile?'ƒ ':''}${h(title)}</h3><button class="ghost" data-action="close-inspector" aria-label="Fechar inspetor">×</button></div><div class="field-path">${h(path)}</div><div class="inspector-tabs ${isFile?'filename-editor-tabs':''}"><button data-inspector="field" class="${!isFile&&state.inspectorTab==='value'?'active':''}">Valor</button><button data-inspector="comments" class="${!isFile&&state.inspectorTab==='comments'?'active':''}" ${field?'':'disabled'}>Comentários</button></div></div><div class="inspector-body">${body}<div id="ruleError" class="callout error" role="alert" hidden></div></div><div class="inspector-footer">${!isFile?'<button class="small" data-action="remove-rule">Remover regra</button>':'<button class="small" data-action="cancel-rule">Cancelar</button>'}<button class="primary" data-action="apply-rule">Aplicar</button></div>`;}
 function renderManualField(){
  const host=$('manualFieldEditor');if(!host)return;
  const top=$('inputCode').scrollTop;
  host.innerHTML=`<div class="inspector-body"><div class="form-field"><label for="manualFormulaType">Fonte do valor</label><select id="manualFormulaType" data-f="type" aria-label="Tipo de fórmula">${typeOptions(state.formulaDraft.type,0,state.formulaDraft.category)}</select></div>${parameters(state.formulaDraft)}${formulaSampleCard()}<div id="ruleError" class="callout error" role="alert" hidden></div></div><div class="inspector-footer"><button class="small" data-action="manual-remove-formula">Remover fórmula</button><button class="primary" data-action="apply-rule">Aplicar</button></div>`;
  host.querySelectorAll('[data-date-preview]').forEach(node=>node.remove());
  if(state.editorBaseline===null)state.editorBaseline=editorFingerprint();
  $('inputCode').scrollTop=top;manual.formulaChanged();
 }
 function renderInspector(){
  if(state.draft?.mode==='manual'){state.inspectorOpen=false;layout.present(false);$('inspector').innerHTML='';if(manual.nameEditorOpen())renderLeftFilename('manualNameEditor');else if(manual.fieldEditorKey())renderManualField();return;}
  if(state.draft?.mode==='filter'){state.inspectorOpen=false;layout.present(false);$('inspector').innerHTML='';if(filter.nameEditorOpen())renderLeftFilename('filterNameEditor');return;}
  if(!state.inspectorOpen||!state.draft||['manual','filter'].includes(state.draft.mode)||state.inspectorMode==='field'&&!selectedField()){state.inspectorOpen=false;layout.present(false);return;}
  const pane=$('inspector'),key=state.inspectorMode+':'+state.inspectorTab+':'+state.selectedKey;
  const same=pane.dataset.editorKey===key,top=pane.querySelector('.inspector-body')?.scrollTop||0;
  renderInspectorContent();
  for(const [index,input] of [...pane.querySelectorAll('input:not([type=checkbox]):not([type=radio]),textarea')].entries()){
   const label=input.closest('.form-field')?.querySelector('label');
   if(label&&!input.labels?.length){input.id||='formula-control-'+index;label.htmlFor=input.id;}
  }
  if(state.formulaDraft&&state.editorBaseline===null)state.editorBaseline=editorFingerprint();pane.dataset.editorKey=key;
  const body=pane.querySelector('.inspector-body');if(same&&body)body.scrollTop=top;
  layout.present(state.inspectorOpen&&!!state.draft&&state.draft.mode!=='manual');
 }

 function formulaContext(){if(state.draft?.mode==='manual')return manual.context();if(state.draft?.mode==='filter')return filter.context();const d=docs();const read=(doc,path)=>{const n=doc&&X.resolve(doc,path);if(!n)throw Error('Campo não encontrado: '+X.display(path));return n.nodeType===2?n.value:n.textContent;};return{referenceDateTime:dateReference,timeZone:settings.timeZone||'America/Fortaleza',baseDate:state.draft.baseDate,recordIndex:0,fileIndex:state.draft.fileIndex||0,count:Number(state.draft.count),configName:state.draft.name,sourceValue:path=>read(d.source,path),profiles:new Map(),outputValue:path=>read(d.generated||d.target,d.generated?X.outputPath(path,state.snapshot):path)};}
 function formulaHasFaker(formula){return E.hasFaker(formula);}
 async function previewFakerFormula(){const formula=state.formulaDraft;if(state.draft.mode==='manual')return manual.previewFormulaAsync(formula);if(state.draft.mode==='filter')return filter.previewFormulaAsync(formula);const isField=state.inspectorMode==='field',config=engineConfig();if(isField)config.rules={...config.rules,[state.selectedKey]:{...config.rules[state.selectedKey],...lengthRule()}};return X.testFormulaAsync(config,inputText(),formula,isField?state.selectedKey:null,resolveFaker);}
 function hasOutputDependency(formula){return formula?.type==='groupSum'||formula?.type==='field'&&formula.source!=='input'||formula?.type==='compose'&&(formula.parts||[]).some(hasOutputDependency);}
 function needsFakerPreview(){if(formulaHasFaker(state.formulaDraft))return true;if(!hasOutputDependency(state.formulaDraft))return false;const formulas=state.draft?.mode==='manual'?Object.values(state.draft.manual.formulas||{}):Object.values(rules()).map(rule=>rule.fixed==null?rule.generator:null);return formulas.some(formulaHasFaker);}
 function testFormula(){
  try{
   if(needsFakerPreview()){E.validateFaker(state.formulaDraft,fakerCatalog);return true;}
   if(state.draft?.mode==='manual'&&state.inspectorMode==='field'){manual.previewFormula();manual.formulaChanged();return true;}
   if(['manual','filter'].includes(state.draft?.mode)){state.sampleText=(state.draft.mode==='manual'?manual:filter).evaluateName(state.formulaDraft);refreshFormulaSample();if($('ruleError'))$('ruleError').hidden=true;return true;}
   const isField=state.inspectorMode==='field';
   if(isField&&(selectedField().isGroup||selectedIsOmitted())){state.sampleText='Elemento omitido ou configuração de grupo.';refreshFormulaSample();if($('ruleError'))$('ruleError').hidden=true;return true;}
   const rule=isField?lengthRule():{},context=E.ruleContext(formulaContext(),rule);let value;
   if(state.fixedDraft&&isField)value=E.ruleValue(state.fixedDraftValue,rule);
   else if(state.formulaDraft.type==='template')value=E.ruleValue(selectedField().value,rule);
   else if(hasOutputDependency(state.formulaDraft)){
    const config=engineConfig();if(isField)config.rules={...config.rules,[state.selectedKey]:{...config.rules[state.selectedKey],...rule}};
    value=X.testFormula(config,inputText(),state.formulaDraft,isField?state.selectedKey:null);
   }else value=E.ruleValue(E.evaluate(state.formulaDraft,context),rule);
   if(isField&&state.presenceDraft.requirement==='required'&&!String(value).trim())throw Error('Campo obrigatório sem valor.');
   const verified=!state.fixedDraft&&(state.formulaDraft.type==='cpf'&&E.validCPF(value)||state.formulaDraft.type==='cnpj'&&E.validCNPJ(value));
   state.sampleText=isField?value+'\n'+Array.from(String(value)).length+' caracteres'+(verified?' · Formato e DVs válidos':''):E.filename(value);
   refreshFormulaSample();if($('ruleError'))$('ruleError').hidden=true;return true;
  }catch(error){showRuleError(error.message);return false;}
 }
 async function testFormulaAction(){if(!needsFakerPreview())return testFormula();const draft=state.draft,token=++formulaSampleToken,formula=E.clone(state.formulaDraft),selectedKey=state.selectedKey,inspectorMode=state.inspectorMode,manualKey=state.draft?.mode==='manual'?manual.fieldEditorKey():null;const current=()=>draft===state.draft&&token===formulaSampleToken&&JSON.stringify(formula)===JSON.stringify(state.formulaDraft)&&selectedKey===state.selectedKey&&inspectorMode===state.inspectorMode&&manualKey===(state.draft?.mode==='manual'?manual.fieldEditorKey():null);try{const value=await previewFakerFormula();if(!current())return false;const isField=state.inspectorMode==='field';state.sampleText=isField?String(value)+'\n'+Array.from(String(value)).length+' caracteres':E.filename(value);refreshFormulaSample();if($('ruleError'))$('ruleError').hidden=true;return true;}catch(error){if(current())showRuleError(error.message);return false;}}
 function showRuleError(message){const el=$('ruleError');if(el){AppAlerts.render(el,message,{type:'error'});}else toast(message,'error');}
 function applyRule(){if(state.draft?.mode==='manual'&&state.inspectorMode==='field'&&manual.fieldEditorKey())return manual.applyField();refreshDirty();if(!state.formulaDirty)return true;const isFile=state.inspectorMode==='filename';if(!isFile&&state.inspectorTab==='comments'){remember();const previous=rules()[state.selectedKey]||{};rules()[state.selectedKey]={...previous,generator:previous.generator||null,fixed:previous.fixed??null,...state.notesDraft};state.editorBaseline=editorFingerprint();changed(false);render();state.formulaDirty=false;toast('Comentários aplicados. Eles não entram no XML exportado.','success');return true;}if(state.inspectorTab!=='comments'||isFile)if(!testFormula())return false;remember();if(isFile){if(state.draft.mode==='manual'){state.draft.manual.filename=E.clone(state.formulaDraft);state.draft.manual.confirmed=false;}else if(state.draft.mode==='filter')state.draft.filter.filename=E.clone(state.formulaDraft);else state.draft.filenameByMode[state.draft.mode]=E.clone(state.formulaDraft);}else{const existing=rules()[state.selectedKey]||{};const source=state.formulaDraft.type==='copy'?state.formulaDraft.path:bindingSource(existing);rules()[state.selectedKey]={...existing,sourcePath:source||null,...lengthRule(),generator:state.formulaDraft.type==='template'?null:E.clone(state.formulaDraft),fixed:state.fixedDraft?state.fixedDraftValue:null,...state.notesDraft};}if(!isFile)savePresenceDraft();state.editorBaseline=editorFingerprint();changed(isFile||state.inspectorTab!=='comments');render();state.formulaDirty=false;toast(isFile?(state.draft.mode==='manual'?'Fórmula do nome aplicada ao XML manual.':state.draft.mode==='filter'?'Fórmula do nome aplicada ao XML filtrado.':'Fórmula do nome aplicada. Regenere para atualizar o arquivo.'):'Regra aplicada. Salve a configuração para reutilizar.','success');return true;}
 function setNested(object,path,value){const parts=path.split('.');let node=object;for(const part of parts.slice(0,-1)){if(['__proto__','constructor','prototype'].includes(part))throw Error('Parâmetro inválido.');node=node[part];}node[parts[parts.length-1]]=value;}
 function getNested(object,path){if(!path)return object;return path.replace(/\.$/,'').split('.').reduce((n,k)=>n[k],object);}
 function changeFormula(path,value,rerender=false){formulaSampleToken++;if(path.endsWith('type')){const at=path.slice(0,-4),categoryId=value.startsWith('faker:')?value.slice(6):'';let next=categoryId?E.defaults('faker'):value==='template'?{type:'template'}:E.defaults(value);if(categoryId){next.category=categoryId;next.catalogId=fakerCatalog?.categories.find(item=>item.id===categoryId)?.items[0]?.id||'';}if(value==='sequence'&&state.inspectorMode==='filename')next.scope='file';if(value==='copy'&&state.inspectorMode==='field'&&!at)next.path=bindingSource(rules()[state.selectedKey])||'';if(!at)state.formulaDraft=next;else setNested(state.formulaDraft,at.slice(0,-1),next);rerender=true;}else{setNested(state.formulaDraft,path,value);if(path.endsWith('.category')){const formula=getNested(state.formulaDraft,path.slice(0,path.lastIndexOf('.')+1));const category=fakerCatalog?.categories.find(item=>item.id===value);formula.catalogId=category?.items[0]?.id||'';formula.params={};rerender=true;}if(path.endsWith('.catalogId')){const formula=getNested(state.formulaDraft,path.slice(0,path.lastIndexOf('.')+1));formula.params={};rerender=true;}if(path.endsWith('source')||path.endsWith('group')){const at=path.slice(0,path.lastIndexOf('.')+1),formula=getNested(state.formulaDraft,at);if(formula?.type==='groupSum'){formula.path='';if(path.endsWith('source'))formula.group='';}}}state.sampleText='';if(state.draft?.mode==='manual')manual.formulaChanged();if(state.draft?.mode==='filter')filter.apply();if(rerender)renderInspector();else{refreshDatePreviews();refreshFormulaSample();}changed(false);clearTimeout(formulaSampleTimer);if(formulaHasFaker(state.formulaDraft)){const token=formulaSampleToken;formulaSampleTimer=setTimeout(()=>{if(token===formulaSampleToken)testFormulaAction();},200);}}
 function openField(key){if(state.formulaDirty&&!applyRule())return;state.selectedKey=key;state.inspectorMode='field';state.inspectorTab='value';state.inspectorOpen=true;state.formulaDraft=null;state.sampleText='';document.querySelectorAll('.xml-row').forEach(row=>row.classList.toggle('selected',row.dataset.side==='output'&&row.dataset.key===key));renderInspector();layout.present(state.inspectorOpen);drawConnections();}
 function connect(source,target){remember();const old=rules()[target]||{};rules()[target]={...old,sourcePath:source,generator:old.generator&&old.generator.type!=='copy'?old.generator:{type:'copy',path:source},fixed:old.fixed??null};state.sourceKey=null;state.drag=null;state.selectedKey=target;state.formulaDraft=null;changed();render();toast('Vínculo salvo. Fórmulas e valores fixos existentes foram preservados.','success');}
  function allNodes(side='output'){const d=docs(),doc=side==='input'?d.source:d.target;return doc?X.nodes(X.project(doc,side==='input'?state.draft.inputGroup:outputGroup())):[];}
 function presencePolicies(){state.draft.presenceByMode??={new:{},return:{}};return state.draft.presenceByMode[state.draft.mode]??={};}
 function structuralPath(path){const parts=JSON.parse(path),group=JSON.parse(outputGroup());return parts.length<=group.length&&parts.every((p,i)=>JSON.stringify(p)===JSON.stringify(group[i]))||headerPaths().some(header=>pathIsWithin(header,path));}
 function distributionControl(policy,pinned,label='Distribuição nos registros',extra='id="fieldDistribution"'){return `<div class="form-field"><label>${h(label)}<select aria-label="${h(label)}" ${extra} ${pinned||policy.requirement!=='optional'||policy.include===false?'disabled':''}><option value="all" ${policy.distribution!=='alternate'?'selected':''}>Em todos os registros</option><option value="alternate" ${policy.distribution==='alternate'?'selected':''}>Intercalar por registro</option></select></label></div>`;}
 function presenceControls(){const field=selectedField(),policy=state.presenceDraft;const pinned=structuralPath(field.key);return `<div class="form-field"><label for="fieldRequirement">Presença ${field.isGroup?'do grupo':'do campo'}</label><select id="fieldRequirement"><option value="inherit" ${policy.requirement==='inherit'?'selected':''}>Padrão do modelo</option><option value="required" ${policy.requirement==='required'?'selected':''}>Obrigatório</option><option value="optional" ${policy.requirement==='optional'?'selected':''}>Opcional</option></select></div>${policy.requirement==='optional'?`<div class="switch-row"><label for="fieldIncluded">Gerar ${field.isGroup?'este grupo':'este campo'}</label><input id="fieldIncluded" type="checkbox" ${policy.include!==false?'checked':''} ${pinned?'disabled':''}></div><p class="hint">${pinned?'A raiz e a unidade do registro permanecem presentes.':'Ao omitir um grupo, todos os seus campos também são omitidos. As regras ficam salvas para reincluir depois.'}</p>${distributionControl(policy,pinned)}${policy.distribution==='alternate'&&!pinned?'<p class="hint">Presente no 1º registro, omitido no 2º, presente no 3º e assim por diante.</p>':''}`:policy.requirement==='required'?'<p class="hint">Presença obrigatória. Campos de valor também precisam de conteúdo. Se o grupo pai opcional for omitido, seus filhos não são exigidos.</p>':''}<div class="section-divider"></div>`;}
 function savePresenceDraft(){const policies=presencePolicies();if(state.presenceDraft.requirement==='inherit')delete policies[state.selectedKey];else policies[state.selectedKey]={requirement:state.presenceDraft.requirement,include:state.presenceDraft.requirement==='required'||structuralPath(state.selectedKey)?true:state.presenceDraft.include!==false,distribution:state.presenceDraft.requirement==='optional'&&!structuralPath(state.selectedKey)?state.presenceDraft.distribution||'all':'all'};}
 function selectedIsOmitted(){const policies={...presencePolicies(),[state.selectedKey]:state.presenceDraft},selected=JSON.parse(state.selectedKey);return Object.entries(policies).some(([path,p])=>{const parts=JSON.parse(path);return p.requirement==='optional'&&p.include===false&&parts.length<=selected.length&&parts.every((part,i)=>JSON.stringify(part)===JSON.stringify(selected[i]));});}
 function openPresenceTree(){
  const doc=docs().target;if(!doc)return toast('Adicione um XML para configurar campos e grupos.','warning');
  const preview=X.project(doc,outputGroup()),nodes=X.nodes(preview),policies=presencePolicies();let editor;
  openModal('Campos e grupos','Defina presença e escolha os elementos opcionais desta geração.',
   '<p class="hint presence-intro">Omitir um grupo remove seus descendentes da saída. O modelo, os vínculos e as fórmulas ficam preservados. A raiz, os cabeçalhos e o caminho da unidade do registro permanecem presentes.</p><div class="presence-editor" id="presenceEditor"></div>',
   [{text:'Cancelar',run:closeModal},{text:'Aplicar presença',primary:true,run:()=>{
    remember();state.draft.presenceByMode[state.draft.mode]=editor.policies();state.formulaDraft=null;changed();closeModal();render();toast('Presença aplicada. Gere para atualizar a saída.','success');
   }}],true);
  $('modal').classList.add('presence-dialog');
  editor=PresenceEditor.mount($('presenceEditor'),{nodes,policies,pinned:structuralPath,xmlMarkup:codeMarkup(preview,'presence'),onViewChange:view=>$('modal').classList.toggle('presence-xml-dialog',view==='xml')});
 }
 function extraParameters(f,prefix){const input=(label,name,value,type='text',extra='')=>control(label,prefix+name,value,type,extra);const select=(label,name,options,value)=>selectControl(label,prefix+name,options,value);let body='';
  if(f.type==='list'){let values=[];try{values=E.listValues(f.values);}catch{}body=`<div class="form-field"><label>Lista de valores (um por linha)<textarea aria-label="Lista de valores (um por linha)" data-f="${prefix}values" placeholder="Um valor por linha">${h(Array.isArray(f.values)?f.values.join('\n'):f.values||'')}</textarea></label></div>`+select('Como usar a lista','mode',[['single','Usar um valor escolhido'],['random','Sortear a cada registro']],f.mode||'single');if(f.mode!=='random')body+=select('Valor escolhido','index',values.map((v,i)=>[String(i),v]),String(f.index??0));return body+'<p class="hint">Uma linha por valor. O sorteio usa somente esta lista e pode repetir valores.</p>';}
  if(f.type==='hash')return input('Quantidade de caracteres do código','length',f.length??32,'number','min="1" max="4096"')+select('Caracteres do código','format',[['hex','Hexadecimal · 0–9 e a–f'],['HEX','Hexadecimal · 0–9 e A–F'],['alphanumeric','Letras e números · A–Z, a–z, 0–9']],f.format||'hex')+'<p class="hint">Código aleatório de 1 a 4.096 caracteres. Cada registro recebe um novo sorteio.</p>';
  if(f.type==='person')body+=select('Dado da pessoa','field',[['name','Nome completo'],['firstName','Primeiro nome'],['lastName','Sobrenome'],['email','E-mail']],f.field||'name');
  if(f.type==='company')body+=select('Dado da empresa','field',[['legalName','Razão social'],['tradeName','Nome fantasia'],['email','E-mail empresarial']],f.field||'legalName');
  if(f.type==='address')body+=select('Dado do endereço','field',[['street','Logradouro'],['number','Número'],['district','Bairro'],['city','Município'],['state','UF'],['zip','CEP sintético'],['full','Endereço completo']],f.field||'street')+select('UF do endereço','state',[['any','Aleatória'],...Object.entries(E.locations).map(([uf,city])=>[uf,uf+' · '+city])],f.state||'any')+'<p class="hint">Endereço e CEP sintéticos, sem consulta aos Correios. A cidade é a capital da UF selecionada.</p>';
  if(f.type==='faker'){const category=(fakerCatalog?.categories||[]).find(item=>item.id===(f.category||'person')),items=[...(category?.items||[]),...(fakerCatalog?.legacyItems||[]).filter(item=>item.id===f.catalogId)],selected=items.some(item=>item.id===f.catalogId)?f.catalogId:items[0]?.id||'',item=items.find(candidate=>candidate.id===selected);const parameters=(item?.parameters||[]).map(parameter=>parameter.type==='multiselect'?`<fieldset class="form-field"><legend>${h(parameter.label)}</legend>${parameter.options.map(([value,label])=>`<label><input type="checkbox" data-faker-components="${prefix}params.${parameter.name}" value="${h(value)}" ${(f.params?.[parameter.name]??parameter.default).includes(value)?'checked':''}> ${h(label)}</label>`).join('')}</fieldset>`:parameter.type==='select'?select(parameter.label,'params.'+parameter.name,parameter.options,f.params?.[parameter.name]??parameter.default):input(parameter.label,'params.'+parameter.name,f.params?.[parameter.name]??parameter.default,parameter.type==='integer'?'number':'text',parameter.type==='integer'?`min="${parameter.min}" max="${parameter.max}" step="1"`:'' )).join('');return (items.length>1?select('Dado fictício','catalogId',items.map(item=>[item.id,item.label]),selected):`<input type="hidden" data-f="${prefix}catalogId" value="${selected}">`)+parameters+input('Perfil compartilhado','group',f.group||'principal')+'<p class="hint">Dados Faker são locais, fictícios e versionados.</p>';}
  return body+input('Perfil compartilhado','group',f.group||'principal')+'<p class="hint">Use o mesmo perfil nos campos relacionados: nome e e-mail da pessoa, dados da empresa ou partes do endereço. Os dados mudam por registro. E-mails usam @example.test.</p>';
 }

 function fieldClick(key,side){if(side==='input'){state.sourceKey=state.sourceKey===key?null:key;document.querySelectorAll('.xml-row').forEach(row=>row.classList.toggle('source-selected',row.dataset.side==='input'&&row.dataset.key===state.sourceKey));renderHead();drawConnections();if(innerWidth<850){state.mobileTab='output';renderPanels();}toast(state.sourceKey?'Origem selecionada. Agora selecione o campo de saída.':'Seleção cancelada.');return;}if(state.sourceKey){connect(state.sourceKey,key);return;}openField(key);}
 function openModal(title,subtitle,body,actions=[],wide=false){const dialog=$('modal');if(dialog.open)dialog.close();dialog.classList.remove('presence-dialog','presence-xml-dialog');dialog.classList.toggle('wide',wide);dialog.innerHTML=`<div class="dialog-head"><div><h2 id="dialogTitle">${h(title)}</h2>${subtitle?`<p>${h(subtitle)}</p>`:''}</div><button class="dialog-close ghost" aria-label="Fechar diálogo" id="dialogClose">×</button></div><div class="dialog-body">${body}<div id="dialogError" class="callout error" role="alert" hidden></div></div><div class="dialog-footer">${actions.map((a,i)=>`<button id="dialogAction${i}" class="${a.primary?'primary':''} ${a.danger?'danger':''}">${h(a.text)}</button>`).join('')}</div>`;$('dialogClose').onclick=closeModal;actions.forEach((a,i)=>$('dialogAction'+i).onclick=async()=>{try{await a.run();}catch(error){dialogError(error.message);}});dialog.showModal();}
 function closeModal(){$('modal').close();}
 $('modal').addEventListener('click',event=>{const d=$('modal');if(event.target!==d)return;const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();});
 function dialogError(message){if($('dialogError')){AppAlerts.render($('dialogError'),message,{type:'error'});}else toast(message,'error');}
 function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function openWorkspaces(){openModal('Seus workspaces','Variações organizadas por aplicação, grupo e arquivo.',state.book.workspaces.map(w=>`<div class="workspace-option"><div><strong>${h(w.name)}</strong><p>${w.configs.length} variação(ões)</p></div><button data-open-workspace="${h(w.id)}" ${w.configs.length?'':'disabled'}>Abrir</button></div>`).join(''),[{text:'Fechar',run:closeModal},{text:'Organizar biblioteca',primary:true,run:()=>safeSwitch(()=>{location.href='/?view=library';})}]);}
 function newConfig(){location.href='/?view=library'+(state.configId?'&parent='+encodeURIComponent(libraryUI.node(state.configId)?.parent_id||''):'');}
 function editXml(side){
  if(!state.draft)return;
  if(side==='output'&&state.draft.mode==='new'){openModal('Estrutura dos novos registros','Neste modo, a saída reutiliza a estrutura do XML de entrada.','<p class="hint">Para outro formato de saída, escolha Retorno e adicione um modelo. Para alterar a estrutura deste arquivo, carregue o XML de entrada.</p>',[{text:'Fechar',run:closeModal},{text:'Carregar XML de entrada',primary:true,run:()=>editXml('input')}]);return;}
  const manualMode=side==='manual',value=manualMode?state.draft.manual.templateXml||inputText():side==='input'?inputText():state.draft.outputTemplate;
  const subtitle=manualMode?'Modelo para preenchimento manual. Ao aplicar outro modelo, os campos são reiniciados.':side==='input'?'XML de entrada · cole, edite ou importe um arquivo.':'Modelo XML de saída · cole, edite ou importe um arquivo.';
  openModal('Carregar XML',subtitle,`${state.draft.mode==='return'?`<div class="xml-document-target"><button class="${side==='input'?'soft':''}" data-action="edit-input">XML de entrada</button><button class="${side==='output'?'soft':''}" data-action="edit-output">Modelo do retorno</button></div>`:''}<div class="xml-loader-toolbar"><label for="rawXml">Documento XML completo</label><button type="button" class="small" id="importXmlButton">${icon('download')}Importar arquivo</button></div><textarea class="xml-editor" id="rawXml" spellcheck="false" placeholder="Cole seu XML aqui">${h(value)}</textarea><p class="hint" id="xmlImportStatus" role="status">XMLs até 2 MB. Revise o conteúdo antes de aplicar.</p>`,[{text:'Cancelar',run:closeModal},{text:manualMode?'Usar modelo':side==='input'?'Usar XML':'Aplicar modelo',primary:true,run:()=>{const xml=$('rawXml').value;X.parse(xml);closeModal();applyXml(side,xml);}}],true);
  $('importXmlButton').onclick=()=>pickXml(side);
 }
 function pickXml(purpose){state.filePurpose=purpose;state.fileDialog=$('modal').open?$('rawXml'):null;state.fileDraft=state.draft;$('xmlFileInput').value='';$('xmlFileInput').click();}
 function detectGroup(doc,existing,headers=[]){const groups=X.recordGroups(doc,headers);return groups.find(group=>group.key===existing)?.key||groups[0]?.key||'';}
 function applyXml(side,xml){if(side==='manual')return manual.install(xml);if(state.draft.mode==='filter'){X.parse(xml);remember();state.draft.sourceTemplate=xml;state.sessionXml=null;state.snapshot=null;state.inputRecord=state.outputRecord=0;filter.ensure();changed();render();toast('XML carregado para filtrar.','success');return;}const doc=X.parse(xml);if(state.formulaDirty&&!applyRule())return;remember();if(side==='input'){state.inputRecord=0;state.draft.sourceTemplate=xml;state.sessionXml=null;state.draft.inputGroup=detectGroup(doc,state.draft.inputGroup,state.draft.headersByMode?.new||[]);state.draft.inputByMode??={};state.draft.inputByMode[state.draft.mode]={xml,group:state.draft.inputGroup};}else{state.draft.outputTemplate=xml;state.draft.outputGroup=detectGroup(doc,state.draft.outputGroup,headerPaths());}changed();state.selectedKey=null;state.sourceKey=null;state.formulaDraft=null;render();toast('XML válido carregado. Salve para continuar daqui na próxima abertura.','success');if(orphanRules().length)showOrphans();}
 function inputOptions(){const xml=inputText();if(!xml)return editXml('input');X.parse(xml);openModal('XML de entrada','O documento completo fica salvo junto às regras desta operação.',`<div class="callout">✓ XML bem formado · tags, atributos e estrutura sintática válidos.</div><p class="hint">A prévia mostra um registro, mas o arquivo completo é mantido. Validação por esquema XSD exige um arquivo .xsd e não foi executada.</p>`,[{text:'Fechar',run:closeModal},{text:'Carregar XML',primary:true,run:()=>{closeModal();editXml('input');}}]);}
 function autoMap(){const d=docs();if(!d.source||!d.target)return toast('Adicione os dois documentos ou use Novos registros.','warning');const source=X.project(d.source,state.draft.inputGroup),target=X.project(d.target,outputGroup());const result=X.automap(source,target,rules());remember();for(const map of result.mapped)rules()[map.target]={sourcePath:map.source,generator:{type:'copy',path:map.source},fixed:null,comment:'',formulaComment:'',lineComment:''};if(result.mapped.length)changed();render();if(!result.ambiguous.length){toast(result.mapped.length?`${result.mapped.length} campo(s) mapeado(s). Regras existentes preservadas.`:'Nenhum novo mapeamento inequívoco. Regras existentes preservadas.','success');return;}openModal('Revise as correspondências','Nomes iguais em grupos diferentes precisam de uma escolha explícita.',result.ambiguous.map((item,i)=>`<div class="ambiguity"><strong>${h(X.display(item.target))}</strong><select id="ambiguous${i}"><option value="">Deixar pendente</option>${item.candidates.map(c=>`<option value="${h(c.key)}">${h(c.display)}</option>`).join('')}</select></div>`).join(''),[{text:'Deixar pendente',run:closeModal},{text:'Aplicar seleções',primary:true,run:()=>{remember();result.ambiguous.forEach((item,i)=>{const source=$('ambiguous'+i).value;if(source)rules()[item.target]={sourcePath:source,generator:{type:'copy',path:source},fixed:null};});changed();closeModal();render();}}],true);}
 function orphanRules(){const d=docs();if(!d.target)return[];const targetKeys=new Set(allNodes('output').map(f=>f.key));const sourceKeys=new Set(allFields('input',true).map(f=>f.key));return Object.entries(rules()).filter(([key,r])=>!targetKeys.has(key)||(bindingSource(r)&&!sourceKeys.has(bindingSource(r)))).map(([key,r])=>({key,rule:r,kind:!targetKeys.has(key)?'target':'source'}));}
 function showOrphans(){const missing=orphanRules();openModal('Revisar regras e comentários','A estrutura mudou. Nenhuma regra será reassociada automaticamente.',missing.length?missing.map((item,i)=>`<div class="orphan-row"><strong>${item.kind==='target'?'Destino':'Origem'} não encontrado</strong><p>${h(X.display(item.kind==='target'?item.key:bindingSource(item.rule)))}</p><select id="repair${i}">${fieldOptions(item.kind==='target'?'output':'input','')}</select><label style="margin-top:8px"><input type="checkbox" id="removeOrphan${i}"> Remover esta regra e suas notas</label></div>`).join(''):'<p class="hint">Os caminhos das regras atuais foram encontrados.</p>',[{text:'Fechar',run:closeModal},{text:'Aplicar revisão',primary:true,run:()=>{remember();missing.forEach((item,i)=>{if($('removeOrphan'+i).checked){delete rules()[item.key];return;}const target=$('repair'+i).value;if(!target)return;if(item.kind==='source'){item.rule.sourcePath=target;if(item.rule.generator?.type==='copy')item.rule.generator.path=target;}else{if(rules()[target])throw Error('O destino já possui uma regra. Remova-a ou escolha outro campo.');rules()[target]=item.rule;delete rules()[item.key];}});changed();closeModal();render();}}],true);}
 async function generate(){if(state.draft?.mode==='filter')return filter.apply();if(state.draft?.mode==='manual')return manual.confirm();
  if(!state.draft||state.loading||state.saving)return;
  if(state.formulaDirty&&!applyRule())return;
  if(state.draft.mode==='return'&&!state.draft.returnModels.some(model=>model.selected))return toast('Selecione pelo menos um retorno para gerar.','warning');
  const missing=state.draft.mode==='return'&&!R.current(state.draft).selected?[]:orphanRules();if(missing.length){showOrphans();return;}
  state.loading=true;state.generationController=new AbortController();
  $('processing').hidden=false;$('processingText').textContent='Gerando registros e calculando o nome do arquivo…';
  for(const id of ['pageHead','editorToolbar','workArea','bottomBar'])$(id).inert=true;
  StudioApi.report(true);
  try {
   if(!await saveConfig({silent:true,duringGeneration:true}))return;
   if(state.draft.mode==='return')await generateReturns();
   else {
    const config=await resolveFaker(engineConfig(),inputText(),state.generationController.signal);const snapshot=await X.generateAsync(config,inputText(),{signal:state.generationController.signal,onProgress:n=>{$('processingText').textContent='Gerando registros… '+n+' processado(s)';}});
    if(state.generationController.signal.aborted)throw new DOMException('Geração cancelada','AbortError');
    state.publishing=true;$('cancelGeneration').disabled=true;$('processingText').textContent='Salvando o arquivo em Documentos\\MockAíZé…';
    const artifact=await publishSnapshot(snapshot);
    state.snapshot=snapshot;state.artifact=artifact;state.stale=false;state.outputRecord=0;
    state.draft.fileIndex=artifact.fileIndex;state.draft.revision=artifact.revision;
    toast(`${snapshot.count} registro(s) gerado(s) e salvo(s). Nome e XML prontos para exportar.`,'success');
   }
  }catch(error){
   if(error.name==='AbortError')toast('Geração cancelada. A prévia anterior foi preservada.');
   else if(rememberSyncPending(error,state.draft))openModal('Sincronização pendente','A geração precisa de recuperação antes de continuar.',`<div class="callout error">${h(error.message)} Use “Recuperar” antes de gerar novamente.</div>`,[{text:'Fechar',primary:true,run:closeModal}]);
   else openModal('Não foi possível gerar o arquivo','A última prévia foi preservada.',`<div class="callout error">${h(error.message)}</div>`,[{text:'Voltar às regras',primary:true,run:closeModal}]);
  }finally{
   state.loading=false;state.publishing=false;state.generationController=null;
   $('processing').hidden=true;$('cancelGeneration').disabled=false;
   for(const id of ['pageHead','editorToolbar','workArea','bottomBar'])$(id).inert=false;
   StudioApi.report(state.dirty);render();
  }
 }
 function renderReturnSelection(){
  let host=$('returnSelection');
  if(!host){host=document.createElement('div');host.id='returnSelection';$('filenameButton').before(host);}
  host.hidden=state.draft?.mode!=='return';
  if(host.hidden){ReturnSelection.close(host);return;}
  ReturnSelection.mount(host,{items:state.draft.returnModels,onChange:(id,selected)=>{
   const model=state.draft.returnModels.find(item=>item.id===id);if(!model)return;
   model.selected=selected;changed(false);renderReturnSelection();renderFooter();
  }});
 }
 function renderReturnControls(){
  const enabled=state.draft?.mode==='return';document.querySelector('.app').classList.toggle('multiple-returns',enabled);if(!enabled)return;
  const actions=$('outputPanel').querySelector('.pane-actions');actions.insertAdjacentHTML('afterbegin',`<div class="return-model-row return-model-header"><label class="sr-only" for="returnModelTrigger">Modelo de retorno em edição</label><select id="returnModelSelect" data-custom-combobox hidden aria-hidden="true" tabindex="-1">${state.draft.returnModels.map(model=>`<option value="${h(model.id)}" ${model.id===state.draft.activeReturnId?'selected':''}>${h(model.name)}</option>`).join('')}</select><div class="return-model-actions"><button class="ghost small" data-action="save-return" aria-label="Salvar retorno" title="Salvar retorno">${icon('save')}</button><button class="ghost small" data-action="add-return" aria-label="Adicionar retorno" title="Adicionar retorno">＋</button><button class="ghost small" data-action="rename-return" aria-label="Renomear retorno" title="Renomear retorno"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5M4 20l4-1L21 6l-3-3L5 16z"/></svg></button><button class="ghost small danger" data-action="delete-return" aria-label="Excluir retorno" title="Excluir retorno" ${state.draft.returnModels.length===1?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg></button></div><div class="return-combobox" id="returnCombobox"></div></div>`);
  ReturnCombobox.mount($('returnCombobox'),{items:state.draft.returnModels,value:state.draft.activeReturnId,onChange:id=>{const select=$('returnModelSelect');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));},onAdd:addReturn});
 }
 function restoreReturnPreview(){
  const result=state.returnResults[state.draft.activeReturnId];
  state.snapshot=result?.snapshot||null;state.artifact=result?.artifact||null;state.stale=!!result?.stale;
  state.outputRecord=0;state.selectedKey=null;state.sourceKey=null;state.formulaDraft=null;state.editorBaseline=null;state.formulaDirty=false;state.inspectorOpen=false;state.resetScroll=true;
 }
 function switchReturn(id){
  if(state.loading||state.saving){renderPanels();return;}
  if(state.formulaDirty&&!applyRule()){renderPanels();return;}
  R.capture(state.draft);R.activate(state.draft,id);restoreReturnPreview();refreshDirty();render();
 }
 function addReturn(){
  if(state.formulaDirty&&!applyRule())return;
  const current=R.current(state.draft),next='Retorno '+(state.draft.returnModels.length+1);
  openModal('Adicionar retorno','O novo modelo terá XML e regras independentes.',`<div class="form-field"><label for="currentReturnName">Nome do retorno atual</label><input id="currentReturnName" maxlength="120" value="${h(current.name)}"></div><div class="form-field"><label for="newReturnName">Nome do novo retorno</label><input id="newReturnName" maxlength="120" value="${h(next)}"></div>`,[
   {text:'Cancelar',run:closeModal},{text:'Adicionar retorno',primary:true,run:()=>{
    const copy=E.clone(state.draft);R.rename(copy,current.id,$('currentReturnName').value);R.add(copy,$('newReturnName').value);
    remember();state.draft=copy;restoreReturnPreview();changed(false);closeModal();render();editXml('output');
   }}]);
 }
 function renameReturn(){
  if(state.formulaDirty&&!applyRule())return;
  const model=R.current(state.draft);
  openModal('Renomear retorno','Este nome identifica o modelo na seleção e na exportação.',`<div class="form-field"><label for="returnName">Nome</label><input id="returnName" maxlength="120" value="${h(model.name)}"></div>`,[
   {text:'Cancelar',run:closeModal},{text:'Renomear',primary:true,run:()=>{const value=R.validName(state.draft,$('returnName').value,model.id);remember();R.rename(state.draft,model.id,value);changed(false);closeModal();render();}}]);
 }
 function deleteReturn(){
  if(state.formulaDirty&&!applyRule())return;
  const model=R.current(state.draft);
  openModal('Excluir retorno?',model.name,'<p>O modelo XML e todas as regras deste retorno serão removidos. Os demais retornos serão preservados.</p>',[
   {text:'Cancelar',run:closeModal},{text:'Excluir retorno',danger:true,run:()=>{remember();R.remove(state.draft,model.id);delete state.returnResults[model.id];restoreReturnPreview();changed(false);closeModal();render();}}]);
 }
 async function generateReturns(){
  const models=R.selected(state.draft),ready=[],names=new Set();let totalBytes=0;
  for(const model of models){
   if(!model.outputXml.trim())throw Error(model.name+': adicione o modelo XML de saída.');
   let snapshot;
   try{const config=await resolveFaker(R.configuration(engineConfig(),model),inputText(),state.generationController.signal);snapshot=await X.generateAsync(config,inputText(),{signal:state.generationController.signal,onProgress:n=>{$('processingText').textContent=model.name+' · '+n+' registro(s)';}});}
   catch(error){if(error.name==='AbortError')throw error;throw Error(model.name+': '+error.message);}
   // Preserve formula filenames; suffix only collisions so every selected output remains downloadable.
   const original=snapshot.name;let suffix=2;
   while(names.has(snapshot.name.toLocaleLowerCase()))snapshot.name=E.filename(original.replace(/\.xml$/i,'').slice(0,150)+'_'+suffix++);
   names.add(snapshot.name.toLocaleLowerCase());totalBytes+=new TextEncoder().encode(snapshot.xml).length;
   if(totalBytes>100000000)throw Error('Os retornos selecionados excedem 100 MB no total. Reduza a quantidade ou selecione menos modelos.');
   ready.push({model,snapshot});
  }
  if(state.generationController.signal.aborted)throw new DOMException('Geração cancelada','AbortError');
  state.publishing=true;$('cancelGeneration').disabled=true;
  for(const {model,snapshot} of ready){
   $('processingText').textContent='Salvando retorno: '+model.name;
   const artifact=await publishSnapshot(snapshot);
   state.draft.fileIndex=artifact.fileIndex;state.draft.revision=artifact.revision;
   state.returnResults[model.id]={snapshot,artifact,stale:false};
  }
  restoreReturnPreview();
  if(!state.snapshot&&ready.length){R.capture(state.draft);R.activate(state.draft,ready[0].model.id);restoreReturnPreview();}
  toast(`${ready.length} retorno(s) gerado(s), cada um com ${ready[0].snapshot.count} registro(s).`,'success');
 }
 function selectedResults(){return state.draft.returnModels.filter(model=>model.selected).map(model=>({model,result:state.returnResults[model.id]}));}
 function renderReturnsFooter(){
  const chosen=selectedResults(),ready=chosen.length&&chosen.every(({result})=>result&&!result.stale);
  const snapshot=state.snapshot;
  $('bottomBar').innerHTML=`<div class="bottom-summary"><span><b>${chosen.length}</b> retorno(s) selecionado(s)</span><span>${snapshot?`${snapshot.count} registro(s) por retorno`:'Gere para revisar e exportar'}</span></div><div class="export-actions generation-actions"><span class="filename-summary" title="${h(snapshot?.name||'Nome do arquivo por retorno')}">${h(snapshot?.name||'Nome do arquivo por retorno')}</span>${generationControls()}${generationSignal(!!ready)}<button class="${ready?'soft':''}" data-action="export-xml" ${ready?'':'disabled'}>${icon('download')}${chosen.length>1?'Exportar '+chosen.length+' retornos':'Exportar XML'}</button></div>`;
 }
 function exportReturns(){
  const chosen=selectedResults();
  if(!chosen.length||chosen.some(({result})=>!result||result.stale))return toast('Gere todos os retornos selecionados para exportar.','warning');
  const link=document.createElement('a');
  if(chosen.length===1){link.href=chosen[0].result.artifact.downloadUrl;link.download=chosen[0].result.snapshot.name;}
  else{link.href='/api/variations/'+encodeURIComponent(state.configId)+'/artifacts.zip?'+chosen.map(({result})=>'id='+encodeURIComponent(result.artifact.id)).join('&');link.download='MockAiZe-retornos.zip';}
  document.body.append(link);link.click();link.remove();toast('Download iniciado para '+chosen.length+' retorno(s).','success');
 }
 function lineComment(key,side){const rule=rules()[key]||{};const structural=key.startsWith('@');const text=side==='input'?state.draft.inputNotes?.[key]||'':structural?state.draft.outputNotesByMode?.[state.draft.mode]?.[key]||'':rule.lineComment||'';openModal('Anotação na linha do XML',noteLabel(key),`<div class="form-field"><label for="lineNote">Comentário interno</label><textarea id="lineNote" maxlength="2000">${h(text)}</textarea></div><div class="callout">A anotação fica salva na configuração e aparece na prévia. Não será inserida no XML exportado.</div>`,[{text:'Cancelar',run:closeModal},{text:'Salvar comentário',primary:true,run:()=>{remember();const value=$('lineNote').value;if(side==='input'){state.draft.inputNotes??={};state.draft.inputNotes[key]=value;}else if(structural){state.draft.outputNotesByMode??={new:{},return:{}};state.draft.outputNotesByMode[state.draft.mode]??={};state.draft.outputNotesByMode[state.draft.mode][key]=value;}else rules()[key]={...rule,generator:rule.generator||null,fixed:rule.fixed??null,lineComment:value};changed(false);closeModal();render();}}]);}
 function baseDateDialog(){openModal('Data-base e origem dos registros','A data fica fixa durante cada geração.',`<div class="form-field"><label for="dateBase">Data-base</label><input type="date" id="dateBase" value="${h(state.draft.baseDate)}"></div>${state.draft.mode==='return'?'<div class="callout">Cada registro importado gera um retorno com seus próprios valores mapeados. A quantidade é definida pelo XML de entrada.</div>':''}<p class="hint">Datas futuras em +5/+10/+15/+30 usam dias corridos. Próximo dia útil usa segunda a sexta e os feriados definidos na fórmula.</p>`,[{text:'Cancelar',run:closeModal},{text:'Aplicar',primary:true,run:()=>{E.parseDate($('dateBase').value);remember();state.draft.baseDate=$('dateBase').value;state.draft.returnSource='all';changed();closeModal();render();}}]);}
 function showHelp(){openModal('Como usar o MockAíZé','Protótipo local e funcional para explorar o fluxo.',`<ol class="help-list"><li>Crie um workspace e uma configuração. Cole ou importe um XML e escolha o grupo que representa um registro.</li><li>Use <b>Novos registros</b> para criar outro arquivo da mesma estrutura. Use <b>Retorno</b> para fornecer outro modelo de saída.</li><li>Conecte campos arrastando os pontos ou clicando na origem e depois no destino. Automapeamento preserva as regras existentes.</li><li>Selecione um campo da saída para aplicar uma fórmula, fixar um valor ou deixar comentários.</li><li>Em <b>Nome do arquivo</b>, combine texto, datas, sequenciais e campos do XML.</li><li>Gere, revise e exporte. A entrada mostra o primeiro registro; o arquivo contém a quantidade gerada.</li><li>Salve a configuração. Exporte o workspace em JSON para levar os modelos e regras a outro navegador.</li></ol><div class="callout">Os exemplos ASLC e ACTC são XMLs genéricos ilustrativos, sem conformidade oficial de leiaute. Validação XSD não é executada. Limites: 2 MB por XML e até 10000 registros por geração.</div>`,[{text:'Entendi',primary:true,run:closeModal}],true);}
 async function exportPowerShell(){if(['manual','filter'].includes(state.draft?.mode))return toast('No modo Manual, use Exportar XML de entrada.');
  if(state.loading||state.saving)return toast('Aguarde a operação atual.','warning');
  if(!await saveConfig({silent:true}))return;
  const button=document.getElementById('navScripts');if(button)button.disabled=true;
  try{const bundle=await StudioApi.bundles(state.draft);openModal('Motor PowerShell independente','PS1 + BAT com os modelos e regras desta variação.',`<p class="hint">Arquivos salvos em Documentos\\MockAíZé. Copie os dois arquivos para a mesma pasta para executar.</p><a class="bundle-link" href="${h(bundle.ps1Url)}" download="MockAize.ps1">Baixar MockAize.ps1</a><a class="bundle-link" href="${h(bundle.batUrl)}" download="MockAize.bat">Baixar MockAize.bat</a>`,[{text:'Fechar',run:closeModal}]);}catch(error){toast(error.message,'error');}finally{if(button)button.disabled=false;}
 }

 function headerPaths(){state.draft.headersByMode??={new:[],return:[]};return state.draft.headersByMode[state.draft.mode]??=[];}
 function pathIsWithin(path,parent){const a=JSON.parse(path),b=JSON.parse(parent);return a.length>=b.length&&b.every((part,index)=>JSON.stringify(part)===JSON.stringify(a[index]));}
 function headerControls(){return `<div class="header-controls"><div class="switch-row"><label for="headerToggle">Cabeçalho único</label><input id="headerToggle" type="checkbox" ${headerPaths().includes(state.selectedKey)?'checked':''}></div><p class="hint">Esta tag sai uma vez por arquivo. Os campos internos continuam aceitando fórmulas, vínculos e valores fixos.</p></div>`;}
 function headerFieldNote(){return headerPaths().some(path=>pathIsWithin(state.selectedKey,path))?'<p class="header-field-note">Campo do cabeçalho · gerado uma vez, com a fórmula deste campo.</p>':'';}
 function toggleHeader(enabled){
  const path=state.selectedKey,headers=headerPaths();
  if(!enabled){remember();state.draft.headersByMode[state.draft.mode]=headers.filter(item=>item!==path);changed();render();return;}
  const related=group=>pathIsWithin(path,group)||pathIsWithin(group,path);
  const commit=group=>{
   remember();if(!headers.includes(path))headers.push(path);
   const parts=JSON.parse(path);for(let length=1;length<=parts.length;length++)presencePolicies()[JSON.stringify(parts.slice(0,length))]={requirement:'required',include:true,distribution:'all'};
   if(group){if(state.draft.mode==='new')state.draft.inputGroup=group;else state.draft.outputGroup=group;state.snapshot=null;}
   state.formulaDraft=null;changed();render();toast('Cabeçalho único marcado. Configure as fórmulas nos campos internos.','success');
  };
  if(!related(outputGroup())){commit(null);return;}
  const candidates=X.recordGroups(docs().target,[...headers,path]).filter(group=>!related(group.key));
  const repeated=candidates.find(group=>group.count>1);
  if(repeated){commit(repeated.key);return;}
  if(!candidates.length){showRuleError('Marque somente a tag do cabeçalho. A tag que contém os registros precisa continuar como estrutura do arquivo.');renderInspector();return;}
  openModal('Cabeçalho e registros separados','Escolha qual tag será repetida; o cabeçalho será mantido uma única vez.',`<label for="headerRecordGroup">Tag de cada registro</label><select id="headerRecordGroup">${candidates.map(group=>`<option value="${h(group.key)}">${h(group.display)}</option>`).join('')}</select><p class="hint">As fórmulas e os vínculos dos campos permanecem salvos.</p>`,[{text:'Cancelar',run:()=>{closeModal();renderInspector();}},{text:'Marcar cabeçalho',primary:true,run:()=>{const group=$('headerRecordGroup').value;closeModal();commit(group);}}]);
 }
 const actions={
  'add-return':addReturn,'save-return':()=>saveConfig(),'rename-return':renameReturn,'delete-return':deleteReturn,
  'manual-remove-formula':manual.removeFieldFormula,'manual-filename':manual.toggleName,'manual-add-record':manual.addRecord,'manual-prev-record':manual.previous,'manual-next-record':manual.next,'manual-model':manual.editModel,'manual-import':()=>pickXml('manual'),'manual-confirm':manual.confirm,'manual-export':manual.exportXml,
  'copy-formula':copyFormula,'paste-formula':pasteFormula,'editor-presentation':()=>{layout.setMode(layout.prefs.editorMode==='modal'?'panel':'modal');state.inspectorOpen=true;renderInspector();},history:async()=>{try{const rows=await StudioApi.artifacts(state.configId);openModal('Arquivos gerados','Salvos em Documentos\\MockAíZé\\Gerados.',rows.length?rows.map(row=>`<a class="artifact-entry" href="${h(row.downloadUrl)}" download="${h(row.file_name)}">${h(row.file_name)}<small>${h(new Date(row.created_at).toLocaleString('pt-BR'))} · ${Math.ceil(row.byte_length/1024)} KB</small></a>`).join(''):'<p class="hint">Nenhum arquivo gerado nesta variação.</p>',[{text:'Fechar',run:closeModal}]);}catch(error){toast(error.message,'error');}},presence:openPresenceTree,
  filename:()=>{if(state.loading||state.saving)return toast('Aguarde ou cancele a operação em andamento.','warning');if(state.draft.mode==='manual')return manual.toggleName();if(state.draft.mode==='filter')return filter.toggleName();state.inspectorMode='filename';state.inspectorOpen=true;state.formulaDraft=null;state.sampleText='';renderInspector();layout.present(state.inspectorOpen);},
  inspector:()=>{state.inspectorOpen=false;renderInspector();layout.present(state.inspectorOpen);requestAnimationFrame(drawConnections);},
  'validate-input':()=>{X.parse(inputText());toast('XML bem formado: tags, atributos e estrutura sintática válidos.','success');},
  'close-inspector':()=>{state.inspectorOpen=false;renderInspector();layout.present(state.inspectorOpen);requestAnimationFrame(drawConnections);},
  automap:autoMap,manual:()=>{state.inspectorOpen=false;renderInspector();layout.present(state.inspectorOpen);toast('Selecione um campo de entrada e depois o destino. Esc cancela.');},undo,
  'new-config':()=>safeSwitch(newConfig),'base-date':baseDateDialog,
  'edit-input':()=>editXml('input'),'edit-output':()=>editXml('output'),'upload-input':()=>pickXml('input'),'input-options':inputOptions,
  'view-full':()=>{if(!state.snapshot)return;openModal('XML completo desta geração',`${state.snapshot.name} · ${state.snapshot.count} registro(s)`,`<textarea class="xml-editor" id="fullXml" readonly spellcheck="false">${h(state.snapshot.xml)}</textarea>`,[{text:'Fechar',run:closeModal},{text:'Exportar XML',primary:true,run:()=>actions['export-xml']()}],true);},
  'prev-record':()=>{state.outputRecord=Math.max(0,state.outputRecord-1);renderPanels();drawConnections();},
  'next-record':()=>{state.outputRecord=Math.min(state.snapshot.count-1,state.outputRecord+1);renderPanels();drawConnections();},
  'export-xml':()=>{if(state.draft.mode==='return')return exportReturns();if(!state.snapshot||state.stale)return toast('Gere novamente para aplicar as alterações.','warning');if(state.artifact){const link=document.createElement('a');link.href=state.artifact.downloadUrl;link.download=state.snapshot.name;document.body.append(link);link.click();link.remove();}else download(state.snapshot.xml,state.snapshot.name,'application/xml;charset=utf-8');toast(`Download iniciado: ${state.snapshot.name}`,'success');},
  'test-formula':testFormulaAction,'apply-rule':applyRule,
  'cancel-rule':()=>{state.formulaDraft=null;state.sampleText='';renderInspector();},
  'remove-rule':()=>{remember();delete presencePolicies()[state.selectedKey];const source=bindingSource(rules()[state.selectedKey]);if(source)rules()[state.selectedKey]={sourcePath:source,generator:{type:'copy',path:source},fixed:null};else delete rules()[state.selectedKey];state.formulaDraft=null;changed();render();toast(source?'Fórmula removida. O vínculo foi preservado e voltou a copiar da entrada.':'Regra removida. Desfazer restaura a configuração anterior.','success');},
  'disconnect':()=>{remember();const rule=rules()[state.selectedKey];if(!rule)return;rule.sourcePath=null;if(rule.generator?.type==='copy')rule.generator=null;state.sourceKey=null;state.formulaDraft=null;changed();render();toast('Origem desconectada. Outras fórmulas e valores fixos foram preservados.','success');},
  
  rename:()=>{openModal('Renomear configuração','O nome pode ser usado na fórmula do arquivo.',`<div class="form-field"><label for="renameValue">Nome</label><input id="renameValue" value="${h(state.draft.name)}"></div>`,[{text:'Cancelar',run:closeModal},{text:'Aplicar',primary:true,run:()=>{const value=$('renameValue').value.trim();if(!value)throw Error('Informe o nome.');remember();state.draft.name=value;changed();closeModal();render();}}]);}
 };
 document.addEventListener('click',event=>{const target=event.target.closest('button,[data-field]');if(!target)return;try{if(target.dataset.action){Promise.resolve(actions[target.dataset.action]?.()).catch(error=>toast(error.message,'error'));return;}if(target.dataset.config){safeSwitch(()=>{loadConfig(target.dataset.config);});return;}if(target.dataset.openWorkspace){const id=target.dataset.openWorkspace;closeModal();safeSwitch(()=>{state.workspaceId=id;state.book.activeWorkspace=id;const config=preferredConfig();if(!config){location.href='/?view=library&parent='+encodeURIComponent(id);return;}return loadConfig(config);});return;}if(target.dataset.mode){switchMode(target.dataset.mode);return;}if(target.dataset.group){state.sourceKey=null;openField(target.dataset.group);return;}if(target.dataset.field){if(state.draft.mode==='manual'){manual.focusField(target.dataset.field);return;}if(state.suppressClick){state.suppressClick=false;return;}fieldClick(target.dataset.field,target.dataset.side);return;}if(target.dataset.note){lineComment(target.dataset.note,target.dataset.side);return;}if(target.dataset.inspector){if(state.formulaDirty&&!applyRule())return;const nextMode=target.dataset.inspector==='filename'?'filename':'field';if(nextMode!==state.inspectorMode)state.formulaDraft=null;state.inspectorMode=nextMode;state.inspectorTab=target.dataset.inspector==='comments'?'comments':'value';renderInspector();return;}if(target.dataset.setF){const value=Object.hasOwn(target.dataset,'number')?Number(target.dataset.number):target.dataset.value;changeFormula(target.dataset.setF,value,true);return;}if(target.dataset.part){const parent=getNested(state.formulaDraft,target.dataset.parent);const i=Number(target.dataset.index);if(target.dataset.part==='add'){parent.parts.push(E.defaults('literal'));}if(target.dataset.part==='remove')parent.parts.splice(i,1);if(target.dataset.part==='up'&&i>0)[parent.parts[i-1],parent.parts[i]]=[parent.parts[i],parent.parts[i-1]];if(target.dataset.part==='down'&&i<parent.parts.length-1)[parent.parts[i+1],parent.parts[i]]=[parent.parts[i],parent.parts[i+1]];state.sampleText='';renderInspector();changed(false);return;}if(target.dataset.mobileTab){state.mobileTab=target.dataset.mobileTab;renderPanels();}}catch(error){if($('modal').open)dialogError(error.message);else toast(error.message,'error');}});
 function markInspectorDirty(event){if(event.target.closest('#inspector,#filterNameEditor,#manualNameEditor,#manualFieldEditor')&&event.target.matches('input,select,textarea'))queueMicrotask(()=>changed(false));}
 document.addEventListener('input',markInspectorDirty,true);document.addEventListener('change',markInspectorDirty,true);
 document.addEventListener('input',event=>{const target=event.target;if(target.tagName!=='SELECT'&&filter.edit(target))return;if(state.draft?.mode==='manual'&&manual.input(target))return;if(target.dataset.f&&target.tagName!=='SELECT'){changeFormula(target.dataset.f,target.type==='checkbox'?target.checked:target.type==='number'?Number(target.value):target.value,target.type==='checkbox');return;}if(target.dataset.noteDraft)state.notesDraft[target.dataset.noteDraft]=target.value;if(target.id==='fixedValue'){state.fixedDraftValue=target.value;state.sampleText='';refreshDatePreviews();refreshFormulaSample();}if(target.id==='exactLength'){state.exactLengthDraft=target.value;state.sampleText='';refreshFormulaSample();refreshDatePreviews();}});
 document.addEventListener('change',event=>{const target=event.target;if(!target.dataset.fakerComponents)return;const name=target.dataset.fakerComponents,values=Array.from(target.closest('fieldset').querySelectorAll('input:checked')).map(input=>input.value);changeFormula(name,values);});
 function installSourceSearch(){for(const select of document.querySelectorAll('select[data-f]')){if(!/(^|\.)type$/.test(select.dataset.f)||select.dataset.searchReady)continue;select.dataset.searchReady='true';const input=document.createElement('input');input.type='search';input.placeholder='Buscar fonte do valor…';input.setAttribute('aria-label','Buscar fonte do valor');select.before(input);input.addEventListener('input',()=>{const query=input.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();for(const option of select.options)option.hidden=!option.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query);select.size=query?Math.min(8,Math.max(2,Array.from(select.options).filter(o=>!o.hidden).length)):1;});input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();select.focus();}if(event.key==='Enter'){event.preventDefault();const option=Array.from(select.options).find(o=>!o.hidden);if(option){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}}});}}
 new MutationObserver(installSourceSearch).observe(document.body,{childList:true,subtree:true});installSourceSearch();
 document.addEventListener('change',event=>{const target=event.target;try{if(target.tagName==='SELECT'&&filter.edit(target))return;if(target.id==='returnModelSelect'){switchReturn(target.value);return;}if(target.id==='manualRecordGroup'){manual.changeGroup(target.value);return;}if(target.id==='editorModalMode'){layout.setMode(target.checked?'modal':'panel');renderInspector();return;}if(target.id==='headerToggle'){toggleHeader(target.checked);return;}if(target.id==='lengthTarget'){state.lengthTargetDraft=target.value;state.sampleText='';renderInspector();return;}if(target.id==='fieldRequirement'){state.presenceDraft.requirement=target.value;if(target.value!=='optional')state.presenceDraft.include=true;renderInspector();return;}if(target.id==='fieldIncluded'){state.presenceDraft.include=target.checked;renderInspector();return;}if(target.id==='fieldDistribution'){state.presenceDraft.distribution=target.value;renderInspector();return;}if(target.dataset.f&&target.tagName==='TEXTAREA'){renderInspector();return;}if(target.dataset.f&&target.tagName==='SELECT'){changeFormula(target.dataset.f,target.value,true);return;}if(target.id==='fixedToggle'){state.fixedDraft=target.checked;renderInspector();return;}if(target.id==='recordCount'){const count=Number(target.value);if(!Number.isInteger(count)||count<1||count>10000)throw Error('Informe entre 1 e 10000 registros.');remember();state.draft.count=count;changed();renderHead();return;}if(target.id==='recordGroup'){remember();if(state.draft.mode==='new')state.draft.inputGroup=target.value;else state.draft.outputGroup=target.value;state.snapshot=null;state.formulaDraft=null;state.selectedKey=null;changed();render();return;}}catch(error){toast(error.message,'error');renderHead();}});
 document.addEventListener('click',event=>{if(event.target.closest('#generateButton'))generate();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){state.sourceKey=null;state.drag=null;renderHead();drawConnections();document.querySelectorAll('.source-selected').forEach(e=>e.classList.remove('source-selected'));}if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-field]:not(button)')){event.preventDefault();if(state.draft?.mode==='manual')manual.focusField(event.target.dataset.field);else fieldClick(event.target.dataset.field,event.target.dataset.side);}if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();saveConfig();}});
 document.addEventListener('pointerdown',event=>{const port=event.target.closest('.input-port');if(!port||event.button!==0)return;state.drag={key:port.dataset.field,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false};});
 document.addEventListener('pointermove',event=>{if(!state.drag)return;Object.assign(state.drag,{x:event.clientX,y:event.clientY});if(Math.abs(event.clientX-state.drag.startX)+Math.abs(event.clientY-state.drag.startY)>6)state.drag.moved=true;drawConnections();});
 document.addEventListener('pointerup',event=>{if(!state.drag)return;const drag=state.drag;state.drag=null;if(drag.moved){const dest=event.target.closest('[data-field][data-side="output"]');if(dest){state.suppressClick=true;connect(drag.key,dest.dataset.field);setTimeout(()=>state.suppressClick=false,0);}drawConnections();}});
 function renderThemeToggle(){const light=document.documentElement.dataset.theme==='light',button=$('themeToggle');button.innerHTML=light?'<svg class="theme-icon moon-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.7 8.7 0 0 1 8.9 3.8 8.8 8.8 0 1 0 20.2 15.1Z"/></svg>':'<svg class="theme-icon sun-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';button.setAttribute('aria-label',light?'Mudar para tema escuro':'Mudar para tema claro');button.title=light?'Mudar para tema escuro':'Mudar para tema claro';} $('themeToggle').onclick=async()=>{try{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';await StudioApi.theme(theme);document.documentElement.dataset.theme=theme;renderThemeToggle();}catch(error){toast(error.message,'error');}};renderThemeToggle();
 $('retryStudio').onclick=()=>loadConfig(state.loadId||requestedId);
 $('saveConfig').onclick=()=>saveConfig();$('recoverSync').onclick=()=>recoverPending();
 $('cancelGeneration').onclick=()=>{if(state.publishing)return;state.generationController?.abort();};
 $('xmlFileInput').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  const token=++state.operationToken,purpose=state.filePurpose||'input',editor=state.fileDialog,draft=state.fileDraft;
  try{
   if(file.size>2000000)throw Error('O arquivo excede 2 MB.');
   const text=await file.text();if(token!==state.operationToken||draft!==state.draft)return;
   if(editor&&(!editor.isConnected||!$('modal').open))return;
   X.parse(text);
   if(purpose==='new-config'){$('newConfigXml').value=text;return;}
   if(editor){editor.value=text;AppAlerts.render($('xmlImportStatus'),file.name+' carregado. Revise o XML e clique em '+(purpose==='manual'?'Usar modelo':purpose==='input'?'Usar XML':'Aplicar modelo')+'.',{type:'success'});$('dialogError').hidden=true;return;}
   applyXml(purpose,text);
  }catch(error){if($('modal').open)dialogError(error.message);else toast(error.message,'error');}
 };
 document.addEventListener('pointercancel',()=>{state.drag=null;drawConnections();});window.addEventListener('blur',()=>{state.drag=null;drawConnections();});
 window.addEventListener('resize',drawConnections);window.addEventListener('beforeunload',event=>{if(state.dirty||state.loading||state.saving||state.syncPending){event.preventDefault();event.returnValue='';}});
 function switchMode(next){if(state.loading||state.saving||state.switching)return toast('Aguarde ou cancele a operação em andamento.','warning');if(!Object.hasOwn(AppNavigation.modes,next)||!state.draft)return;R.capture(state.draft);if(next===state.draft.mode)return;if(state.formulaDirty&&!applyRule())return;remember();if(state.draft.mode!=='manual'){state.draft.inputByMode??={};state.draft.inputByMode[state.draft.mode]={xml:inputText(),group:state.draft.inputGroup};}if(next==='manual')manual.ensure(inputText());state.draft.mode=next;state.inputRecord=0;state.outputRecord=0;const input=state.draft.inputByMode[next];if(input){state.draft.sourceTemplate=input.xml;state.draft.inputGroup=input.group;}state.sessionXml=null;state.snapshot=null;state.artifact=null;state.stale=false;state.selectedKey=null;state.formulaDraft=null;state.editorBaseline=null;state.formulaDirty=false;state.sourceKey=null;state.inspectorOpen=false;changed();render();}

 function navigateHome(view='home'){navigation.close();safeSwitch(()=>{location.href='/?view='+view;});}
 function openConfiguration(id){navigation.close();safeSwitch(async()=>{const ws=state.book.workspaces.find(w=>w.configs.some(c=>c.id===id));if(!ws)return;state.workspaceId=ws.id;await loadConfig(id);});}
 function previewFileName(){
  const c=state.draft;if(state.snapshot?.name)return state.snapshot.name;
  if(c.mode==='manual')return manual.nameLabel();
  const formula=c.mode==='filter'?c.filter.filename:c.filenameByMode[c.mode];
  const key=JSON.stringify([c.id,c.mode,formula,c.count,c.fileIndex,c.baseDate,c.name,inputText(),c.outputTemplate]);
  if(filenamePreviews.has(key))return filenamePreviews.get(key);
  try{const value=E.filename(E.evaluate(formula,formulaContext()));if(filenamePreviews.size>20)filenamePreviews.clear();filenamePreviews.set(key,value);return value;}catch{return c.name+' · revise a fórmula';}
 }
 function refreshPresentation(){
  if(presentationQueued)return;presentationQueued=true;queueMicrotask(()=>{presentationQueued=false;const c=state.draft;if(!navigation||!c)return;
   navigation.update({fileId:c.id,workspaceId:state.workspaceId,name:c.name,mode:c.mode});
   $('fileHeading').querySelector('h1').textContent=c.name;$('fileHeading').querySelector('p').textContent=AppNavigation.modes[c.mode].description;
   const name=previewFileName(),summary=$('fileNameSummary').querySelector('code');summary.textContent=name;summary.title=name;
   $('filterUndoButton').hidden=c.mode!=='filter';$('filterUndoButton').disabled=!canUndo();
  });
 }
 navigation=AppNavigation.create({library:libraryUI,themeButton:$('themeToggle'),notify:toast,
  onHome:()=>navigateHome(),onLibrary:()=>navigateHome('library'),onOpen:openConfiguration,onMode:switchMode,
  onWorkspace:id=>safeSwitch(async()=>{state.workspaceId=id;state.book.activeWorkspace=id;const config=preferredConfig();if(config)await loadConfig(config);else location.href='/?view=library&parent='+encodeURIComponent(id);}),
  onTool:tool=>{if(tool==='help')return showHelp();if(state.loading||state.saving)return toast('Aguarde ou cancele a operação em andamento.','warning');if(tool==='history')return actions.history();if(tool==='scripts')return exportPowerShell();if(tool==='presence')return actions.presence();return actions[state.draft.mode==='manual'?'manual-model':'edit-input']();}
 });

 globalThis.MockStudio={state,generate,saveConfig,docs,allFields};
 if(!state.book.workspaces.some(w=>w.id===state.workspaceId))state.workspaceId=state.book.workspaces[0].id;
 await loadConfig(requestedId);
 if(state.draft){const params=new URLSearchParams(location.search),mode=params.get('mode'),tool=params.get('tool');if(mode&&Object.hasOwn(AppNavigation.modes,mode))switchMode(mode);if(tool==='scripts')await exportPowerShell();else if(tool==='history')actions.history();else if(tool==='presence')actions.presence();else if(tool==='load')actions[state.draft.mode==='manual'?'manual-model':'edit-input']();if(mode||tool){const url=new URL(location.href);url.searchParams.delete('mode');url.searchParams.delete('tool');history.replaceState(null,'',url);}}

 if(new URLSearchParams(location.search).get('export')==='1'){const url=new URL(location.href);url.searchParams.delete('export');history.replaceState(null,'',url);await exportPowerShell();}
})();
