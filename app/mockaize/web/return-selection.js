/* Multiple return selection, adapted from shadcn/ui DropdownMenuCheckboxItem.
   This menu stays open while checking items; editing a template uses ReturnCombobox. */
globalThis.ReturnSelection = (() => {
  'use strict';
  const instances = new WeakMap();
  const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  function create(host) {
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'return-menu-trigger';
    trigger.id = 'returnSelectionTrigger'; trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'returnSelectionMenu');
    trigger.innerHTML = `${svg('M8 3h11v14M5 7h10v14H5z')}<span>Retornos</span><span class="return-menu-count"></span>${svg('m6 9 6 6 6-6')}`;
    const content = document.createElement('div'); content.id = 'returnSelectionMenu'; content.className = 'return-menu-content';
    content.setAttribute('popover', 'auto'); content.dataset.dropdown = ''; content.setAttribute('role', 'menu'); content.setAttribute('aria-labelledby', 'returnSelectionHeading'); content.setAttribute('aria-describedby', 'returnSelectionHint');
    const heading = document.createElement('div'); heading.id = 'returnSelectionHeading'; heading.className = 'return-menu-heading'; heading.textContent = 'Gerar e exportar';
    const list = document.createElement('div'); list.className = 'return-menu-items'; list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Modelos de retorno');
    const separator = document.createElement('div'); separator.className = 'return-menu-separator'; separator.setAttribute('role', 'separator');
    const hint = document.createElement('p'); hint.id = 'returnSelectionHint'; hint.className = 'return-menu-hint'; hint.textContent = 'Cada retorno mantém seu XML e suas regras.';
    content.append(heading, list, separator, hint); host.replaceChildren(trigger, content);
    let items = [], onChange, textBuffer = '', lastTyping = 0;
    const options = () => [...list.querySelectorAll('[role="menuitemcheckbox"]')];
    function close(restore = true) {
      if (content.matches(':popover-open')) content.hidePopover();
      trigger.setAttribute('aria-expanded', 'false');
      if (restore && trigger.isConnected) trigger.focus({preventScroll: true});
    }
    function position() {
      if (!content.matches(':popover-open')) return;
      const rect = trigger.getBoundingClientRect(), below = innerHeight - rect.bottom - 16, above = rect.top - 16;
      const opensAbove = below < 200 && above > below, available = Math.max(80, opensAbove ? above : below);
      const width = Math.min(Math.max(256, rect.width), innerWidth - 32);
      content.style.width = width + 'px'; content.style.maxHeight = Math.min(360, available) + 'px';
      content.style.left = Math.max(16, Math.min(rect.right - width, innerWidth - width - 16)) + 'px';
      content.style.top = opensAbove ? 'auto' : rect.bottom + 8 + 'px'; content.style.bottom = opensAbove ? innerHeight - rect.top + 8 + 'px' : 'auto';
      content.dataset.side = opensAbove ? 'top' : 'bottom';
    }
    function focusItem(index) {
      const entries = options(); if (!entries.length) return;
      const entry = entries[(index + entries.length) % entries.length];
      entries.forEach(option => option.tabIndex = option === entry ? 0 : -1);
      entry.focus({preventScroll: true}); entry.scrollIntoView({block: 'nearest'});
    }
    function open(last = false) {
      if (host.hidden || !items.length) return;
      content.showPopover(); position(); trigger.setAttribute('aria-expanded', 'true'); textBuffer = '';
      focusItem(last ? items.length - 1 : 0);
    }
    function update(next) {
      items = next.items; onChange = next.onChange;
      const count = items.filter(item => item.selected).length;
      trigger.querySelector('.return-menu-count').textContent = `${count}/${items.length}`;
      trigger.setAttribute('aria-label', `Selecionar retornos para geração e exportação · ${count} de ${items.length}`);
      trigger.title = items.filter(item => item.selected).map(item => item.name).join(', ') || 'Selecione os retornos para gerar e exportar';
      const previous = options(), same = previous.length === items.length && previous.every((entry, index) => entry.dataset.returnId === items[index].id);
      const focused = content.contains(document.activeElement) ? document.activeElement.dataset.returnId : null;
      if (!same) {
        list.replaceChildren();
        for (const item of items) {
          const option = document.createElement('button'); option.type = 'button'; option.className = 'return-menu-item'; option.tabIndex = -1; option.dataset.returnId = item.id; option.setAttribute('role', 'menuitemcheckbox');
          const check = document.createElement('span'); check.className = 'return-menu-check'; check.innerHTML = svg('m5 12 4 4L19 6'); check.setAttribute('aria-hidden', 'true');
          const label = document.createElement('span'); label.className = 'return-menu-name'; option.append(check, label);
          option.addEventListener('click', () => {
            const current = items.find(entry => entry.id === option.dataset.returnId); if (!current) return;
            onChange(current.id, !current.selected);
          });
          option.addEventListener('pointermove', () => { if (document.activeElement !== option) focusItem(options().indexOf(option)); });
          list.append(option);
        }
      }
      options().forEach((option, index) => {
        const item = items[index]; option.setAttribute('aria-checked', String(Boolean(item.selected)));
        option.querySelector('.return-menu-name').textContent = item.name;
      });
      if (!same && focused) { const index = items.findIndex(item => item.id === focused); focusItem(Math.max(0, index)); }
      if (host.hidden) close(false); else position();
    }
    trigger.addEventListener('click', () => content.matches(':popover-open') ? close() : open());
    trigger.addEventListener('keydown', event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(event.key === 'ArrowUp'); } });
    content.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      const entries = options(), index = entries.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); focusItem(event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1)); return;
      }
      if (event.key.length !== 1 || event.key === ' ' || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      const now = Date.now(); textBuffer = now - lastTyping < 700 ? textBuffer + event.key : event.key; lastTyping = now;
      const query = normalize(textBuffer), match = items.findIndex((item, i) => i > index && normalize(item.name).startsWith(query));
      const fallback = items.findIndex(item => normalize(item.name).startsWith(query));
      if (match >= 0 || fallback >= 0) focusItem(match >= 0 ? match : fallback);
    });
    content.addEventListener('toggle', event => { trigger.setAttribute('aria-expanded', String(event.newState === 'open')); });
    content.addEventListener('focusout', event => { const next = event.relatedTarget; if (next && !content.contains(next) && next !== trigger) close(false); });
    window.addEventListener('resize', position);
    document.addEventListener('scroll', event => { if (!content.contains(event.target)) position(); }, true);
    return {update, close};
  }
  function mount(host, options) {
    let instance = instances.get(host);
    if (!instance) { instance = create(host); instances.set(host, instance); }
    instance.update(options);
  }
  return {mount, close: host => instances.get(host)?.close(false)};
})();
