/* Persistent labels and native validation shared by all four operations/dialogs. */
(()=>{
 'use strict';
 let sequence=0,invalidFocusQueued=false;
 const fieldSelector='.form-field,.length-field,.switch-row,.filter-control,.manual-field,.create-field,.operation-field,.group-field,.manual-head-controls>div:first-child,.library-dialog label';
 function enhance(root){
  const parent=root.closest?.(fieldSelector);
  const fields=[...new Set([...(parent?[parent]:[]),...(root.querySelectorAll?.(fieldSelector)||[])])];
  for(const field of fields){
   const label=field.matches('label')?field:field.querySelector('label');if(!label)continue;
   const control=field.querySelector('input:not([type="hidden"]),select,textarea,[data-nav-menu="studioMenu"]');if(!control)continue;
   if(!control.id)control.id='form-control-'+(++sequence);
   if(!label.contains(control)&&!label.htmlFor)label.htmlFor=control.id;
   if(control.matches('[data-nav-menu],.date-native')){if(!label.id)label.id='form-label-'+(++sequence);const trigger=field.querySelector('.date-picker-trigger')||control;trigger.setAttribute('aria-labelledby',label.id);const value=field.querySelector('.date-picker-value');if(value){if(!value.id)value.id='date-value-'+(++sequence);trigger.setAttribute('aria-describedby',value.id);}}
  }
 }
 function clearNativeError(control){const id=control.dataset.nativeError;if(!id)return;document.getElementById(id)?.remove();const tokens=(control.getAttribute('aria-describedby')||'').split(/\s+/).filter(x=>x&&x!==id);if(tokens.length)control.setAttribute('aria-describedby',tokens.join(' '));else control.removeAttribute('aria-describedby');control.removeAttribute('aria-invalid');delete control.dataset.nativeError;}
 document.addEventListener('invalid',event=>{
  const control=event.target;if(!control.matches('input,select,textarea')||!control.validationMessage)return;
  event.preventDefault();let error=document.getElementById(control.dataset.nativeError);if(!error){error=document.createElement('div');error.id='native-error-'+(++sequence);error.className='field-validation';control.dataset.nativeError=error.id;(control.closest('.date-picker')||control).after(error);control.setAttribute('aria-describedby',((control.getAttribute('aria-describedby')||'')+' '+error.id).trim());}
  control.setAttribute('aria-invalid','true');AppAlerts.render(error,control.validationMessage,{type:'error',title:'Revise este campo'});
  if(!invalidFocusQueued){invalidFocusQueued=true;queueMicrotask(()=>{invalidFocusQueued=false;(control.closest('.date-picker')?.querySelector('.date-picker-trigger')||control).focus({preventScroll:false});});}
 },true);
 for(const type of ['input','change'])document.addEventListener(type,event=>{const control=event.target;if(control.dataset?.nativeError&&control.validity?.valid)clearNativeError(control);},true);
 enhance(document);
 new MutationObserver(records=>{for(const record of records)for(const child of record.addedNodes)if(child.nodeType===Node.ELEMENT_NODE)enhance(child);}).observe(document.body,{childList:true,subtree:true});
})();
