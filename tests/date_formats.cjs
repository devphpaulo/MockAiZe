const assert=require('node:assert/strict');
require('../mockaize/web/engine.js');
const E=globalThis.MockEngine;
const c={baseDate:'2026-12-31',referenceDateTime:'2026-12-31T21:26:39.123Z',timeZone:'America/Fortaleza'};
const cases=[['month,year',{yearDigits:'2',dateSeparator:''},'MMyy','1226'],['year',{},'yyyy','2026'],['month',{},'MM','12'],['day',{},'dd','31'],['minute,second',{timeSeparator:''},'mmss','2639'],['second',{},'ss','39'],['year,month,day,hour,minute,second',{order:'YMD',dateSeparator:'',timeSeparator:'',join:''},'yyyyMMddHHmmss','20261231182639'],['day,month,year,hour,minute,second',{dateSeparator:''},'ddMMyyyy HH:mm:ss','31122026 18:26:39']];
for(const [components,extra,mask,value] of cases){const custom={...E.dateCustomDefaults(),...Object.fromEntries(['day','month','year','hour','minute','second'].map(k=>[k,components.split(',').includes(k)])),...extra};const f={type:'date',mode:'offset',days:0,format:'custom',custom};assert.equal(E.dateMask(f),mask);assert.equal(E.evaluate(f,c),value);assert.equal(E.evaluate(JSON.parse(JSON.stringify(f)),c),value);}
assert.equal(E.evaluate({type:'date',mode:'offset',days:1,format:'yyyy-MM-dd'},c),'2027-01-01');
assert.equal(E.evaluate({type:'date',mode:'offset',days:-31,format:'yyyy-MM-dd'},c),'2026-11-30');
const custom={...E.dateCustomDefaults(),timezone:true,zone:'utc',milliseconds:true};
assert.equal(E.evaluate({type:'date',mode:'offset',days:0,format:'custom',custom},c),'31/12/2026 21:26:39.123Z');
custom.zone='app';assert.equal(E.evaluate({type:'date',mode:'offset',days:0,format:'custom',custom},c),'31/12/2026 18:26:39.123-03:00');
assert.throws(()=>E.dateMask({format:'custom',custom:Object.fromEntries(['day','month','year','hour','minute','second'].map(k=>[k,false]))}));
console.log('Date formats: 8 combinations, restoration, rollover, milliseconds and timezone passed');

const presets={"yyyy-MM-dd":"2026-12-31",yyyyMMdd:"20261231","dd/MM/yyyy":"31/12/2026",ddMMyyyy:"31122026","HH:mm:ss":"18:26:39",HHmmss:"182639",yyyyMMddHHmmss:"20261231182639","dd/MM/yyyy HH:mm:ss":"31/12/2026 18:26:39","yyyy-MM-dd'T'HH:mm:ss":"2026-12-31T18:26:39"};
for(const [format,value] of Object.entries(presets))assert.equal(E.evaluate({type:'date',mode:'offset',days:0,format},c),value);
const rollover={...c,baseDate:'2026-12-31',referenceDateTime:'2027-01-01T02:26:39.123Z'};
custom.zone='utc';assert.equal(E.evaluate({type:'date',mode:'offset',days:0,format:'custom',custom},rollover),'01/01/2027 02:26:39.123Z');
assert.equal(E.evaluate({type:'date',mode:'business',format:'yyyy-MM-dd',holidays:'2027-01-01'},c),'2027-01-04');
console.log('Nine presets, UTC date rollover and business-day rule passed');
