'use strict';
// Optional browser regression: point MOCKAIZE_PLAYWRIGHT_MODULE to Playwright.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.MOCKAIZE_PLAYWRIGHT_MODULE || 'playwright');

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.addScriptTag({path:path.join(__dirname,'../mockaize/web/engine.js')});
  await page.addScriptTag({path:path.join(__dirname,'../mockaize/web/return-combobox.js')});
  await page.addScriptTag({path:path.join(__dirname,'../mockaize/web/alerts.js')});
  for(const css of ['studio.css','editor-components.css','navigation.css','components.css'])await page.addStyleTag({path:path.join(__dirname,'../mockaize/web',css)});
  const studioSource=fs.readFileSync(path.join(__dirname,'../mockaize/web/studio.js'),'utf8');
  const manifest=JSON.parse(execFileSync(path.join(__dirname,'../.venv/Scripts/python.exe'),['-c','import json; from mockaize.faker_catalog import manifest; print(json.dumps(manifest()))'],{cwd:path.join(__dirname,'..'),encoding:'utf8'}));
  await page.evaluate(({studioSource,manifest})=>{
   const extract=name=>{const start=studioSource.indexOf(' function '+name+'(');const end=studioSource.indexOf('\n function ',start+1);return studioSource.slice(start,end).trim();};
   const h=value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
   const control=new Function('h','return ('+extract('control')+')')(h);
   const select=new Function('h','return ('+extract('selectControl')+')')(h);
   const render=new Function('fakerCatalog','h','control','selectControl','return ('+extract('extraParameters')+')')(manifest,h,control,select);
   document.body.innerHTML=render({type:'faker',category:'address',catalogId:'address.address',params:{}},'');
   if(document.querySelectorAll('[data-faker-components]').length!==7)throw Error('Address component checkboxes missing.');
   if(getComputedStyle(document.querySelector('.date-components')).display!=='grid')throw Error('Components must use the date layout.');
   if(getComputedStyle(document.querySelector('.date-check')).display!=='flex')throw Error('Checkbox label must share its row.');
   if(document.querySelectorAll('[data-faker-components]:checked').length!==6)throw Error('Address defaults differ from server.');
   document.body.innerHTML=render({type:'faker',category:'person',catalogId:'person.name',params:{}},'');
   if(document.querySelectorAll('[data-faker-components]:checked').length!==2)throw Error('Name component checkboxes missing.');
   document.body.innerHTML='<select data-f="type"><option value="person">Pessoa fictícia</option><option value="company">Empresa fictícia</option></select>';
   new Function(extract('installSourceSearch')+';installSourceSearch();')();
   if(!document.querySelector('select').hidden)throw Error('Native source select must be replaced.');
   document.querySelector('.return-combobox-trigger').click();
   const search=document.querySelector('input[type=search]');
   search.value='empresa';search.dispatchEvent(new Event('input'));
   if(document.querySelectorAll('.return-combobox-option').length!==1)throw Error('Source popup search did not filter options.');
   search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   if(document.querySelector('select').value!=='company')throw Error('Source search keyboard selection failed.');
   document.body.innerHTML='<div class="callout mapping-summary"><p class="hint">Origem vinculada</p><button data-action="disconnect">Desconectar origem</button></div><button class="primary">Testar fórmula</button>';
   AppAlerts.enhance(document);
   for(const theme of ['light','dark']){
    document.documentElement.dataset.theme=theme;
    const alert=document.querySelector('.mapping-summary'),primary=document.querySelector('.primary');
    if(getComputedStyle(alert).backgroundColor!==getComputedStyle(primary).backgroundColor)throw Error('Information green must match the formula action in '+theme);
    if(getComputedStyle(alert.querySelector('.hint')).color!==getComputedStyle(primary).color)throw Error('Information ink must match the formula action in '+theme);
   }
  },{studioSource,manifest});
  const results=await page.evaluate(async()=>{
   const X=MockXml,E=MockEngine;
   const unit='<Grupo_AMCB001_DadCorresp><RzSocCorresp/><Valor>10</Valor><Total/></Grupo_AMCB001_DadCorresp>';
   const wrap=body=>'<AMCBDOC><SISARQ><AMCB001>'+body+'</AMCB001></SISARQ></AMCBDOC>';
   const xml=wrap(unit),doc=X.parse(xml),group=X.groups(doc).find(g=>g.name==='Grupo_AMCB001_DadCorresp').key;
   const fields=X.fields(doc),name=fields.find(f=>f.name==='RzSocCorresp').key;
   const amount=fields.find(f=>f.name==='Valor').key,total=fields.find(f=>f.name==='Total').key;
   const sum={type:'groupSum',source:'output',group,path:amount,allRecords:true};
   const cases=[];
   let reproducedError='';
   for(const mode of ['new','return'])for(const formula of [
    {type:'company',field:'legalName',group:'correspondente'},
    {type:'person',field:'name',group:'cliente'},
    {type:'address',field:'street',state:'CE',group:'endereco'},
    {type:'faker',catalogVersion:1,catalogId:'company.company',category:'company',params:{},group:'correspondente'},
    {type:'compose',parts:[{type:'literal',value:'Prefixo '},{type:'company',field:'legalName'}]}
   ]){
    const input=mode==='return'?wrap(unit+unit):xml,count=mode==='return'?2:3;
    const config={mode,count:3,inputGroup:group,outputGroup:group,outputTemplate:xml,
     rules:{[name]:{generator:formula},[total]:{generator:sum}},filename:{type:'literal',value:'amostra'}};
    if(!reproducedError){
     const oldPreview={...config,previewOnly:true};
     oldPreview.fakerValues=Object.fromEntries(X.fakerRequests(oldPreview,input).map(item=>[item.key,'Empresa Teste']));
     try{X.testFormula(oldPreview,input,formula,name);}catch(error){reproducedError=error.message;}
    }
    const resolve=async preview=>{
     const items=X.fakerRequests(preview,input);
     if(items.length!==count)throw Error(`Expected ${count} resolved records, got ${items.length}`);
     return {...preview,fakerValues:Object.fromEntries(items.map(item=>[item.key,'Empresa Teste']))};
    };
    const value=await X.testFormulaAsync(config,input,formula,name,resolve);
    if(!value.includes('Empresa Teste'))throw Error('Preview lost the resolved Faker value.');
    const totalValue=await X.testFormulaAsync(config,input,sum,total,resolve);
    cases.push({mode,type:formula.type,value,total:totalValue,expectedTotal:String(count*10)});
   }
   return {cases,reproducedError};
  });
  assert.match(results.reproducedError,/RzSocCorresp: O valor Faker não foi resolvido/);
  for(const result of results.cases)assert.equal(result.total,result.expectedTotal);
  console.log(`Original error reproduced; ${results.cases.length} corrected browser preview cases passed (legacy/new Faker, composition, aggregate, new/return).`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
