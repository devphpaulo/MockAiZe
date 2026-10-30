/* Shared searchable selector for return models and filter presets. */
globalThis.ReturnCombobox = (() => {
  'use strict';
  function mount(host, {items, value, onChange, onAdd, idPrefix='returnModel', text={}}) {
    const copy={label:'Modelo de retorno em edição',placeholder:'Selecione um retorno',search:'Pesquisar retornos…',searchLabel:'Pesquisar retornos',list:'Modelos de retorno',empty:'Nenhum retorno encontrado.',add:'Adicionar retorno',...text};
    const trigger=document.createElement('button');trigger.type='button';trigger.id=idPrefix+'Trigger';trigger.className='return-combobox-trigger';
    trigger.setAttribute('role','combobox');trigger.setAttribute('aria-label',copy.label);trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',idPrefix+'List');
    const label=document.createElement('span');label.textContent=items.find(item=>item.id===value)?.name||copy.placeholder;trigger.append(label);
    const arrow=document.createElement('span');arrow.className='combobox-chevron';arrow.setAttribute('aria-hidden','true');trigger.append(arrow);
    const content=document.createElement('div');content.id=idPrefix+'Popup';content.className='return-combobox-content';content.setAttribute('popover','auto');content.dataset.dropdown='';trigger.setAttribute('popovertarget',content.id);trigger.setAttribute('popovertargetaction','toggle');
    const input=document.createElement('input');input.type='search';input.className='return-combobox-search';input.placeholder=copy.search;input.setAttribute('aria-label',copy.searchLabel);input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',idPrefix+'List');
    const list=document.createElement('div');list.id=idPrefix+'List';list.className='return-combobox-list';list.setAttribute('role','listbox');list.setAttribute('aria-label',copy.list);
    const empty=document.createElement('p');empty.className='return-combobox-empty';empty.textContent=copy.empty;empty.setAttribute('role','status');
    const separator=document.createElement('div');separator.className='return-combobox-separator';separator.setAttribute('role','separator');
    const add=document.createElement('button');add.type='button';add.className='return-combobox-add';const plus=document.createElement('span');plus.setAttribute('aria-hidden','true');plus.textContent='＋';const addText=document.createElement('span');addText.textContent=copy.add;add.append(plus,addText);
    separator.hidden=add.hidden=!onAdd;content.append(input,list,empty,separator,add);host.replaceChildren(trigger,content);
    let filtered=items,activeIndex=Math.max(0,items.findIndex(item=>item.id===value));
    const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
    function highlight() {
      const options=[...list.children];
      options.forEach((option,index)=>option.classList.toggle('highlighted',index===activeIndex));
      const active=options[activeIndex];
      if(active){input.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});}
      else input.removeAttribute('aria-activedescendant');
    }
    function close(restore=true){if(content.matches(':popover-open'))content.hidePopover();if(restore&&trigger.isConnected)trigger.focus();}
    function choose(id){close(false);onChange(id);document.getElementById(idPrefix+'Trigger')?.focus();}
    function render() {
      filtered=items.filter(item=>normalize(item.name).includes(normalize(input.value.trim())));
      activeIndex=Math.max(0,Math.min(activeIndex,filtered.length-1));list.replaceChildren();empty.hidden=filtered.length>0;
      filtered.forEach((item,index)=>{
        const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.id=idPrefix+'Option'+index;option.className='return-combobox-option';option.setAttribute('role','option');option.setAttribute('aria-selected',String(item.id===value));
        const text=document.createElement('span');text.textContent=item.name;option.append(text);
        if(item.id===value){const check=document.createElement('span');check.className='combobox-check';check.setAttribute('aria-hidden','true');check.textContent='✓';option.append(check);}
        option.addEventListener('pointerenter',()=>{activeIndex=index;highlight();});option.addEventListener('pointerdown',event=>event.preventDefault());option.onclick=()=>choose(item.id);list.append(option);
      });highlight();
    }
    function position() {
      const rect=trigger.getBoundingClientRect(),gap=8,availableBelow=innerHeight-rect.bottom-16,availableAbove=rect.top-16;
      const above=availableBelow<240&&availableAbove>availableBelow,space=Math.max(120,above?availableAbove:availableBelow);
      const width=Math.min(Math.max(240,rect.width),innerWidth-32);
      content.style.width=width+'px';content.style.maxHeight=Math.min(360,space)+'px';
      content.style.left=Math.max(16,Math.min(rect.left,innerWidth-width-16))+'px';content.style.top=above?'auto':rect.bottom+gap+'px';content.style.bottom=above?innerHeight-rect.top+gap+'px':'auto';content.dataset.side=above?'top':'bottom';
    }
    function prepare(){input.value='';filtered=items;activeIndex=Math.max(0,items.findIndex(item=>item.id===value));render();position();}
    function open(){if(!content.matches(':popover-open'))trigger.click();else input.focus({preventScroll:true});}
    trigger.onclick=()=>{if(!content.matches(':popover-open'))prepare();};
    trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open();}};
    input.oninput=()=>{activeIndex=0;render();};
    input.onkeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();const count=filtered.length;if(!count)return;
        activeIndex=event.key==='Home'?0:event.key==='End'?count-1:(activeIndex+(event.key==='ArrowDown'?1:-1)+count)%count;highlight();return;
      }
      if(event.key==='Enter'){event.preventDefault();if(filtered[activeIndex])choose(filtered[activeIndex].id);}
    };
    add.onclick=()=>{close(false);onAdd?.();};
    content.addEventListener('focusout',event=>{const next=event.relatedTarget;if(next&&!content.contains(next)&&next!==trigger)close(false);});
    content.addEventListener('toggle',event=>{const expanded=event.newState==='open';trigger.setAttribute('aria-expanded',String(expanded));input.setAttribute('aria-expanded',String(expanded));if(expanded){position();input.focus({preventScroll:true});}});
    content.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
  }
  return {mount};
})();
