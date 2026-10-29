/* Date Picker 03, progressively enhancing native ISO date inputs. */
globalThis.DatePicker = (() => {
  'use strict';
  const controls = new WeakMap();
  const months = new Intl.DateTimeFormat('pt-BR', {month: 'long', year: 'numeric'});
  const fullDate = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'full'});
  const displayDate = new Intl.DateTimeFormat('pt-BR');
  let sequence = 0, active = null;
  const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  const pad = value => String(value).padStart(2, '0');
  function date(year, month, day) { const d = new Date(0); d.setFullYear(year, month, day); d.setHours(12, 0, 0, 0); return d; }
  function parse(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    const [, y, m, d] = match.map(Number), result = date(y, m - 1, d);
    return y >= 1 && result.getFullYear() === y && result.getMonth() === m - 1 && result.getDate() === d ? result : null;
  }
  function iso(d) { return `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function dayNumber(d) { const utc = new Date(0); utc.setUTCFullYear(d.getFullYear(), d.getMonth(), d.getDate()); utc.setUTCHours(0, 0, 0, 0); return utc.getTime() / 86400000; }
  function enhance(input) {
    if (controls.has(input) || !('showPopover' in HTMLElement.prototype)) return;
    const wrapper = document.createElement('div'); wrapper.className = 'date-picker';
    input.before(wrapper); wrapper.append(input); input.classList.add('date-native'); input.tabIndex = -1;
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'date-picker-trigger';
    trigger.innerHTML = `<span>${icon('M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z')}<span class="date-picker-value"></span></span>${icon('m6 9 6 6 6-6')}`;
    const popup = document.createElement('div'); popup.id = `date-picker-${++sequence}`; popup.className = 'date-picker-popup';
    popup.setAttribute('popover', 'auto'); popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', 'Escolher data'); popup.dataset.dropdown = '';
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', popup.id); trigger.setAttribute('aria-expanded', 'false');
    const label = input.getAttribute('aria-label') || input.labels?.[0]?.textContent.trim() || 'Data';
    let view, cursor;
    function refresh() {
      const selected = parse(input.value);
      trigger.querySelector('.date-picker-value').textContent = selected ? displayDate.format(selected) : 'Escolher data';
      trigger.setAttribute('aria-label', `${label}: ${selected ? displayDate.format(selected) : 'Escolher data'}`);
      trigger.disabled = input.disabled || input.readOnly; trigger.setAttribute('aria-invalid', String(!input.validity.valid));
    }
    function allowed(d) {
      const value = iso(d); if (d.getFullYear() < 1 || d.getFullYear() > 9999 || input.min && value < input.min || input.max && value > input.max) return false;
      const step = input.step === 'any' ? 1 : Number(input.step || 1), base = parse(input.min) || parse(input.defaultValue) || date(1970, 0, 1);
      return !(step > 1) || Math.abs((dayNumber(d) - dayNumber(base)) / step - Math.round((dayNumber(d) - dayNumber(base)) / step)) < 1e-7;
    }
    function clampDay(d) {
      const min = parse(input.min), max = parse(input.max);
      return min && d < min ? min : max && d > max ? max : d;
    }
    function position() {
      const rect = trigger.getBoundingClientRect(), width = Math.min(288, innerWidth - 32);
      popup.style.width = width + 'px'; popup.style.left = Math.max(16, Math.min(rect.left, innerWidth - width - 16)) + 'px';
      const height = popup.offsetHeight, above = rect.bottom + height + 16 > innerHeight && rect.top > innerHeight - rect.bottom;
      popup.style.top = Math.max(8, above ? rect.top - height - 8 : Math.min(rect.bottom + 8, innerHeight - height - 8)) + 'px';
      popup.style.maxHeight = Math.max(120, innerHeight - 16) + 'px'; popup.dataset.side = above ? 'top' : 'bottom';
    }
    function render(focusDay = false) {
      const first = date(view.getFullYear(), view.getMonth(), 1), selected = input.value, today = iso(new Date());
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + i), value = iso(d), isSelected = value === selected;
        cells.push(`<div role="gridcell" aria-selected="${isSelected}"><button type="button" data-date="${value}" aria-label="${fullDate.format(d)}" ${value === today ? 'aria-current="date"' : ''} ${d.getMonth() !== first.getMonth() ? 'class="outside-month"' : ''} ${allowed(d) ? '' : 'disabled'} tabindex="${value === iso(cursor) ? 0 : -1}">${d.getDate()}</button></div>`);
      }
      const previous = date(first.getFullYear(), first.getMonth(), 0), next = date(first.getFullYear(), first.getMonth() + 1, 1);
      popup.innerHTML = `<div class="calendar-heading"><button type="button" data-month="-1" aria-label="Mês anterior" ${previous.getFullYear() < 1 || input.min && iso(previous) < input.min ? 'disabled' : ''}>${icon('m15 6-6 6 6 6')}</button><span id="${popup.id}-month" aria-live="polite">${months.format(first)}</span><button type="button" data-month="1" aria-label="Próximo mês" ${next.getFullYear() > 9999 || input.max && iso(next) > input.max ? 'disabled' : ''}>${icon('m9 6 6 6-6 6')}</button></div><div role="grid" aria-labelledby="${popup.id}-month"><div class="calendar-weekdays" role="row">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<span role="columnheader">${day}</span>`).join('')}</div>${Array.from({length: 6}, (_, week) => `<div class="calendar-week" role="row">${cells.slice(week * 7, week * 7 + 7).join('')}</div>`).join('')}</div>`;
      position();
      if (focusDay) (popup.querySelector('[tabindex="0"]:not(:disabled)') || popup.querySelector('[data-date]:not(:disabled)'))?.focus({preventScroll: true});
    }
    function close(restore = false) { if (popup.matches(':popover-open')) popup.hidePopover(); if (restore) trigger.focus({preventScroll: true}); }
    trigger.addEventListener('click', () => {
      if (popup.matches(':popover-open')) return close();
      cursor = clampDay(parse(input.value) || date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())); view = date(cursor.getFullYear(), cursor.getMonth(), 1);
      popup.showPopover(); active = {input, popup, close, position}; render(true);
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); if (!popup.matches(':popover-open')) trigger.click(); }
      if (['Delete', 'Backspace'].includes(event.key) && !input.required && !input.readOnly && !input.disabled) {
        event.preventDefault(); input.value = ''; refresh(); input.dispatchEvent(new Event('input', {bubbles: true})); input.dispatchEvent(new Event('change', {bubbles: true}));
      }
    });
    popup.addEventListener('click', event => {
      const b = event.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.month) { view = date(view.getFullYear(), view.getMonth() + Number(b.dataset.month), 1); const step = b.dataset.month; render(); popup.querySelector(`[data-month="${step}"]`)?.focus(); return; }
      if (!b.dataset.date || input.disabled || input.readOnly) return;
      input.value = b.dataset.date; refresh(); close(true);
      input.dispatchEvent(new Event('input', {bubbles: true})); input.dispatchEvent(new Event('change', {bubbles: true}));
    });
    popup.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      const current = parse(event.target.dataset.date); if (!current) return;
      let next;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) next = date(current.getFullYear(), current.getMonth(), current.getDate() + ({ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7})[event.key]);
      if (event.key === 'Home' || event.key === 'End') next = date(current.getFullYear(), current.getMonth(), current.getDate() + (event.key === 'Home' ? -current.getDay() : 6 - current.getDay()));
      if (event.key === 'PageUp' || event.key === 'PageDown') {
        const month = current.getMonth() + (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1), last = date(current.getFullYear(), month + 1, 0).getDate();
        next = date(current.getFullYear(), month, Math.min(current.getDate(), last));
      }
      if (!next) return; event.preventDefault(); next = clampDay(next);
      if (!allowed(next)) return;
      cursor = next; view = date(next.getFullYear(), next.getMonth(), 1); render(true);
    });
    popup.addEventListener('toggle', event => { trigger.setAttribute('aria-expanded', String(event.newState === 'open')); if (event.newState === 'closed' && active?.popup === popup) active = null; });
    popup.addEventListener('focusout', event => { if (event.relatedTarget && !popup.contains(event.relatedTarget) && event.relatedTarget !== trigger) close(); });
    input.addEventListener('input', refresh); input.addEventListener('change', refresh); input.addEventListener('focus', () => trigger.focus());
    for (const label of input.labels || []) label.addEventListener('click', event => { if (event.target === label) {event.preventDefault(); trigger.focus();} });
    wrapper.append(trigger, popup); controls.set(input, {refresh}); refresh();
  }
  function scan(root = document) {
    if (root.matches?.('input[type="date"]')) enhance(root);
    root.querySelectorAll?.('input[type="date"]').forEach(enhance);
  }
  function start() {
    scan();
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') controls.get(record.target)?.refresh();
        else record.addedNodes.forEach(node => { if (node.nodeType === 1) scan(node); });
      }
      if (active && !active.input.isConnected) {active.close(); active = null;}
    }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'min', 'max', 'value', 'required', 'readonly']});
    window.addEventListener('resize', () => active?.position());
    document.addEventListener('scroll', event => { if (active && !active.popup.contains(event.target)) active.position(); }, true);
    document.addEventListener('reset', event => requestAnimationFrame(() => event.target.querySelectorAll('input[type="date"]').forEach(input => controls.get(input)?.refresh())));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return {scan};
})();
