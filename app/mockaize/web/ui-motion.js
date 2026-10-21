/* Shared motion: TypeUI-inspired Drop + scale, Rise in and Stiff spring. */
globalThis.UiMotion = (() => {
  'use strict';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previousMode = null, observedGroup = null;
  function toast(element, message, options = {}) {
    return AppAlerts.notify(element, message, typeof options === 'number' ? {duration:options} : options);
  }
  function springPosition(time) {
    const stiffness=500, damping=35, decay=damping/2;
    const frequency=Math.sqrt(stiffness-decay*decay);
    return 1-Math.exp(-decay*time)*(Math.cos(frequency*time)+decay/frequency*Math.sin(frequency*time));
  }
  function geometry(group, button) {
    return {left:button.offsetLeft, width:button.offsetWidth};
  }
  function positionIndicator(group) {
    const active=group.querySelector('[data-mode].active'),indicator=group.querySelector('.operation-indicator');
    if (!active || !indicator) return;
    const target=geometry(group,active);
    indicator.style.transform=`translateX(${target.left}px)`;
    indicator.style.width=target.width+'px';
  }
  const resizeObserver = new ResizeObserver(() => {if(observedGroup?.isConnected)positionIndicator(observedGroup);});
  function operations(root) {
    const group=root.querySelector('.segmented:has([data-mode])');
    if(!group)return;
    group.classList.add('operation-switch');
    group.setAttribute('role','tablist');group.setAttribute('aria-label','Operação');
    const active=group.querySelector('[data-mode].active');if(!active)return;
    for(const button of group.querySelectorAll('[data-mode]')) {
      button.setAttribute('role','tab');button.setAttribute('aria-selected',String(button===active));button.tabIndex=button===active?0:-1;
    }
    const indicator=document.createElement('span');indicator.className='operation-indicator';indicator.setAttribute('aria-hidden','true');group.prepend(indicator);
    const target=geometry(group,active),origin=geometry(group,group.querySelector(`[data-mode="${previousMode}"]`)||active);
    positionIndicator(group);
    if(previousMode && previousMode!==active.dataset.mode && !reduced()) {
      const frames=Array.from({length:41},(_,index)=>{
        const progress=index===40?1:springPosition(index/40*.5);
        return {transform:`translateX(${origin.left+(target.left-origin.left)*progress}px)`,width:(origin.width+(target.width-origin.width)*progress)+'px',offset:index/40};
      });
      indicator.animate(frames,{duration:500,easing:'linear'});
    }
    previousMode=active.dataset.mode;
    if(observedGroup!==group){resizeObserver.disconnect();resizeObserver.observe(group);observedGroup=group;}
    group.addEventListener('keydown',event=>{
      const buttons=[...group.querySelectorAll('[data-mode]')],index=buttons.indexOf(event.target);
      if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      const mode=buttons[next].dataset.mode;buttons[next].click();
      document.querySelector(`.operation-switch [data-mode="${mode}"]`)?.focus();
    });
  }
  return {toast, operations};
})();
