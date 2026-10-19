/* Manual XML entry: values and examples stay separate from the source model. */
globalThis.ManualStudio=(()=>{
 'use strict';
 function create(o){
  const {state,X,E,h}=o,$=id=>document.getElementById(id);let cachedTemplate=null,cachedGroup=null,cachedCount=0,cached=null,owner=null,activeRecord=0,previewFields=new Map(),formFields=new Map(),filledCount=0;
  const data=()=>state.draft.manual;
  function chooseGroup(doc,preferred=''){
   const node=preferred&&X.resolve(doc,preferred);
   if(node?.nodeType===1&&node!==doc.documentElement&&node.children.length)return X.key(X.records(doc,preferred)[0]);
   const groups=X.groups(doc).filter(g=>{const n=X.resolve(doc,g.key);return n!==doc.documentElement&&n.children.length;});
   return groups.find(g=>g.count>1)?.key||groups.find(g=>!/cabecalho|header|^bcarq$/i.test(g.name)&&Array.from(X.resolve(doc,g.key).children).some(child=>!child.children.length))?.key||groups[0]?.key||'';
  }
  function ensure(xml){
   state.draft.manual??={templateXml:'',values:{},confirmed:false,fileName:'',recordCount:1,recordGroup:''};
   const manual=data();manual.recordCount??=1;manual.recordGroup??='';
   if(!manual.templateXml&&xml){manual.templateXml=xml;manual.values={};manual.confirmed=false;manual.recordCount=1;}
   if(manual.templateXml&&!manual.recordGroup)manual.recordGroup=chooseGroup(X.parse(manual.templateXml),state.draft.inputGroup);
   if(owner!==manual){owner=manual;activeRecord=0;}
  }
  function model(){
   const {templateXml,recordGroup,recordCount}=data();
   if(templateXml!==cachedTemplate||recordGroup!==cachedGroup||recordCount!==cachedCount){
    const source=X.parse(templateXml),doc=X.project(source,recordGroup),record=recordGroup&&X.resolve(doc,recordGroup);
    if(record){let last=record;for(let i=1;i<recordCount;i++){const copy=record.cloneNode(true);last.after(copy);last=copy;}}
    const fields=X.fields(doc);
    cached={doc,fields,groups:X.groups(source).filter(g=>{const n=X.resolve(source,g.key);return n!==source.documentElement&&n.children.length;}),byKey:new Map(fields.map(f=>[f.key,f])),byNode:new WeakMap(fields.map(f=>[f.node,f]))};
    cachedTemplate=templateXml;cachedGroup=recordGroup;cachedCount=recordCount;
   }
   activeRecord=Math.max(0,Math.min(activeRecord,recordCount-1));return cached;
  }
  function recordIndex(key){
   if(!data().recordGroup)return null;
   const path=JSON.parse(key),group=JSON.parse(data().recordGroup);
   return path.length>=group.length&&group.every((p,i)=>p.name===path[i].name&&p.ns===path[i].ns&&(i===group.length-1||p.index===path[i].index))?path[group.length-1].index-1:null;
  }
  function previewKey(key){if(recordIndex(key)===null)return key;const path=JSON.parse(key),depth=JSON.parse(data().recordGroup).length;path[depth-1].index=activeRecord+1;return JSON.stringify(path);}
  function navigate(index){activeRecord=Math.max(0,Math.min(index,data().recordCount-1));state.resetScroll=true;o.render();}
  function addRecord(){
   if(!data().recordGroup)return o.notify('Selecione o grupo que representa um registro.');
   if(data().recordCount>=500)return o.notify('O limite é de 500 registros por XML.');
   o.remember();activeRecord=data().recordCount;data().recordCount++;data().confirmed=false;
   // A new page starts blank, including when loading a model saved by older versions.
   for(const f of model().fields)if(recordIndex(f.key)===activeRecord)delete data().values[f.key];
   o.changed(false);state.resetScroll=true;o.render();
  }
  function changeGroup(group){
   if(group===data().recordGroup)return;
   o.remember();data().recordGroup=group;data().recordCount=1;data().confirmed=false;activeRecord=0;o.changed(false);o.render();
  }
  function put(node,value){if(node.nodeType===2){node.value=value;return;}const text=Array.from(node.childNodes).filter(n=>[3,4].includes(n.nodeType));if(text.length){const first=text[0];if(first.nodeType===4&&value.includes(']]>'))first.replaceWith(node.ownerDocument.createTextNode(value));else first.data=value;for(const extra of text.slice(1))extra.remove();}else node.insertBefore(node.ownerDocument.createTextNode(value),node.firstChild);}
  function build(placeholders=false){
   const m=model(),doc=m.doc.cloneNode(true);
   const valueFor=f=>{const value=data().values[f.key]??'';return placeholders&&!value?'['+f.name+']':value;};
   // Walk corresponding nodes once instead of resolving every path from the root.
   function fill(source,target){
    const field=m.byNode.get(source);if(field)put(target,valueFor(field));
    for(const attr of Array.from(source.attributes)){const f=m.byNode.get(attr);if(f)put(target.getAttributeNodeNS(attr.namespaceURI,attr.localName),valueFor(f));}
    const sourceChildren=source.children,targetChildren=target.children;
    for(let i=0;i<sourceChildren.length;i++)fill(sourceChildren[i],targetChildren[i]);
   }
   fill(m.doc.documentElement,doc.documentElement);return doc;
  }
  function ruleFor(f){const rule=state.draft.rulesByMode.new||{};if(rule[f.key])return rule[f.key];try{const path=JSON.parse(f.key),group=JSON.parse(data().recordGroup||state.draft.inputGroup);if(group.length<=path.length&&group.every((p,i)=>p.name===path[i].name&&p.ns===path[i].ns)){path[group.length-1].index=1;return rule[JSON.stringify(path)]||{};}}catch{}return {};}
  function guide(f){const rule=ruleFor(f),g=rule.generator||{},sample=String(f.value||''),name=f.name.toLowerCase();let mask='';if(g.type==='date')try{mask=E.dateMask(g);}catch{}
   if(!mask){const patterns=[[/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,"yyyy-MM-dd'T'HH:mm:ss"],[/^\d{4}-\d{2}-\d{2}$/,'yyyy-MM-dd'],[/^\d{2}\/\d{2}\/\d{4}$/,'dd/MM/yyyy'],[/^\d{2}:\d{2}:\d{2}$/,'HH:mm:ss']];mask=patterns.find(([re])=>re.test(sample))?.[1]||'';}
   let kind='text',text='Texto livre conforme o leiaute do XML.';
   if(g.type==='cpf'||name.includes('cpf')){kind='cpf';text='CPF válido, com 11 dígitos ou máscara 000.000.000-00.';}
   else if(g.type==='cnpj'||name.includes('cnpj')){kind='cnpj';text='CNPJ válido, numérico ou alfanumérico, com 14 caracteres; máscara permitida.';}
   else if(mask){kind='date';text='Formato: '+mask+'.';}
   else if(/mes.*ano|mesanoref/.test(name)&&/^\d{6}$/.test(sample)){kind='monthyear';text='Mês e ano: MMaaaa, sem separador (ex.: 092026).';}
   else if(/^uf/.test(name)){kind='uf';text='UF: duas letras maiúsculas (ex.: PE).';}
   else if(g.type==='random'||/^[+-]?\d+(?:\.\d+)?$/.test(sample)){kind=sample.includes('.')||g.decimals>0?'decimal':'integer';text=kind==='decimal'?'Número decimal com ponto (ex.: '+(sample||'1250.00')+').':'Somente dígitos'+(/ctrl|ispb|codigo/.test(name)?'; preserve os '+sample.length+' caracteres do modelo.':'.');}
   const length=rule.exactLength??((/ctrl|ispb|codigo/.test(name)&&/^\d+$/.test(sample))?sample.length:null);
   if(length)text+=' Tamanho exato: '+length+' caracteres.';
   const required=state.draft.presenceByMode.new?.[f.key]?.requirement==='required';
   return {kind,text,mask,length,required,example:sample,g};
  }
  function dateValid(value,mask){const tokens=[],escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const regex=mask.replace(/'([^']*)'|yyyy|fff|zzz|yy|MM|dd|HH|mm|ss|./g,(token,literal)=>{if(literal!==undefined)return escape(literal);if(['yyyy','yy','MM','dd','HH','mm','ss','fff','zzz'].includes(token)){tokens.push(token);return token==='zzz'?'([+-]\\d{2}:\\d{2})':'(\\d{'+(token==='yyyy'?4:token==='fff'?3:2)+'})';}return escape(token);});const match=value.match(new RegExp('^'+regex+'$'));if(!match)return false;const parts=Object.fromEntries(tokens.map((t,i)=>[t,match[i+1]]));for(const [key,min,max] of [['MM',1,12],['dd',1,31],['HH',0,23],['mm',0,59],['ss',0,59]])if(parts[key]!==undefined&&(Number(parts[key])<min||Number(parts[key])>max))return false;if(parts.MM&&parts.dd&&(parts.yyyy||parts.yy)){const year=Number(parts.yyyy||'20'+parts.yy),date=new Date(Date.UTC(year,Number(parts.MM)-1,Number(parts.dd)));if(date.getUTCMonth()!==Number(parts.MM)-1||date.getUTCDate()!==Number(parts.dd))return false;}return true;}
  function errorFor(f){const value=data().values[f.key]??'',g=guide(f);if(!value)return g.required?'Preencha este campo obrigatório.':'';if(g.length&&Array.from(value).length!==Number(g.length))return 'Informe exatamente '+g.length+' caracteres.';if(g.kind==='cpf'&&!E.validCPF(value))return 'CPF inválido: confira os dígitos verificadores.';if(g.kind==='cnpj'&&!E.validCNPJ(value))return 'CNPJ inválido: confira os caracteres e dígitos verificadores.';if(g.kind==='date'&&!dateValid(value,g.mask))return 'Use uma data/hora válida no formato '+g.mask+'.';if(g.kind==='monthyear'&&(!/^\d{6}$/.test(value)||Number(value.slice(0,2))<1||Number(value.slice(0,2))>12))return 'Use MMaaaa com um mês de 01 a 12.';if(g.kind==='uf'&&!Object.hasOwn(E.locations,value))return 'Informe uma UF válida, em maiúsculas.';if(g.kind==='integer'&&!/^\d+$/.test(value))return 'Use somente dígitos.';if(g.kind==='decimal'&&!/^[+-]?\d+(?:\.\d+)?$/.test(value))return 'Use um número decimal com ponto.';return '';}
  function controls(){return `<div class="segmented"><button data-mode="return">Retorno</button><button data-mode="new">Novos registros</button><button data-mode="manual" class="active">Manual</button></div>`;}
  function head(){const count=data().templateXml?model().fields.length:0;$('pageHead').innerHTML=`<div class="heading-row"><div><h1>${h(state.draft.name)}</h1><p class="subline">Preenchimento manual · cabeçalho e registros · prévia em tempo real</p></div></div><div class="manual-head-controls"><div><label>Operação</label>${controls()}</div><label class="manual-filename">Nome do XML<input id="manualFilename" value="${h(data().fileName||state.draft.name+'_manual.xml')}" aria-label="Nome do XML manual"></label><button data-action="manual-confirm" class="primary">Confirmar preenchimento</button></div>`;$('editorToolbar').innerHTML=`<button class="small" data-action="manual-model">Colar / editar modelo</button><button class="small" data-action="manual-import">Importar XML</button>${data().templateXml?`<label class="manual-record-group" for="manualRecordGroup">Grupo do registro<select id="manualRecordGroup">${model().groups.map(g=>`<option value="${h(g.key)}" ${g.key===data().recordGroup?'selected':''}>${h(g.display)}</option>`).join('')}</select></label>`:''}<span class="hint">${data().recordCount} registro(s) · ${count} campo(s) no arquivo</span>`;}
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
  function updateValue(key){const entry=previewFields.get(key),field=model().byKey.get(key);if(!entry||!field)return;const value=data().values[key]||'['+field.name+']';entry.value.textContent=entry.attribute?'"'+value+'"':value;}
  function updateFooter(){const count=$('manualFilled'),status=$('manualStatus');if(count)count.textContent=filledCount;if(status)status.textContent=data().confirmed?'Preenchimento confirmado':'Confirme para validar e salvar';}
  function render(){formFields.clear();if(!data().templateXml){$('inputPanel').innerHTML='<div class="empty"><h2>Comece pelo modelo XML</h2><p>Importe ou cole um XML. Sua estrutura será preservada e os valores ficarão vazios para preencher.</p><button data-action="manual-model">Adicionar modelo</button></div>';$('outputPanel').innerHTML='<div class="empty">A prévia do XML preenchido aparecerá aqui.</div>';return;}
   const m=model();let last='';const fields=m.fields.filter(f=>recordIndex(f.key)===null||recordIndex(f.key)===activeRecord).map((f,i)=>{const g=guide(f),parent=X.display(JSON.stringify(JSON.parse(f.key).slice(0,-1))),heading=parent!==last?`<h3 class="manual-group-title">${h(parent||'/')}</h3>`:'';last=parent;return heading+`<div class="manual-field"><label for="manual-${i}">${h(f.name)}${g.required?' *':''}</label><input id="manual-${i}" data-manual-key="${h(f.key)}" value="${h(data().values[f.key]||'')}" aria-describedby="manual-guide-${i} manual-error-${i}" autocomplete="off" spellcheck="false"><p class="hint" id="manual-guide-${i}">${h(g.text)}${g.example&&g.kind==='text'?' Exemplo do modelo: '+h(g.example):''}</p><p class="manual-error" id="manual-error-${i}" role="alert" hidden></p></div>`;}).join('');
   $('inputPanel').innerHTML=`<div class="pane-head"><div class="pane-title-row"><span class="pane-title">Preencher registro</span><button class="small" data-action="manual-add-record" ${!data().recordGroup||data().recordCount>=500?'disabled':''}>＋ Adicionar registro</button></div><div class="pane-subtitle"><span class="hint">Cabeçalho compartilhado · uma página por registro</span><span class="record-pager"><button data-action="manual-prev-record" ${activeRecord===0?'disabled':''} aria-label="Registro manual anterior">‹</button>Registro ${activeRecord+1} de ${data().recordCount}<button data-action="manual-next-record" ${activeRecord+1>=data().recordCount?'disabled':''} aria-label="Próximo registro manual">›</button></span></div></div><div class="code-scroll manual-form" id="inputCode">${fields}</div>`;$('outputPanel').innerHTML=`<div class="pane-head"><span class="pane-title">XML de entrada · preenchimento manual</span><p class="hint">Prévia do registro ${activeRecord+1} de ${data().recordCount}. A exportação inclui todos os registros adicionados, sem os marcadores.</p></div><div class="code-scroll" id="outputCode"></div>`;for(const field of $('inputCode').querySelectorAll('[data-manual-key]'))formFields.set(field.dataset.manualKey,field);preview();}
  function footer(){filledCount=data().templateXml?model().fields.reduce((count,f)=>count+Number(!!data().values[f.key]),0):0;$('bottomBar').innerHTML=`<span class="hint"><b id="manualFilled">${filledCount}</b> de ${data().templateXml?model().fields.length:0} campos preenchidos · <span id="manualStatus">${data().confirmed?'Preenchimento confirmado':'Confirme para validar e salvar'}</span></span><button class="primary" data-action="manual-export" ${data().templateXml?'':'disabled'}>Exportar XML de entrada</button>`;}
  function editModel(){o.openModal('Modelo para preenchimento manual','O primeiro registro fornece a estrutura. O preenchimento começa com uma página; adicione outras quando precisar. Ao trocar o modelo, os campos são reiniciados.',`<label for="manualRawXml">XML completo</label><textarea class="xml-editor" id="manualRawXml" spellcheck="false">${h(data().templateXml||o.inputText())}</textarea>`,[{text:'Cancelar',run:o.closeModal},{text:'Usar modelo',primary:true,run:()=>{install($('manualRawXml').value);o.closeModal();}}],true);}
  function install(xml){X.parse(xml);o.remember();state.draft.manual={templateXml:xml,values:{},confirmed:false,fileName:data()?.fileName||'',recordCount:1,recordGroup:chooseGroup(X.parse(xml),state.draft.inputGroup)};owner=data();activeRecord=0;cachedTemplate=null;o.changed();o.render();}
  function input(target){
   if(target.id==='manualFilename'){data().fileName=target.value;data().confirmed=false;updateFooter();o.edited();return true;}
   if(!target.dataset.manualKey)return false;
   const key=target.dataset.manualKey,previous=data().values[key]||'';
   data().values[key]=target.value;data().confirmed=false;
   filledCount+=Number(!!target.value)-Number(!!previous);
   const f=model().byKey.get(key),error=f&&errorFor(f),errorNode=target.parentElement.querySelector('.manual-error');
   target.setAttribute('aria-invalid',error?'true':'false');if(errorNode){errorNode.hidden=!error;errorNode.textContent=error;}
   updateValue(key);updateFooter();o.edited();return true;
  }
  function focusField(key){const index=recordIndex(key);if(index!==null&&index!==activeRecord)navigate(index);const input=formFields.get(key);input?.scrollIntoView({block:'center',behavior:'smooth'});input?.focus();}
  async function confirm(){if(!data().templateXml)return o.notify('Adicione um modelo XML primeiro.');for(const f of model().fields){const message=errorFor(f);if(message){focusField(f.key);o.notify(f.name+': '+message);return false;}}X.parse(X.serialize(build()));data().confirmed=true;o.changed(false);if(!await o.save()){data().confirmed=false;o.changed(false);return false;}o.render();o.notify('Preenchimento confirmado e salvo.');return true;}
  async function exportXml(){const name=E.filename(data().fileName||state.draft.name+'_manual.xml');if(!await confirm())return;const xml=X.serialize(build()),artifact=await o.publish({xml,name});state.draft.fileIndex=artifact.fileIndex;state.draft.revision=artifact.revision;const link=document.createElement('a');link.href=artifact.downloadUrl;link.download=name;document.body.append(link);link.click();link.remove();o.notify('XML de entrada exportado e salvo em Documentos\\MockAíZé.');}
  return{ensure,head,render,footer,editModel,install,input,focusField,confirm,exportXml,addRecord,changeGroup,previous:()=>navigate(activeRecord-1),next:()=>navigate(activeRecord+1)};
 }
 return{create};
})();
