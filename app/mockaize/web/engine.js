/* Mock Studio: generators and filename rules. No dynamic code evaluation. */
globalThis.MockEngine = (() => {
  'use strict';
  const ALPHA='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const LOCATIONS={AC:'Rio Branco',AL:'Maceió',AP:'Macapá',AM:'Manaus',BA:'Salvador',CE:'Fortaleza',DF:'Brasília',ES:'Vitória',GO:'Goiânia',MA:'São Luís',MT:'Cuiabá',MS:'Campo Grande',MG:'Belo Horizonte',PA:'Belém',PB:'João Pessoa',PR:'Curitiba',PE:'Recife',PI:'Teresina',RJ:'Rio de Janeiro',RN:'Natal',RS:'Porto Alegre',RO:'Porto Velho',RR:'Boa Vista',SC:'Florianópolis',SP:'São Paulo',SE:'Aracaju',TO:'Palmas'};
  function integer(value,min,max,label){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw Error(`${label}: informe um inteiro entre ${min} e ${max}.`);return n;}
  function number(value,label){if(value===''||!Number.isFinite(Number(value)))throw Error(`${label}: informe um valor numérico.`);return Number(value);}
  function randomInt(min,max){const range=max-min+1;if(range<1||range>4294967296)throw Error('Intervalo aleatório muito grande.');const buffer=new Uint32Array(1);const limit=Math.floor(4294967296/range)*range;do{crypto.getRandomValues(buffer);}while(buffer[0]>=limit);return min+buffer[0]%range;}
  function chars(size,alphabet){const allowed=Array.from(alphabet||'');if(!allowed.length)throw Error('Informe os caracteres permitidos.');return Array.from({length:size},()=>allowed[randomInt(0,allowed.length-1)]).join('');}
  function cnpjDigits(base){if(!/^[A-Z0-9]{12}$/.test(base))throw Error('A base do CNPJ precisa ter 12 caracteres A–Z ou 0–9.');const calc=s=>{const weights=s.length===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];const sum=[...s].reduce((total,c,i)=>total+(c.charCodeAt(0)-48)*weights[i],0);const mod=sum%11;return mod<2?'0':String(11-mod);};const first=calc(base);return first+calc(base+first);}
  function cpf(mask){let base=chars(9,'0123456789');if(/^(\d)\1+$/.test(base))base=base.slice(0,8)+(base[0]==='0'?'1':'0');const digit=s=>{const sum=[...s].reduce((n,c,i)=>n+Number(c)*(s.length+1-i),0);const d=(sum*10)%11;return d===10?'0':String(d);};const first=base+digit(base);const result=first+digit(first);return mask?result.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):result;}
  function cnpj(f){
    const establishment=String(f.establishment??'0001').toUpperCase();
    const valid=f.mode==='A'?/^[A-Z0-9]{4}$/:/^\d{4}$/;
    if(!valid.test(establishment)||establishment==='0000')throw Error('Estabelecimento: informe 4 caracteres válidos, diferentes de 0000. Use 0001 para matriz.');
    let root;do{root=chars(8,f.mode==='A'?ALPHA:'0123456789');}while(/^(\d)\1+$/.test(root));
    const base=root+establishment,result=base+cnpjDigits(base);
    return f.mask?result.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/,'$1.$2.$3/$4-$5'):result;
  }
  function validCPF(value){
    const text=String(value);if(!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(text))return false;
    const digits=text.replace(/[.-]/g,'');if(/^(\d)\1+$/.test(digits))return false;
    for(let size=9;size<=10;size++){let sum=0;for(let i=0;i<size;i++)sum+=Number(digits[i])*(size+1-i);const remainder=sum%11;const dv=remainder<2?0:11-remainder;if(Number(digits[size])!==dv)return false;}
    return true;
  }
  function validCNPJ(value){
    const text=String(value).toUpperCase();if(!/^(?:[A-Z0-9]{12}\d{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2})$/.test(text))return false;
    const digits=text.replace(/[./-]/g,'');return !/^(\d)\1+$/.test(digits)&&digits.slice(-2)===cnpjDigits(digits.slice(0,12));
  }
  function checkLength(value,exactLength){
    const text=String(value);if(exactLength==null||exactLength==='')return text;
    const expected=integer(exactLength,1,4096,'Quantidade de caracteres'),actual=Array.from(text).length;
    if(actual!==expected)throw Error(`O valor tem ${actual} caracteres; o campo exige exatamente ${expected}. Ajuste a fórmula ou o tamanho do campo.`);
    return text;
  }
  function listValues(values){const items=(Array.isArray(values)?values:String(values??'').split(/\r?\n/)).map(v=>String(v).trim()).filter(Boolean);if(!items.length)throw Error('Lista: informe ao menos um valor, um por linha.');if(items.length>1000)throw Error('A lista aceita até 1.000 valores.');return items;}
  const pick=values=>values[randomInt(0,values.length-1)];
  const slug=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'');
  function cachedProfile(f,c,kind,make){const cache=c.profiles;const key=JSON.stringify([kind,f.group||'principal',f.state||'any']);if(!cache)return make();if(!cache.has(key))cache.set(key,make());return cache.get(key);}
  function personProfile(){const firstName=pick(['Ana','Marina','Clara','Beatriz','Camila','Luana','Helena','Sofia','Pedro','Lucas','Rafael','Bruno','Thiago','André','Mateus','Daniel']);const lastName=pick(['Almeida','Barbosa','Carvalho','Costa','Ferreira','Lima','Martins','Oliveira','Pereira','Ribeiro','Santos','Souza']);const name=firstName+' '+lastName;return{name,firstName,lastName,email:slug(name)+randomInt(10,9999)+'@example.test'};}
  function companyProfile(){const tradeName=pick(['Aurora','Horizonte','Ipê','Solar','Atlântica','Nascente','Vereda','Candeia','Brisa','Cedro'])+' '+pick(['Tecnologia','Serviços','Comércio','Logística','Alimentos','Soluções','Engenharia','Consultoria']);return{tradeName,legalName:tradeName+' LTDA',email:'contato.'+slug(tradeName)+randomInt(10,9999)+'@example.test'};}
  function addressProfile(f){const state=f.state&&f.state!=='any'?f.state:pick(Object.keys(LOCATIONS));if(!Object.hasOwn(LOCATIONS,state))throw Error('Selecione uma UF válida.');const street=pick(['Rua','Avenida','Travessa'])+' '+pick(['dos Ipês','das Acácias','do Horizonte','das Palmeiras','da Nascente','do Sol','das Flores','da Serra']);const number=String(randomInt(1,2500)),district=pick(['Centro','Jardim Primavera','Vila Nova','Boa Vista','Parque das Flores','Alto da Serra']);const zip=chars(5,'0123456789')+'-'+chars(3,'0123456789');const city=LOCATIONS[state];return{street,number,district,city,state,zip,full:`${street}, ${number} - ${district}, ${city}/${state}, ${zip}`};}
  function profileValue(f,c,kind,make,fallback){const profile=cachedProfile(f,c,kind,make);const field=f.field||fallback;if(!Object.hasOwn(profile,field))throw Error('Escolha um dado válido para o perfil.');return profile[field];}
  function parseDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Informe uma data no formato AAAA-MM-DD.');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error('Data inválida.');return d;}
  function dateCustomDefaults(){return{day:true,month:true,year:true,hour:true,minute:true,second:true,order:'DMY',yearDigits:'4',dateSeparator:'/',timeSeparator:':',join:' ',milliseconds:false,timezone:false,zone:'app'};}
  function dateMask(f){
    if(f.format!=='custom')return f.format||'yyyy-MM-dd';
    const v={...dateCustomDefaults(),...f.custom},names={D:'day',M:'month',Y:'year'},tokens={D:'dd',M:'MM',Y:v.yearDigits==='2'?'yy':'yyyy'};
    const date=[...(v.order||'DMY')].filter(k=>v[names[k]]).map(k=>tokens[k]).join(v.dateSeparator);
    let time=['hour','minute','second'].filter(k=>v[k]).map(k=>({hour:'HH',minute:'mm',second:'ss'})[k]).join(v.timeSeparator);
    if(v.second&&v.milliseconds)time+='.fff';
    if(!date&&!time)throw Error('Selecione pelo menos um componente.');
    return date+(date&&time?(v.join==='T'?"'T'":v.join):'')+time+(time&&v.timezone?(v.zone==='utc'?"'Z'":'zzz'):'');
  }
  function zonedParts(date,zone){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
  function zoneOffset(date,zone){const p=zonedParts(date,zone);return Math.round((Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-Math.floor(date.getTime()/1000)*1000)/60000);}
  function formatDate(date,format,zone='UTC'){
    const p=zonedParts(date,zone),offset=zoneOffset(date,zone),abs=Math.abs(offset);
    const tokens={yyyy:p.year,yy:p.year.slice(-2),MM:p.month,dd:p.day,HH:p.hour,mm:p.minute,ss:p.second,fff:String(date.getUTCMilliseconds()).padStart(3,'0'),zzz:(offset<0?'-':'+')+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0')};
    return(format||'yyyy-MM-dd').replace(/'([^']*)'|yyyy|fff|zzz|yy|MM|dd|HH|mm|ss/g,(token,literal)=>literal!==undefined?literal:tokens[token]);
  }
  function dateValue(f,c){
    const zone=c.timeZone||'America/Fortaleza',reference=new Date(c.referenceDateTime||Date.now());
    if(!Number.isFinite(reference.getTime()))throw Error('Referência de data e hora inválida.');
    const d=parseDate(f.mode==='specific'?f.value:c.baseDate);
    if(f.mode==='offset')d.setUTCDate(d.getUTCDate()+integer(f.days??5,-36500,36500,'Dias'));
    if(f.mode==='business'){const holidays=new Set(String(f.holidays||'').split(/[\s,;]+/).filter(Boolean));let tries=0;do{d.setUTCDate(d.getUTCDate()+1);if(++tries>3700)throw Error('Não foi encontrado dia útil no calendário informado.');}while([0,6].includes(d.getUTCDay())||holidays.has(d.toISOString().slice(0,10)));}
    const p=zonedParts(reference,zone),wall=Date.parse(d.toISOString().slice(0,10)+'T'+p.hour+':'+p.minute+':'+p.second+'.'+String(reference.getUTCMilliseconds()).padStart(3,'0')+'Z');
    let instant=new Date(wall);for(let i=0;i<3;i++)instant=new Date(wall-zoneOffset(instant,zone)*60000);
    const custom={...dateCustomDefaults(),...f.custom};
    return formatDate(instant,dateMask(f),f.format==='custom'&&custom.timezone&&custom.zone==='utc'?'UTC':zone);
  }
  function sequence(f,c){const start=integer(f.start??1,0,999999999,'Início');const step=integer(f.step??1,1,999999999,'Passo');const width=integer(f.width??4,1,30,'Largura');const index=f.scope==='file'?(c.fileIndex||0):(c.recordIndex||0);const n=start+step*index;if(!Number.isSafeInteger(n))throw Error('Sequencial excede o limite seguro.');return String(n).padStart(width,'0');}
  function sumDecimals(values){const parsed=values.map(value=>{const text=String(value).trim();if(text.length>64||!/^[-+]?\d+(?:\.\d+)?$/.test(text))throw Error('A soma exige um valor numérico decimal em cada parte.');const precision=(text.split('.')[1]||'').length;if(precision>12)throw Error('A soma aceita até 12 casas decimais.');return{text,precision};});const precision=Math.max(0,...parsed.map(p=>p.precision));const total=parsed.reduce((sum,p)=>sum+BigInt(p.text.replace('.',''))*(10n**BigInt(precision-p.precision)),0n);const negative=total<0n;const digits=(negative?-total:total).toString().padStart(precision+1,'0');if(!precision)return(negative?'-':'')+digits;const fraction=digits.slice(-precision).replace(/0+$/,'');return(negative?'-':'')+digits.slice(0,-precision)+(fraction?'.'+fraction:'');}
  const generators={
    literal:f=>String(f.value??''),
    copy:(f,c)=>c.sourceValue(f.path),
    field:(f,c)=>(f.source==='input'?c.sourceValue:c.outputValue)(f.path),
    groupSum:(f,c)=>sumDecimals(c.groupValues(f)),
    config:(_,c)=>String(c.configName||'mock').replace(/\s+/g,''),
    count:(_,c)=>String(c.count||1),
    cpf:f=>cpf(f.mask), cnpj,
    list:f=>{const values=listValues(f.values);return f.mode==='random'?pick(values):values[integer(f.index??0,0,values.length-1,'Posição na lista')];},
    hash:f=>chars(integer(f.length??32,1,4096,'Quantidade de caracteres'),f.format==='alphanumeric'?'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789':f.format==='HEX'?'0123456789ABCDEF':'0123456789abcdef'),
    person:(f,c)=>profileValue(f,c,'person',personProfile,'name'),
    company:(f,c)=>profileValue(f,c,'company',companyProfile,'legalName'),
    address:(f,c)=>profileValue(f,c,'address',()=>addressProfile(f),'street'),
    zeros:f=>'0'.repeat(integer(f.length??8,1,1000,'Quantidade de zeros')),
    sequence, date:dateValue,
    alpha:f=>chars(integer(f.length??9,1,512,'Comprimento'),f.alphabet||ALPHA),
    random:f=>{const min=number(f.min??0,'Valor mínimo');const max=number(f.max??100,'Valor máximo');const precision=integer(f.decimals??2,0,6,'Casas decimais');if(min>max)throw Error('O mínimo deve ser menor ou igual ao máximo.');const factor=10**precision;const lo=Math.ceil(min*factor),hi=Math.floor(max*factor);if(Math.abs(lo)>1e12||Math.abs(hi)>1e12||hi-lo>4294967295)throw Error('Reduza o intervalo ou as casas decimais.');return(randomInt(lo,hi)/factor).toFixed(precision);},
    id:f=>{if(f.mode!=='common'){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}const prefix=String(f.prefix||'');const length=integer(f.length??12,1,128,'Comprimento total');if(Array.from(prefix).length>length)throw Error('O prefixo é maior que o comprimento total.');return prefix+chars(length-Array.from(prefix).length,ALPHA);},
    compose:(f,c,depth)=>{const values=(f.parts||[]).map(p=>evaluate(p,c,depth+1));if(!values.length)throw Error('Adicione ao menos uma parte à composição.');if(f.operation==='sum')return sumDecimals(values);return values.join(f.separator||'');}
  };
  function evaluate(formula,context,depth=0){if(depth>6)throw Error('A composição excedeu seis níveis.');if(!formula||!Object.hasOwn(generators,formula.type))throw Error('Escolha um gerador válido.');return String(generators[formula.type](formula,context,depth));}
  function filename(value){let name=String(value||'').trim();if(!name)throw Error('O nome do arquivo não pode estar vazio.');if(/[<>:"/\\|?*\u0000-\u001F]/.test(name))throw Error('O nome não pode conter barras ou caracteres < > : " | ? *.');if(/[. ]$/.test(name))throw Error('O nome não pode terminar com ponto ou espaço.');if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('Nome reservado pelo sistema operacional.');if(!/\.xml$/i.test(name))name+='.xml';if(name.length>180)throw Error('O nome deve ter no máximo 180 caracteres.');return name;}
  function defaults(type){const values={literal:{value:''},copy:{path:''},field:{source:'output',path:''},groupSum:{source:'output',group:'',path:'',allRecords:false},cpf:{mask:false},cnpj:{mode:'N',mask:false,establishment:'0001'},list:{values:'Ativo\nInativo',mode:'single',index:0},hash:{length:32,format:'hex'},person:{field:'name',group:'cliente'},company:{field:'legalName',group:'empresa'},address:{field:'street',state:'any',group:'endereco'},date:{mode:'offset',days:5,format:'yyyy-MM-dd',value:'2026-10-17',holidays:''},zeros:{length:8},sequence:{start:1,step:1,width:4,scope:'record'},alpha:{length:9,alphabet:ALPHA},random:{min:100,max:5000,decimals:2},id:{mode:'common',prefix:'CT',length:12},compose:{operation:'concat',separator:'',parts:[{type:'literal',value:'CT'},{type:'sequence',start:1,step:1,width:4}]},config:{},count:{}};return{type,...structuredCopy(values[type]||{})};}
  function structuredCopy(v){return JSON.parse(JSON.stringify(v));}
  return{evaluate,filename,cnpjDigits,validCPF,validCNPJ,checkLength,listValues,locations:LOCATIONS,parseDate,formatDate,dateMask,dateCustomDefaults,defaults,clone:structuredCopy};
})();

globalThis.MockXml=(()=>{
 'use strict';
 const E=MockEngine;
 function parse(xml,{maxBytes=2000000}={}){if(typeof xml!=='string'||!xml.trim())throw Error('Informe o XML.');if(new TextEncoder().encode(xml).length>maxBytes)throw Error(`O XML excede o limite de ${Math.floor(maxBytes/1000000)} MB.`);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DOCTYPE e entidades externas não são aceitos.');const doc=new DOMParser().parseFromString(xml,'application/xml');const error=doc.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml','parsererror')[0]||doc.getElementsByTagNameNS('http://www.w3.org/1999/xhtml','parsererror')[0];if(error)throw Error('XML inválido: '+error.textContent.replace(/\s+/g,' ').slice(0,240));return doc;}
 function siblings(node){return Array.from(node.parentNode?.children||[]).filter(n=>n.localName===node.localName&&n.namespaceURI===node.namespaceURI);}
 function trail(node){if(node.nodeType===2)return[...trail(node.ownerElement),{ns:node.namespaceURI||'',name:node.localName,attribute:true}];const chain=[];for(let n=node;n?.nodeType===1;n=n.parentNode)chain.unshift({ns:n.namespaceURI||'',name:n.localName,index:siblings(n).indexOf(n)+1});return chain;}
 function key(node){return JSON.stringify(trail(node));}
 function display(path){try{return JSON.parse(path).map(p=>'/'+(p.attribute?'@':'')+p.name+(p.index>1?'['+p.index+']':'')).join('');}catch{return path||'';}}
 function resolve(root,path){let parts;try{parts=typeof path==='string'?JSON.parse(path):path;}catch{return null;}let current=root.nodeType===9?root:root.ownerDocument;for(const part of parts){if(part.attribute)return Array.from(current.attributes||[]).find(n=>(n.namespaceURI||'')===part.ns&&n.localName===part.name)||null;const matches=Array.from(current.children||[]).filter(n=>(n.namespaceURI||'')===part.ns&&n.localName===part.name);current=matches[(part.index||1)-1];if(!current)return null;}return current;}
 function fields(doc){const out=[];function walk(node){for(const attr of Array.from(node.attributes||[])){if(attr.namespaceURI==='http://www.w3.org/2000/xmlns/'||attr.name==='xmlns')continue;out.push({key:key(attr),display:display(key(attr)),name:attr.localName,ns:attr.namespaceURI||'',value:attr.value,node:attr});}if(!node.children.length)out.push({key:key(node),display:display(key(node)),name:node.localName,ns:node.namespaceURI||'',value:node.textContent,node});for(const child of node.children)walk(child);}walk(doc.documentElement);return out;}
 function nodes(doc){const out=[];function walk(node){const path=key(node);out.push({key:path,display:display(path),name:node.localName,ns:node.namespaceURI||'',value:node.textContent,isGroup:!!node.children.length,node});for(const attr of Array.from(node.attributes||[])){if(attr.namespaceURI==='http://www.w3.org/2000/xmlns/'||attr.name==='xmlns')continue;const path=key(attr);out.push({key:path,display:display(path),name:attr.localName,ns:attr.namespaceURI||'',value:attr.value,isGroup:false,node:attr});}for(const child of node.children)walk(child);}walk(doc.documentElement);return out;}
 function groups(doc){const out=[];function walk(node){if(siblings(node)[0]===node){out.push({key:key(node),name:node.localName,display:display(key(node)),count:siblings(node).length,depth:trail(node).length});}for(const child of node.children)walk(child);}walk(doc.documentElement);return out.sort((a,b)=>(b.count>1)-(a.count>1)||a.depth-b.depth);}
 function records(doc,path){const node=resolve(doc,path);return node?siblings(node):[];}
 function project(doc,path,index=0){const copy=doc.cloneNode(true);const items=records(copy,path);if(items.length>1){const keep=items[Math.min(index,items.length-1)];for(const item of items)if(item!==keep)item.remove();}return copy;}
 function setValue(node,value){
  const text=String(value);if(node.nodeType===2){node.value=text;return;}
  const characterNodes=Array.from(node.childNodes).filter(child=>child.nodeType===3||child.nodeType===4);
  if(!characterNodes.length){node.insertBefore(node.ownerDocument.createTextNode(text),node.firstChild);return;}
  const first=characterNodes[0];
  if(first.nodeType===4&&text.includes(']]>'))node.replaceChild(node.ownerDocument.createTextNode(text),first);else first.data=text;
  for(const extra of characterNodes.slice(1))extra.remove();
 }
 function groupValues(doc,groupPath,fieldPath,readNode=node=>node.nodeType===2?node.value:node.textContent,single=false){
  const group=JSON.parse(groupPath),field=JSON.parse(fieldPath);
  if(!group.length||field.length<=group.length||!group.every((part,i)=>part.ns===field[i]?.ns&&part.name===field[i]?.name&&(i===group.length-1||part.index===field[i]?.index)))throw Error('Escolha um campo dentro do grupo que será somado.');
  const first=resolve(doc,groupPath);if(!first)return[];
  if(first.nodeType!==1)throw Error('Escolha uma tag de grupo, não um atributo.');
  return (single?[first]:siblings(first)).map(item=>{
   let node=item;
   for(const part of field.slice(group.length)){
    node=part.attribute?Array.from(node.attributes||[]).find(n=>(n.namespaceURI||'')===part.ns&&n.localName===part.name):Array.from(node.children||[]).filter(n=>(n.namespaceURI||'')===part.ns&&n.localName===part.name)[(part.index||1)-1];
    if(!node)throw Error('Campo ausente em uma ocorrência do grupo: '+display(fieldPath));
   }
   return readNode(node);
  });
 }
 function aggregateValues(doc,groupPath,fieldPath,recordPath,allRecords,readNode){
  const group=JSON.parse(groupPath),record=JSON.parse(recordPath);
  const inside=group.length>=record.length&&record.every((part,i)=>part.ns===group[i]?.ns&&part.name===group[i]?.name&&(i===record.length-1||part.index===group[i]?.index));
  if(!inside&&allRecords){
   const field=JSON.parse(fieldPath),fieldInside=field.length>=record.length&&record.every((part,i)=>part.ns===field[i]?.ns&&part.name===field[i]?.name&&(i===record.length-1||part.index===field[i]?.index));
   if(fieldInside){
    if(field.length<=group.length||!group.every((part,i)=>part.ns===field[i]?.ns&&part.name===field[i]?.name&&(i===group.length-1||part.index===field[i]?.index)))throw Error('Escolha um campo dentro do grupo que será somado.');
    return records(doc,recordPath).map((_,index)=>{const node=resolve(doc,reindex(fieldPath,recordPath,index));if(!node)throw Error('Campo ausente em um registro do somatório.');return readNode?readNode(node):node.nodeType===2?node.value:node.textContent;});
   }
  }
  if(!inside)return groupValues(doc,groupPath,fieldPath,readNode);
  if(!allRecords)return groupValues(doc,groupPath,fieldPath,readNode,group.length===record.length);
  if(group.length===record.length)return groupValues(doc,groupPath,fieldPath,readNode);
  return records(doc,recordPath).flatMap((_,index)=>groupValues(doc,reindex(groupPath,recordPath,index),reindex(fieldPath,recordPath,index),readNode));
 }
 function readValue(doc,path,label){const node=resolve(doc,path);if(!node)throw Error(`${label}: campo não encontrado (${display(path)}).`);return node.nodeType===2?node.value:node.textContent;}
 function hasPrefix(parts,prefix){return parts.length>=prefix.length&&prefix.every((p,i)=>JSON.stringify(p)===JSON.stringify(parts[i]));}
 function reindex(path,group,index){if(!group)return path;const parts=JSON.parse(path),prefix=JSON.parse(group);if(hasPrefix(parts,prefix))parts[prefix.length-1].index=index+1;return JSON.stringify(parts);}
 function replaceRecords(doc,path,count){
  const current=records(doc,path);if(!current.length)throw Error('Selecione o grupo que representa um registro.');
  let wrapperPath=null;
  if(current[0]===doc.documentElement){
   if(count===1)return{group:path,wrapperPath};
   const root=current[0],wrapper=doc.createElement('MockRegistros');doc.replaceChild(wrapper,root);wrapper.appendChild(root);wrapperPath=key(wrapper);
  }
  const parent=current[0].parentNode,next=current[current.length-1].nextSibling,template=current[0].cloneNode(true);
  for(const node of current)node.remove();for(let i=0;i<count;i++)parent.insertBefore(template.cloneNode(true),next);
  return{group:key(parent.children[Array.from(parent.children).findIndex(n=>n.localName===template.localName&&n.namespaceURI===template.namespaceURI)]),wrapperPath};
 }
 function outputPath(path,snapshot){if(snapshot.outputPaths&&Object.hasOwn(snapshot.outputPaths,path)){const actual=snapshot.outputPaths[path];if(actual===null)throw Error('Campo omitido nesta geração: '+display(path));return actual;}return snapshot.wrapperPath?JSON.stringify([...JSON.parse(snapshot.wrapperPath),...JSON.parse(path)]):path;}
 function templatePath(path,snapshot,previewIndex=null){
  if(!snapshot)return path;const actual=previewIndex===null?path:reindex(path,snapshot.group,previewIndex);
  let original=snapshot.templatePaths?.[actual];
  if(!original){if(!snapshot.wrapperPath)return path;const parts=JSON.parse(path),prefix=JSON.parse(snapshot.wrapperPath);original=hasPrefix(parts,prefix)&&parts.length>prefix.length?JSON.stringify(parts.slice(prefix.length)):null;}
  if(original&&previewIndex!==null&&snapshot.templateGroup){const parts=JSON.parse(original),group=JSON.parse(snapshot.templateGroup);if(parts.length>=group.length&&group.every((p,i)=>i===group.length-1?p.ns===parts[i].ns&&p.name===parts[i].name:JSON.stringify(p)===JSON.stringify(parts[i]))){parts[group.length-1].index=1;original=JSON.stringify(parts);}}
  return original;
 }
 function indentElement(node,depth){
  const children=Array.from(node.childNodes),xmlWhitespace=/^[\t\n\r ]*$/;
  const preserve=node.getAttributeNS('http://www.w3.org/XML/1998/namespace','space')==='preserve';
  const hasValue=children.some(child=>child.nodeType===4||child.nodeType===3&&!xmlWhitespace.test(child.data));
  if(preserve||hasValue||!children.some(child=>child.nodeType===1))return;
  for(const child of children)if(child.nodeType===1)indentElement(child,depth+1);
  for(const child of children)if(child.nodeType===3&&xmlWhitespace.test(child.data))child.remove();
  for(const child of Array.from(node.childNodes))node.insertBefore(node.ownerDocument.createTextNode('\n'+'  '.repeat(depth+1)),child);
  node.appendChild(node.ownerDocument.createTextNode('\n'+'  '.repeat(depth)));
 }
 function serialize(doc){
  const copy=doc.cloneNode(true);indentElement(copy.documentElement,0);
  const serializer=new XMLSerializer();
  const content=Array.from(copy.childNodes).filter(node=>node.nodeType!==3||!/^[\t\n\r ]*$/.test(node.data)).map(node=>serializer.serializeToString(node)).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+content+'\n';
 }
 function automap(source,target,rules){const a=fields(source),b=fields(target),mapped=[],ambiguous=[];for(const f of b){if(rules[f.key])continue;const candidates=a.filter(s=>s.name===f.name);if(candidates.length===1)mapped.push({target:f.key,source:candidates[0].key});if(candidates.length>1)ambiguous.push({target:f.key,candidates:candidates.map(s=>({key:s.key,display:s.display+(s.ns?' · '+s.ns:''),value:s.value}))});}return{mapped,ambiguous};}
 function connected(doc,node){return !!node&&doc.contains(node.nodeType===2?node.ownerElement:node);}
 function removeNode(node){if(node.nodeType===2)node.ownerElement.removeAttributeNode(node);else node.remove();}
 function omitForRecord(policy,index){return policy.requirement==='optional'&&(policy.include===false||policy.distribution==='alternate'&&index%2===1);}
 function* generationSteps(config,inputXml){
  const source=parse(inputXml||config.sourceTemplate),template=config.mode==='new'?parse(inputXml||config.sourceTemplate):parse(config.outputTemplate);
  const outGroup=config.mode==='new'?config.inputGroup:config.outputGroup,requested=Number(config.count);
  if(!config.inputGroup||!outGroup)throw Error('Selecione os grupos de entrada e saída antes de gerar.');
  if(!Number.isInteger(requested)||requested<1||requested>500)throw Error('Quantidade: informe de 1 a 500 registros.');
  const available=records(source,config.inputGroup).length||1,fullCount=config.mode==='return'?available:requested;
  const count=config.previewOnly?1:fullCount,formulaCount=config.previewContextCount??fullCount;
  if(count>500)throw Error('O retorno excede 500 registros. Reduza a amostra.');
  const initialRecords=records(template,outGroup);if(!initialRecords.length)throw Error('Selecione o grupo que representa um registro.');
  const headerPaths=config.headersByMode?.[config.mode]||[];
  for(const path of headerPaths){
   const header=resolve(template,path);
   if(!header||header.nodeType!==1)throw Error('Cabeçalho não encontrado: '+display(path));
   const groupParts=JSON.parse(outGroup),headerParts=JSON.parse(path);
   if(hasPrefix(headerParts,groupParts)||hasPrefix(groupParts,headerParts))throw Error('O cabeçalho deve ficar fora da unidade repetida. Escolha a tag de cada registro em “Unidade do registro”, mantendo '+display(path)+' como cabeçalho único.');
   if(records(template,path).length!==1)throw Error('O modelo contém mais de uma ocorrência do cabeçalho '+display(path)+'. Mantenha uma única ocorrência no modelo.');
  }
  const serializer=new XMLSerializer(),documentBytes=new TextEncoder().encode(serialize(template)).length;
  const existingRecordBytes=initialRecords.reduce((total,node)=>total+new TextEncoder().encode(serializer.serializeToString(node)).length,0);
  const oneRecordBytes=new TextEncoder().encode(serializer.serializeToString(initialRecords[0])).length;
  const estimatedBytes=Math.max(0,documentBytes-existingRecordBytes)+oneRecordBytes*count+count*16+256;
  if(estimatedBytes>100000000)throw Error('A saída estimada excede o limite de 100 MB. Reduza a quantidade ou simplifique o modelo.');
  const original=project(template,outGroup,0),originalFields=fields(original),originalNodes=nodes(original),ruleSet=config.rules||{},presence=config.presence||{};
  for(const [path,rule] of Object.entries(ruleSet))if((rule.generator||rule.fixed!=null||rule.exactLength!=null)&&!resolve(template,path))throw Error('Regra sem campo: '+display(path));
  for(const [path,policy] of Object.entries(presence)){
   if(!resolve(template,path))throw Error('Presença sem campo ou grupo: '+display(path));
   if(policy.requirement==='optional'&&(policy.include===false||policy.distribution==='alternate')&&hasPrefix(JSON.parse(outGroup),JSON.parse(path)))throw Error(display(path)+': a raiz e o caminho da unidade do registro devem permanecer presentes.');
  }
  const doc=template.cloneNode(true),layout={...replaceRecords(doc,outGroup,count),templateGroup:outGroup,outputPaths:{},templatePaths:{}},prefix=JSON.parse(outGroup);
  const context={referenceDateTime:config.referenceDateTime||new Date().toISOString(),timeZone:config.timeZone||'America/Fortaleza',count:formulaCount,baseDate:config.baseDate,configName:config.name,fileIndex:config.fileIndex||0};
  const repeated=path=>hasPrefix(JSON.parse(path),prefix);
  const actualPath=(path,index)=>reindex(outputPath(path,{wrapperPath:layout.wrapperPath}),layout.group,index);
  // Register every target before evaluation: dependents may precede their sources.
  const jobs=new WeakMap(),recordJobs=[];
  function evaluateTarget(target){
   if(!connected(doc,target))throw Error('Campo de saída ausente ou omitido.');
   const job=jobs.get(target);
   if(!job)return target.nodeType===2?target.value:target.textContent;
   if(job.status==='done')return job.value;
   if(job.status==='visiting')throw Error('Dependência circular entre fórmulas: '+job.field.display);
   job.status='visiting';
   try{
    const rule=job.rule,value=rule.fixed!=null?String(rule.fixed):rule.generator?E.evaluate(rule.generator,job.ctx):target.nodeType===2?target.value:target.textContent;
    job.value=E.checkLength(value,rule.exactLength);setValue(target,job.value);job.status='done';return job.value;
   }catch(error){job.status='pending';throw Error(job.field.display+': '+error.message);}
  }
  for(let index=0;index<count;index++){
   const sourceIndex=config.mode==='return'?index:0;
   const ctx={...context,recordIndex:index,profiles:new Map(),groupValues:f=>f.source==='input'?aggregateValues(source,reindex(f.group,config.inputGroup,sourceIndex),reindex(f.path,config.inputGroup,sourceIndex),config.inputGroup,f.allRecords):aggregateValues(doc,actualPath(f.group,index),actualPath(f.path,index),layout.group,f.allRecords,evaluateTarget),sourceValue:path=>readValue(source,reindex(path,config.inputGroup,sourceIndex),'Origem'),outputValue:path=>{
    const target=resolve(doc,actualPath(path,index));if(!target)throw Error('Campo do XML de saída não encontrado: '+display(path));return evaluateTarget(target);
   }};
   const activeFields=originalFields.filter(f=>index===0||repeated(f.key)).map(field=>({field,target:resolve(doc,actualPath(field.key,index))}));
   const nodeRefs=originalNodes.filter(n=>index===0||repeated(n.key)).map(node=>({node,target:resolve(doc,actualPath(node.key,index))}));
   const policies=originalNodes.filter(n=>presence[n.key]&&(index===0||repeated(n.key))).map(node=>({node,policy:presence[node.key],target:resolve(doc,actualPath(node.key,index))}));
   for(const {policy,target} of policies)if(omitForRecord(policy,index)&&connected(doc,target))removeNode(target);
   for(const {field,target} of activeFields){
    const rule=ruleSet[field.key];if(!connected(doc,target)||!rule||(!rule.generator&&rule.fixed==null&&rule.exactLength==null))continue;
    jobs.set(target,{field,rule,ctx,status:'pending'});
   }
   recordJobs.push({activeFields,nodeRefs,policies});
   yield {prepared:index};
  }
  for(let index=0;index<count;index++){
   const {activeFields,nodeRefs,policies}=recordJobs[index];
   for(const {target} of activeFields)if(connected(doc,target)&&jobs.has(target))evaluateTarget(target);
   for(const {node,policy,target} of policies)if(policy.requirement==='required'&&!node.isGroup&&connected(doc,target)&&!(target.nodeType===2?target.value:target.textContent).trim())throw Error(node.display+': campo obrigatório sem valor.');
   for(const {node,target} of nodeRefs){const original=reindex(node.key,outGroup,index),actual=connected(doc,target)?key(target):null;layout.outputPaths[original]=actual;if(actual)layout.templatePaths[actual]=original;}
   yield index;
  }
  for(const path of headerPaths)if(!resolve(doc,path)||records(doc,path).length!==1)throw Error('O cabeçalho '+display(path)+' precisa permanecer uma única vez na saída. Revise a presença da tag e de seus grupos pais.');
  const ctx={...context,recordIndex:0,profiles:new Map(),groupValues:f=>f.source==='input'?aggregateValues(source,f.group,f.path,config.inputGroup,f.allRecords):aggregateValues(doc,outputPath(f.group,layout),outputPath(f.path,layout),layout.group,f.allRecords),sourceValue:path=>readValue(source,path,'XML de entrada'),outputValue:path=>readValue(doc,outputPath(path,layout),'XML de saída')};
  const name=E.filename(E.evaluate(config.filename,ctx)),xml=serialize(doc);if(new TextEncoder().encode(xml).length>100000000)throw Error('A saída excede o limite de 100 MB. Reduza a quantidade ou simplifique as regras.');parse(xml,{maxBytes:100000000});
  return{xml,name,count,createdAt:new Date().toISOString(),...layout,baseDate:config.baseDate};
 }
 function generate(config,inputXml){const iterator=generationSteps(config,inputXml);let step;do{step=iterator.next();}while(!step.done);return step.value;}
 async function generateAsync(config,inputXml,{signal,onProgress}={}){const iterator=generationSteps(config,inputXml);while(true){if(signal?.aborted)throw new DOMException('Geração cancelada','AbortError');const step=iterator.next();if(step.done)return step.value;if(typeof step.value==='number'&&step.value%10===0){onProgress?.(step.value+1);await new Promise(resolve=>setTimeout(resolve,0));}else if(typeof step.value==='object'&&step.value.prepared%10===0){await new Promise(resolve=>setTimeout(resolve,0));}}}
 function testFormula(config,inputXml,formula,targetPath=null){
  const source=parse(inputXml||config.sourceTemplate),available=records(source,config.inputGroup).length||1;
  const formulaCount=config.mode==='return'?available:Number(config.count||1);
  const globalSum=f=>f?.type==='groupSum'&&f.allRecords||f?.type==='compose'&&(f.parts||[]).some(globalSum);
  const needsAll=globalSum(formula)||Object.values(config.rules||{}).some(rule=>globalSum(rule.generator));
  const preview={...config,count:needsAll?config.count:1,returnSource:needsAll?config.returnSource:'first',previewOnly:!needsAll,previewContextCount:formulaCount,
   rules:{...(config.rules||{})},filename:{type:'literal',value:'preview'}};
  if(targetPath)preview.rules[targetPath]={...(preview.rules[targetPath]||{}),generator:formula,fixed:null};
  else preview.filename=formula;
  const result=generate(preview,inputXml||config.sourceTemplate);
  if(!targetPath)return result.name;
  const actualPath=result.outputPaths[targetPath];
  if(!actualPath)throw Error('O campo não está presente na prévia. Verifique a política de presença e o caminho selecionado.');
  const output=parse(result.xml,{maxBytes:100000000}),node=resolve(output,actualPath);
  if(!node)throw Error('O campo não foi encontrado na saída da prévia.');
  return node.nodeType===2?node.value:node.textContent;
 }
 return{parse,fields,nodes,groups,groupValues,resolve,records,project,display,key,serialize,automap,outputPath,templatePath,generate,generateAsync,testFormula};
})();
