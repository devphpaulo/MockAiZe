'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
// A document without repeated records suffices to exercise request planning.
const context = {TextEncoder, DOMParser: class {
  parseFromString() { return {getElementsByTagNameNS: () => []}; }
}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../mockaize/web/engine.js'), 'utf8'), context);
const E = context.MockEngine, X = context.MockXml;
const formula = {type:'faker',catalogVersion:1,catalogId:'person.name',group:'customer'};
const catalog = {catalogVersion:1,categories:[{id:'person',items:[{id:'person.name',parameters:[]}]}]};
E.validateFaker(formula,catalog);
assert.throws(()=>E.validateFaker({...formula,params:{unknown:1}},catalog),/Parâmetro/);
assert.throws(()=>E.evaluate({type:'person',field:'constructor'},{}),/dado válido/);
const config = {mode:'new',count:2,rules:{name:{generator:formula}},filename:{type:'literal',value:'sample'}};
const requests = X.fakerRequests(config, '<R/>');
assert.equal(requests.length, 2);
assert.equal(E.evaluate(formula, {recordIndex:1,fakerValues:{[requests[1].key]:'Maria Silva'}}), 'Maria Silva');
const legacy = {...config,rules:{name:{generator:{type:'person',field:'name',group:'customer'}}}};
assert.equal(X.fakerRequests(legacy, '<R/>').length, 2);
const manual = {...config,mode:'manual',count:10000,rules:{name:{generator:formula,recordIndex:3}},filename:formula};
const manualRequests = X.fakerRequests(manual, '<R/>');
assert.equal(manualRequests.length, 2);
assert.equal(JSON.parse(manualRequests[0].key)[1], 3);
assert.equal(X.fakerRequests({...config,filename:formula}, '<R/>').length, 2);
const fixed = {...config,rules:{name:{generator:formula,fixed:'Existing value'}}};
assert.equal(X.fakerRequests(fixed, '<R/>').length, 0);
assert.throws(() => X.fakerRequests({...config,count:10001}, '<R/>'), /10000/);
assert.equal(X.fakerRequests({...config,count:10000}, '<R/>').length, 10000);

// Adding a Manual record reindexes structural references, preserving profile names.
const group = [{name:'R',ns:'',index:1},{name:'Item',ns:'',index:1}];
const field = JSON.stringify([...group,{name:'Name',ns:'',index:1}]);
const record = {cloneNode:()=>({}),after:()=>{}};
const doc = {};
const state = {draft:{mode:'manual',manual:{templateXml:'<R/>',recordCount:1,
  recordGroup:JSON.stringify(group),formulas:{[field]:formula},values:{},generated:{}}}};
context.document={addEventListener:()=>{},getElementById:()=>null};
context.crypto=require('node:crypto');
vm.runInContext(fs.readFileSync(path.join(__dirname,'../mockaize/web/manual-studio.js'),'utf8'),context);
const manualStudio=context.ManualStudio.create({state,E,h:String,
  X:{parse:()=>doc,project:()=>doc,resolve:()=>record,fields:()=>[],recordGroups:()=>[]},
  notify:()=>{},remember:()=>{},changed:()=>{},render:()=>{}});
manualStudio.addRecord();
assert.equal(state.draft.manual.recordCount,2);
const copied=Object.entries(state.draft.manual.formulas).find(([key])=>JSON.parse(key)[1].index===2);
assert.equal(copied[1].group,'customer');
console.log('Faker engine request planning: OK');
