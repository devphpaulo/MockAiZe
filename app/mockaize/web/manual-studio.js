/* Manual XML entry: values and examples stay separate from the source model. */
globalThis.ManualStudio=(()=>{
 'use strict';
 function create(o){
  const {state,X,E,h}=o,$=id=>document.getElementById(id);let cachedTemplate=null,cachedGroup=null,cachedCount=0,cachedHeaders=null,cached=null,owner=null,activeRecord=0,previewFields=new Map(),formFields=new Map(),filledCount=0;
  const data=()=>state.draft.manual;
  let nameEditor=false,nameTimer=null,activeField=null,liveTimer=null;const nameCache=new Map(),draftValues=new Map();
  function manualGroups(doc){return X.recordGroups(doc,state.draft.headersByMode?.new||[]).filter(group=>X.resolve(doc,group.key)!==doc.documentElement);}
  function chooseGroup(doc,preferred=''){
   const groups=manualGroups(doc),existing=groups.find(group=>group.key===preferred);
   return existing?.key||groups.find(group=>group.count>1)?.key||groups.find(group=>!/cabecalho|header|^bcarq$/i.test(group.name)&&Array.from(X.resolve(doc,group.key).children).some(child=>!child.children.length))?.key||groups[0]?.key||'';
  }
  function ensure(xml){
   state.draft.manual??={templateXml:'',values:{},confirmed:false,fileName:'',recordCount:1,recordGroup:''};
   const manual=data();manual.recordCount??=1;manual.recordGroup??='';manual.filename??={type:'literal',value:manual.fileName||state.draft.name+'_manual.xml'};manual.formulas??={};manual.generated??={};manual.entryMode??='manual';
   if(!manual.templateXml&&xml){manual.templateXml=xml;manual.values={};manual.confirmed=false;manual.recordCount=1;}
   if(manual.templateXml&&!manual.recordGroup)manual.recordGroup=chooseGroup(X.parse(manual.templateXml),state.draft.inputGroup);
   if(owner!==manual){owner=manual;activeRecord=0;nameEditor=false;activeField=null;nameCache.clear();draftValues.clear();}
  }
  function model(){
   const {templateXml,recordGroup,recordCount}=data(),headers=JSON.stringify(state.draft.headersByMode?.new||[]);
   if(templateXml!==cachedTemplate||recordGroup!==cachedGroup||recordCount!==cachedCount||headers!==cachedHeaders){
    const source=X.parse(templateXml),doc=X.project(source,recordGroup),record=recordGroup&&X.resolve(doc,recordGroup);
    if(record){let last=record;for(let i=1;i<recordCount;i++){const copy=record.cloneNode(true);last.after(copy);last=copy;}}
    const fields=X.fields(doc);
    cached={doc,fields,groups:manualGroups(source),byKey:new Map(fields.map(f=>[f.key,f])),byNode:new WeakMap(fields.map(f=>[f.node,f]))};
    cachedTemplate=templateXml;cachedGroup=recordGroup;cachedCount=recordCount;cachedHeaders=headers;
   }
   activeRecord=Math.max(0,Math.min(activeRecord,recordCount-1));return cached;
  }
  function recordIndex(key){
   if(!data().recordGroup)return null;
   const path=JSON.parse(key),group=JSON.parse(data().recordGroup);
   return path.length>=group.length&&group.every((p,i)=>p.name===path[i].name&&p.ns===path[i].ns&&(i===group.length-1||p.index===path[i].index))?path[group.length-1].index-1:null;
  }
  function previewKey(key){if(recordIndex(key)===null)return key;const path=JSON.parse(key),depth=JSON.parse(data().recordGroup).length;path[depth-1].index=activeRecord+1;return JSON.stringify(path);}
  function navigate(index){if(!closeField())return;activeRecord=Math.max(0,Math.min(index,data().recordCount-1));state.resetScroll=true;o.render();}
  function addRecord(){
   if(!data().recordGroup)return o.notify('Selecione o grupo que representa um registro.','warning');
   if(data().recordCount>=500)return o.notify('O limite é de 500 registros por XML.','warning');
   if(!closeField())return;const previous=activeRecord,inherited=Object.entries(data().formulas).filter(([key])=>recordIndex(key)===previous);
   o.remember();activeRecord=data().recordCount;data().recordCount++;data().confirmed=false;
   for(const [key,formula] of inherited)data().formulas[reindex(key,previous,activeRecord)]=reindexFormula(formula,previous,activeRecord);
   // A new page starts blank, including when loading a model saved by older versions.
   for(const f of model().fields)if(recordIndex(f.key)===activeRecord)delete data().values[f.key];
   o.changed(false);state.resetScroll=true;o.render();
  }
  function changeGroup(group){
   if(group===data().recordGroup)return;
   if(!closeField())return;o.remember();data().formulas={};data().generated={};data().recordGroup=group;data().recordCount=1;data().confirmed=false;activeRecord=0;o.changed(false);o.render();
  }
  function put(node,value){if(node.nodeType===2){node.value=value;return;}const text=Array.from(node.childNodes).filter(n=>[3,4].includes(n.nodeType));if(text.length){const first=text[0];if(first.nodeType===4&&value.includes(']]>'))first.replaceWith(node.ownerDocument.createTextNode(value));else first.data=value;for(const extra of text.slice(1))extra.remove();}else node.insertBefore(node.ownerDocument.createTextNode(value),node.firstChild);}
  function reindex(path,from,to){
   if(recordIndex(path)!==from)return path;const parts=JSON.parse(path);parts[JSON.parse(data().recordGroup).length-1].index=to+1;return JSON.stringify(parts);
  }
  function reindexFormula(formula,from,to){const copy=E.clone(formula);if(copy.path)copy.path=reindex(copy.path,from,to);if(copy.group)copy.group=reindex(copy.group,from,to);if(copy.parts)copy.parts=copy.parts.map(p=>reindexFormula(p,from,to));return copy;}
  function formulaFor(key){return activeField===key&&state.inspectorMode==='field'&&state.formulaDraft?state.formulaDraft:data().formulas[key];}
  function calculator(placeholders=false,override=null){
   const m=model(),memo=new Map(),visiting=new Set(),profiles=new Map();
   const raw=node=>node.nodeType===2?node.value:node.textContent;
   function readOriginal(path){if(Object.hasOwn(data().values,path))return data().values[path];const node=X.resolve(m.doc,path);if(!node)throw Error('Campo não encontrado: '+X.display(path));return raw(node);}
   function dependencies(f,ctx){if(f.type==='compose')return(f.parts||[]).map(p=>dependencies(p,ctx));if(f.type==='copy')return ctx.sourceValue(f.path);if(f.type==='field')return(f.source==='input'?ctx.sourceValue:ctx.outputValue)(f.path);if(f.type==='groupSum')return ctx.groupValues(f);if(f.type==='count')return data().recordCount;return null;}
   function read(path){
    if(memo.has(path))return memo.get(path);
    if(visiting.has(path))throw Error('Dependência circular entre fórmulas: '+X.display(path));
    const field=m.byKey.get(path);if(!field)throw Error('Campo não encontrado: '+X.display(path));
    visiting.add(path);
    try{
     const formula=override?.key===path?override.formula:formulaFor(path),rule=ruleFor(field);let value=data().values[path]??'';
     if(formula){
      const index=recordIndex(path)??0;if(!profiles.has(index))profiles.set(index,new Map());
      const ctx={...o.nameContext(),count:data().recordCount,recordIndex:index,profiles:profiles.get(index),sourceValue:readOriginal,outputValue:read,groupValues:f=>{
       const reader=node=>read(X.key(node));
       return f.allRecords?XmlFilter.values(m.doc,f,reader):X.groupValues(m.doc,f.group,f.path,reader,recordIndex(path)!==null&&JSON.parse(f.group).length===JSON.parse(data().recordGroup).length);
      }};
      const signature=JSON.stringify([formula,ctx.baseDate,index,dependencies(formula,ctx)]),pending=activeField===path&&state.formulaDraft||override?.key===path;
      const entry=pending?draftValues.get(path):data().generated[path];
      if(entry?.signature===signature)value=entry.value;
      else{value=E.evaluate(formula,ctx);const next={signature,value};if(pending)draftValues.set(path,next);else data().generated[path]=next;}
     }
     if(value)value=E.ruleValue(rule.lengthTarget==='input'?E.limitLength(value,rule.exactLength):value,rule);
     memo.set(path,value);return value;
    }catch(error){if(!placeholders)throw error;const fallback=data().generated[path]?.value??data().values[path]??'';memo.set(path,fallback);return fallback;}
    finally{visiting.delete(path);}
   }
   return read;
  }
  function build(placeholders=false){
   const m=model(),doc=m.doc.cloneNode(true),read=calculator(placeholders);
   function fill(source,target){
    const field=m.byNode.get(source);if(field){const value=read(field.key);put(target,value|| (placeholders?'['+field.name+']':''));}
    for(const attr of Array.from(source.attributes)){const f=m.byNode.get(attr);if(f){const value=read(f.key);put(target.getAttributeNodeNS(attr.namespaceURI,attr.localName),value||(placeholders?'['+f.name+']':''));}}
    const children=source.children;for(let i=0;i<children.length;i++)fill(children[i],target.children[i]);
   }
   fill(m.doc.documentElement,doc.documentElement);return doc;
  }
  function ruleFor(f){const rule=state.draft.rulesByMode.new||{};if(rule[f.key])return rule[f.key];try{const path=JSON.parse(f.key),group=JSON.parse(data().recordGroup||state.draft.inputGroup);if(group.length<=path.length&&group.every((p,i)=>p.name===path[i].name&&p.ns===path[i].ns)){path[group.length-1].index=1;return rule[JSON.stringify(path)]||{};}}catch{}return {};}
  function guide(f){const rule=ruleFor(f),g=formulaFor(f.key)||rule.generator||{},sample=String(f.value||''),name=f.name.toLowerCase();let mask='';if(g.type==='date')try{mask=E.dateMask(g);}catch{}
   if(!mask){const patterns=[[/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,"yyyy-MM-dd'T'HH:mm:ss"],[/^\d{4}-\d{2}-\d{2}$/,'yyyy-MM-dd'],[/^\d{2}\/\d{2}\/\d{4}$/,'dd/MM/yyyy'],[/^\d{2}:\d{2}:\d{2}$/,'HH:mm:ss']];mask=patterns.find(([re])=>re.test(sample))?.[1]||'';}
   let kind='text',text='Texto livre conforme o leiaute do XML.';
   if(g.type==='cpf'||name.includes('cpf')){kind='cpf';text='CPF válido, com 11 dígitos ou máscara 000.000.000-00.';}
   else if(g.type==='cnpj'||name.includes('cnpj')){kind='cnpj';text='CNPJ válido, numérico ou alfanumérico, com 14 caracteres; máscara permitida.';}
   else if(mask){kind='date';text='Formato: '+mask+'.';}
   else if(/mes.*ano|mesanoref/.test(name)&&/^\d{6}$/.test(sample)){kind='monthyear';text='Mês e ano: MMaaaa, sem separador (ex.: 092026).';}
   else if(/^uf/.test(name)){kind='uf';text='UF: duas letras maiúsculas (ex.: PE).';}
   else if(g.type==='random'||/^[+-]?\d+(?:\.\d+)?$/.test(sample)){kind=sample.includes('.')||g.decimals>0?'decimal':'integer';text=kind==='decimal'?'Número decimal com ponto (ex.: '+(sample||'1250.00')+').':'Somente dígitos'+(/ctrl|ispb|codigo/.test(name)?'; preserve os '+sample.length+' caracteres do modelo.':'.');}
   if(rule.exactLength&&['input','output'].includes(rule.lengthTarget))text+=' Na '+(rule.lengthTarget==='input'?'entrada':'exportação')+', usar os primeiros '+rule.exactLength+' caracteres.';
   const length=(rule.lengthTarget==='output'?null:rule.exactLength)??((/ctrl|ispb|codigo/.test(name)&&/^\d+$/.test(sample))?sample.length:null);
   if(length)text+=' Tamanho exato: '+length+' caracteres.';
   const required=state.draft.presenceByMode.new?.[f.key]?.requirement==='required';
   return {kind,text,mask,length,required,example:sample,g};
  }
  function dateValid(value,mask){const tokens=[],escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const regex=mask.replace(/'([^']*)'|yyyy|fff|zzz|yy|MM|dd|HH|mm|ss|./g,(token,literal)=>{if(literal!==undefined)return escape(literal);if(['yyyy','yy','MM','dd','HH','mm','ss','fff','zzz'].includes(token)){tokens.push(token);return token==='zzz'?'([+-]\\d{2}:\\d{2})':'(\\d{'+(token==='yyyy'?4:token==='fff'?3:2)+'})';}return escape(token);});const match=value.match(new RegExp('^'+regex+'$'));if(!match)return false;const parts=Object.fromEntries(tokens.map((t,i)=>[t,match[i+1]]));for(const [key,min,max] of [['MM',1,12],['dd',1,31],['HH',0,23],['mm',0,59],['ss',0,59]])if(parts[key]!==undefined&&(Number(parts[key])<min||Number(parts[key])>max))return false;if(parts.MM&&parts.dd&&(parts.yyyy||parts.yy)){const year=Number(parts.yyyy||'20'+parts.yy),date=new Date(Date.UTC(year,Number(parts.MM)-1,Number(parts.dd)));if(date.getUTCMonth()!==Number(parts.MM)-1||date.getUTCDate()!==Number(parts.dd))return false;}return true;}
  function errorFor(f){let raw;try{raw=calculator()(f.key);}catch(error){return error.message;}const rule=ruleFor(f);let value=raw;try{if(raw&&rule.lengthTarget==='input')value=E.limitLength(raw,rule.exactLength);if(raw&&rule.lengthTarget==='output')E.ruleValue(raw,rule);}catch(error){return error.message;}const g=guide(f);if(!value)return g.required?'Preencha este campo obrigatório.':'';if(g.length&&Array.from(value).length!==Number(g.length))return 'Informe exatamente '+g.length+' caracteres.';if(g.kind==='cpf'&&!E.validCPF(value))return 'CPF inválido: confira os dígitos verificadores.';if(g.kind==='cnpj'&&!E.validCNPJ(value))return 'CNPJ inválido: confira os caracteres e dígitos verificadores.';if(g.kind==='date'&&!dateValid(value,g.mask))return 'Use uma data/hora válida no formato '+g.mask+'.';if(g.kind==='monthyear'&&(!/^\d{6}$/.test(value)||Number(value.slice(0,2))<1||Number(value.slice(0,2))>12))return 'Use MMaaaa com um mês de 01 a 12.';if(g.kind==='uf'&&!Object.hasOwn(E.locations,value))return 'Informe uma UF válida, em maiúsculas.';if(g.kind==='integer'&&!/^\d+$/.test(value))return 'Use somente dígitos.';if(g.kind==='decimal'&&!/^[+-]?\d+(?:\.\d+)?$/.test(value))return 'Use um número decimal com ponto.';return '';}
  function context(){
   let doc=null;const document=()=>doc??=build();
   const read=path=>{const node=X.resolve(document(),path);if(!node)throw Error('Campo não encontrado: '+X.display(path));return node.nodeType===2?node.value:node.textContent;};
   return{...o.nameContext(),count:data().recordCount,recordIndex:0,profiles:new Map(),sourceValue:read,outputValue:read,groupValues:f=>XmlFilter.values(document(),f)};
  }
  function evaluateName(formula=data().filename){
   const ctx=context(),key=JSON.stringify([formula,data().values,data().formulas,activeField?state.formulaDraft:null,data().recordCount,data().recordGroup,ctx.fileIndex,ctx.baseDate,ctx.configName]);
   if(!nameCache.has(key)){if(nameCache.size>=8)nameCache.delete(nameCache.keys().next().value);nameCache.set(key,E.filename(E.evaluate(formula,ctx)));}
   return nameCache.get(key);
  }
  function nameLabel(){try{return evaluateName();}catch{return 'Revise a fórmula do nome';}}
  function updateName(){const label=$('manualNameSummary');if(label)label.textContent=nameLabel();o.presentation?.();}
  function toggleName(){if(!closeField())return;nameEditor=!nameEditor;state.inspectorOpen=false;if(nameEditor){state.inspectorMode='filename';state.inspectorTab='value';}o.render();}
  function clearDraft(){state.formulaDraft=null;state.editorBaseline=null;state.formulaDirty=false;state.sampleText='';activeField=null;}
  function previewFormula(formula=state.formulaDraft){return calculator(false,{key:activeField,formula})(activeField);}
  function applyField(){
   if(!activeField)return true;
   try{previewFormula();o.remember();data().formulas[activeField]=E.clone(state.formulaDraft);delete data().values[activeField];if(draftValues.has(activeField))data().generated[activeField]=E.clone(draftValues.get(activeField));data().confirmed=false;state.formulaDirty=false;o.appliedBaseline();o.changed(false);o.render();return true;}
   catch(error){const node=$('ruleError');if(node){AppAlerts.render(node,error.message,{type:'error'});}return false;}
  }
  function closeField(){if(!activeField)return true;if(state.formulaDirty&&!applyField())return false;clearDraft();return true;}
  function toggleField(key){
   const same=activeField===key;if(!closeField())return;
   if(!same){if(nameEditor&&state.formulaDirty&&!o.applyName())return;nameEditor=false;activeField=key;state.selectedKey=key;state.inspectorMode='field';state.inspectorTab='value';state.formulaDraft=E.clone(data().formulas[key]||{type:'literal',value:data().values[key]||''});state.editorBaseline=null;state.formulaDirty=false;state.fixedDraft=false;state.notesDraft={};}
   o.render();
  }
  function removeFieldFormula(){
   const key=activeField;if(!key)return;
   o.remember();const value=data().generated[key]?.value||data().values[key]||'';delete data().formulas[key];delete data().generated[key];data().values[key]=value;data().confirmed=false;clearDraft();o.changed(false);o.render();
  }
  function changeEntryMode(mode){if(!closeField())return;o.remember();data().entryMode=mode;o.changed(false);o.render();}
  function refreshValues(){
   if(state.draft?.mode!=='manual'||!data().templateXml)return;
   const read=calculator(true);filledCount=0;
   for(const field of model().fields){const value=read(field.key);if(value)filledCount++;const input=formFields.get(field.key);if(input&&input!==document.activeElement)input.value=value;}
   preview();updateFooter();updateName();
   if(activeField){try{previewFormula();if($('ruleError'))$('ruleError').hidden=true;}catch(error){if($('ruleError')){AppAlerts.render($('ruleError'),error.message,{type:'error'});}}}
  }
  function formulaChanged(){clearTimeout(liveTimer);liveTimer=setTimeout(refreshValues,120);}
  document.addEventListener('click',event=>{
   if(state.draft?.mode!=='manual')return;
   const toggle=event.target.closest('[data-manual-formula]'),mode=event.target.closest('[data-manual-entry-mode]');
   if(toggle){toggleField(toggle.dataset.manualFormula);return;}if(mode){changeEntryMode(mode.dataset.manualEntryMode);return;}
   if(activeField&&!event.target.closest('.manual-field-editor,[data-part],[data-set-f],.date-picker-popup,select,option')&&!event.target.closest('.manual-field:has(.manual-field-editor)')&&!event.target.closest('[data-action],[data-mode]')){const next=event.target.closest('[data-manual-key]')?.dataset.manualKey;if(closeField()){o.render();if(next)formFields.get(next)?.focus({preventScroll:true});}}
  });
  function controls(){return AppNavigation.operationControl('manual');}
  function head(){const count=data().templateXml?model().fields.length:0;$('pageHead').innerHTML=`<div class="manual-head-controls"><div><label>Operação</label>${controls()}</div><div class="manual-name-summary filter-name-summary"><span class="hint">Nome do XML</span><code id="manualNameSummary">${h(nameLabel())}</code></div><button data-action="manual-confirm" class="primary">Confirmar preenchimento</button></div>`;$('editorToolbar').innerHTML=`${o.loadXmlButton('manual-model',true)}${data().templateXml?`<label class="manual-record-group" for="manualRecordGroup">Grupo do registro<select id="manualRecordGroup">${model().groups.map(g=>`<option value="${h(g.key)}" ${g.key===data().recordGroup?'selected':''}>${h(g.display)}</option>`).join('')}</select></label>`:''}<span class="hint">${data().recordCount} registro(s) · ${count} campo(s) no arquivo</span>`;}
  // The full preview is built once; typing changes only its existing value span.
  function preview(){
   previewFields.clear();if(!data().templateXml)return;
   const output=$('outputCode');if(!output)return;
   output.innerHTML=o.renderXml(X.project(build(true),data().recordGroup,activeRecord),previewKey);
   for(const row of output.querySelectorAll('.xml-row[data-key]')){
    const value=row.querySelector('.xml-value,.xml-string');
    if(value)previewFields.set(row.dataset.key,{value,attribute:value.classList.contains('xml-string')});
   }
  }
  function updateValue(key){const entry=previewFields.get(key),field=model().byKey.get(key);if(!entry||!field)return;let value=data().values[key]||'['+field.name+']';if(data().values[key]){const rule=ruleFor(field);try{value=E.ruleValue(rule.lengthTarget==='input'?E.limitLength(value,rule.exactLength):value,rule);}catch{}}entry.value.textContent=entry.attribute?'"'+value+'"':value;}
  function updateFooter(){const count=$('manualFilled'),status=$('manualStatus');if(count)count.textContent=filledCount;if(status)status.textContent=data().confirmed?'Preenchimento confirmado':'Confirme para validar e salvar';}
  function render(){formFields.clear();if(!data().templateXml){$('inputPanel').innerHTML='<div class="empty"><h2>Comece pelo modelo XML</h2><p>Importe ou cole um XML. Sua estrutura será preservada e os valores ficarão vazios para preencher.</p>'+o.loadXmlButton('manual-model')+'</div>';$('outputPanel').innerHTML='<div class="empty">A prévia do XML preenchido aparecerá aqui.</div>';return;}
   const m=model(),read=calculator(true);let last='';
   const fields=m.fields.filter(f=>recordIndex(f.key)===null||recordIndex(f.key)===activeRecord).map((f,i)=>{
    const g=guide(f),parent=X.display(JSON.stringify(JSON.parse(f.key).slice(0,-1))),heading=parent!==last?`<h3 class="manual-group-title">${h(parent||'/')}</h3>`:'';last=parent;
    const calculated=!!formulaFor(f.key),formulaMode=data().entryMode==='formula',open=activeField===f.key;
    return heading+`<div class="manual-field ${calculated?'has-formula':''}"><label for="manual-${i}">${h(f.name)}${g.required?' *':''}</label><div class="manual-value-row"><input id="manual-${i}" data-manual-key="${h(f.key)}" value="${h(read(f.key))}" placeholder="${h(g.example)}" title="${h(g.text)}" aria-describedby="manual-error-${i}" ${formulaMode&&calculated?'readonly':''} autocomplete="off" spellcheck="false">${formulaMode?`<button type="button" class="manual-formula-trigger ${calculated?'configured':''}" data-manual-formula="${h(f.key)}" aria-label="Fórmula de ${h(f.name)}" aria-expanded="${open}">ƒ Fórmula</button>`:''}</div><p class="manual-error" id="manual-error-${i}" role="alert" hidden></p>${open?'<div id="manualFieldEditor" class="manual-field-editor filter-name-editor"></div>':''}</div>`;
   }).join('');
   $('inputPanel').innerHTML=`<div class="pane-head"><div class="pane-title-row"><span class="pane-title">${nameEditor?'Nome do arquivo':'Preencher registro'}</span><div class="pane-actions"><button class="small" data-action="manual-add-record" ${!data().recordGroup||data().recordCount>=500?'disabled':''}>＋ Adicionar registro</button><div class="manual-entry-modes segmented" role="group" aria-label="Preenchimento dos campos"><button class="small ${data().entryMode==='manual'?'active':''}" data-manual-entry-mode="manual" aria-pressed="${data().entryMode==='manual'}">Manual</button><button class="small ${data().entryMode==='formula'?'active':''}" data-manual-entry-mode="formula" aria-pressed="${data().entryMode==='formula'}">Fórmulas</button></div></div></div><div class="pane-subtitle"><span class="hint">Cabeçalho compartilhado · uma página por registro</span></div></div><div class="code-scroll manual-form" id="inputCode">${nameEditor?'<div id="manualNameEditor" class="filter-name-editor"></div>':fields}</div>${RecordPagination.footer(activeRecord,data().recordCount,'manual')}`;$('outputPanel').innerHTML=`<div class="pane-head"><span class="pane-title">XML de entrada · preenchimento manual</span><p class="hint">Prévia do registro ${activeRecord+1} de ${data().recordCount}. A exportação inclui todos os registros adicionados, sem os marcadores.</p></div><div class="code-scroll" id="outputCode"></div>${RecordPagination.footer(activeRecord,data().recordCount,'manual-output')}`;for(const field of $('inputCode').querySelectorAll('[data-manual-key]'))formFields.set(field.dataset.manualKey,field);preview();}
  function footer(){o.presentation?.();const read=data().templateXml?calculator(true):null;filledCount=read?model().fields.reduce((count,f)=>count+Number(!!read(f.key)),0):0;$('bottomBar').innerHTML=`<span class="hint"><b id="manualFilled">${filledCount}</b> de ${data().templateXml?model().fields.length:0} campos preenchidos · <span id="manualStatus">${data().confirmed?'Preenchimento confirmado':'Confirme para validar e salvar'}</span></span><button class="primary" data-action="manual-export" ${data().templateXml?'':'disabled'}><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>Exportar XML de entrada</button>`;}
  function editModel(){o.loadXml('manual');}
  function install(xml){X.parse(xml);o.remember();state.draft.manual={templateXml:xml,values:{},confirmed:false,fileName:data()?.fileName||'',filename:E.clone(data().filename),formulas:{},generated:{},entryMode:data().entryMode,recordCount:1,recordGroup:chooseGroup(X.parse(xml),state.draft.inputGroup)};owner=data();activeRecord=0;nameEditor=false;activeField=null;nameCache.clear();draftValues.clear();cachedTemplate=null;o.changed();o.render();}
  function input(target){
   if(!target.dataset.manualKey)return false;
   const key=target.dataset.manualKey,previous=data().values[key]??data().generated[key]?.value??'';
   delete data().formulas[key];delete data().generated[key];data().values[key]=target.value;data().confirmed=false;
   filledCount+=Number(!!target.value)-Number(!!previous);
   const f=model().byKey.get(key),error=f&&errorFor(f),errorNode=target.closest('.manual-field').querySelector('.manual-error');
   target.setAttribute('aria-invalid',error?'true':'false');if(errorNode){AppAlerts.render(errorNode,error||'',{type:'error',title:'Revise este campo'});}
   updateValue(key);updateFooter();if(nameTimer)clearTimeout(nameTimer);nameTimer=setTimeout(updateName,150);formulaChanged();o.edited();return true;
  }
  function focusField(key){if(!closeField())return;if(nameEditor){nameEditor=false;o.render();}const index=recordIndex(key);if(index!==null&&index!==activeRecord)navigate(index);const input=formFields.get(key);input?.scrollIntoView({block:'center',behavior:'smooth'});input?.focus();}
  async function confirm(){if(state.formulaDirty&&!o.applyName())return false;if(!data().templateXml)return o.notify('Adicione um modelo XML primeiro.','warning');for(const f of model().fields){const message=errorFor(f);if(message){focusField(f.key);o.notify(f.name+': '+message,'error');return false;}}X.parse(X.serialize(build()));evaluateName();data().confirmed=true;o.changed(false);if(!await o.save()){data().confirmed=false;o.changed(false);return false;}o.render();o.notify('Preenchimento confirmado e salvo.','success');return true;}
  async function exportXml(){if(!await confirm())return;const name=evaluateName();const xml=X.serialize(build()),artifact=await o.publish({xml,name});state.draft.fileIndex=artifact.fileIndex;state.draft.revision=artifact.revision;const link=document.createElement('a');link.href=artifact.downloadUrl;link.download=name;document.body.append(link);link.click();link.remove();o.notify('XML de entrada exportado e salvo em Documentos\\MockAíZé.','success');}
  return{nameLabel,fieldEditorKey:()=>activeField,fieldByKey:key=>data().templateXml?model().byKey.get(key):null,previewFormula,applyField,removeFieldFormula,formulaChanged,context,evaluateName,toggleName,nameEditorOpen:()=>nameEditor,document:()=>data().templateXml?build(true):null,ensure,head,render,footer,editModel,install,input,focusField,confirm,exportXml,addRecord,changeGroup,goToRecord:navigate,previous:()=>navigate(activeRecord-1),next:()=>navigate(activeRecord+1)};
 }
 return{create};
})();
