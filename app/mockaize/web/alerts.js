/* Shadcn Studio Base Alert 23 (success), 24 (warning), 25 (error), 26 (info).
   Spacing follows MockAíZé's 8 px grid; colors and icons communicate the state. */
globalThis.AppAlerts=(()=>{
 'use strict';
 const types={success:{variant:23,title:'Concluído',path:'M18 6 7 17l-5-5m20-2-7.5 7.5L13 16'},warning:{variant:24,title:'Atenção',path:'M12 8v4m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'},error:{variant:25,title:'Não foi possível concluir',path:'m10.3 3.9-8 14a2 2 0 0 0 1.7 3.1h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0M12 9v4m0 4h.01'},info:{variant:26,title:'Informação',path:'M12 8v4m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'}};
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=path=>`<svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
 function options(value){const o=typeof value==='string'?{type:value}:value||{};return{...o,type:Object.hasOwn(types,o.type)?o.type:'info'};}
 function content(message,o){const t=types[o.type];return icon(t.path)+`<div class="alert-content"><div class="alert-title">${escape(o.title||t.title)}</div><div class="alert-description">${escape(message)}</div></div>`+(o.dismissible?`<button type="button" class="alert-dismiss" aria-label="Fechar aviso">${icon('m6 6 12 12M6 18 18 6')}</button>`:'');}
 function attributes(element,o){element.classList.add('app-alert');element.dataset.alertType=o.type;element.dataset.alertVariant=types[o.type].variant;element.setAttribute('role',o.live===false?'note':o.type==='error'?'alert':'status');element.setAttribute('aria-atomic','true');}
 function render(element,message,value){const o=options(value);attributes(element,o);element.innerHTML=content(message,o);element.hidden=!message;return element;}
 function markup(message,value){const o=options(value),role=o.live===false?'note':o.type==='error'?'alert':'status';return `<div class="app-alert" data-alert-type="${o.type}" data-alert-variant="${types[o.type].variant}" role="${role}" aria-atomic="true">${content(message,o)}</div>`;}
 function enhance(root){
  const selector='.callout:not(.app-alert),.date-preview[role="alert"]:not(.app-alert)';
  const candidates=[...(root.matches?.(selector)?[root]:[]),...(root.querySelectorAll?.(selector)||[])];
  for(const element of candidates){
   const type=element.classList.contains('error')||element.getAttribute('role')==='alert'?'error':element.classList.contains('warning')?'warning':'info',o={type,live:type==='error'};
   const children=[...element.childNodes];attributes(element,o);element.innerHTML=content('',o);element.querySelector('.alert-description').append(...children);
  }
 }
 function notify(host,message,value){
  if(!message||!host)return;const o=options(value),card=document.createElement('section');render(card,message,{...o,dismissible:true});
  host.removeAttribute('role');host.removeAttribute('aria-live');host.classList.add('alert-stack');host.hidden=false;host.append(card);
  // Keep errors until dismissed. A burst of successes must not discard an error.
  const transient=[...host.children].filter(e=>e.dataset.alertType!=='error'&&e.dataset.alertType!=='warning');while(transient.length>3)transient.shift().remove();
  let timer=null,remaining=o.duration??(o.type==='success'?6000:o.type==='info'?7000:0),started=0;
  const close=()=>{clearTimeout(timer);card.remove();host.hidden=!host.childElementCount;};
  const pause=()=>{if(timer){clearTimeout(timer);timer=null;remaining=Math.max(0,remaining-(performance.now()-started));}};
  const resume=()=>{if(remaining>0&&!timer){started=performance.now();timer=setTimeout(close,remaining);}};
  card.querySelector('.alert-dismiss').onclick=close;card.addEventListener('pointerenter',pause);card.addEventListener('pointerleave',resume);card.addEventListener('focusin',pause);card.addEventListener('focusout',event=>{if(!card.contains(event.relatedTarget))resume();});
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)card.animate([{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:160,easing:'ease-out'});
  resume();return card;
 }
 enhance(document);
 new MutationObserver(records=>{for(const record of records)for(const child of record.addedNodes)if(child.nodeType===Node.ELEMENT_NODE)enhance(child);}).observe(document.body,{childList:true,subtree:true});
 return{render,markup,notify,enhance};
})();
