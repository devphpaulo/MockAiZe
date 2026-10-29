/* The list and XML views edit one local draft; only Apply changes the configuration. */
globalThis.PresenceEditor = (() => {
  'use strict';
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount(root, {nodes, policies, pinned, xmlMarkup, onViewChange}) {
    const visible = nodes.slice(0, 5000), byKey = new Map(visible.map(node => [node.key, node]));
    const draft = new Map(visible.map(node => [node.key, {...{requirement: 'inherit', include: true, distribution: 'all'}, ...policies[node.key]}]));
    let view = 'list';
    const template = document.createElement('template'); template.innerHTML = xmlMarkup;
    const seen = new Set();
    const xmlRows = [...template.content.querySelectorAll('.xml-row')].map(row => {
      const annotation = row.dataset.rowKey || '', key = row.dataset.key || (annotation.startsWith('@open:') ? annotation.slice(6) : null);
      const node = key && byKey.get(key), hasControls = node && !seen.has(key);
      if (hasControls) seen.add(key);
      return {node: hasControls ? node : null, code: row.querySelector('.xml-code')?.innerHTML || '', line: row.querySelector('.line-number')?.textContent || ''};
    });
    function policy(node) {
      const value = draft.get(node.key), fixed = pinned(node.key);
      return {...value, include: fixed || value.requirement !== 'optional' ? true : value.include !== false,
        distribution: fixed || value.requirement !== 'optional' ? 'all' : value.distribution};
    }
    function controls(node) {
      const p = policy(node), fixed = pinned(node.key), enabled = p.requirement === 'optional' && !fixed;
      return `<div role="cell"><select data-presence-choice aria-label="Presença ${h(node.display)}">${[['inherit','Padrão do modelo'],['required','Obrigatório'],['optional','Opcional']].map(([value,label])=>`<option value="${value}" ${p.requirement===value?'selected':''}>${label}</option>`).join('')}</select></div><div role="cell"><select data-presence-spread aria-label="Distribuição ${h(node.display)}" ${enabled&&p.include?'':'disabled'}><option value="all" ${p.distribution!=='alternate'?'selected':''}>Em todos os registros</option><option value="alternate" ${p.distribution==='alternate'?'selected':''}>Intercalar por registro</option></select></div><div role="cell"><label class="presence-table-include"><input type="checkbox" data-presence-enabled aria-label="Incluir ${h(node.display)}" ${p.include?'checked':''} ${enabled?'':'disabled'}><span>Incluir</span></label></div>`;
    }
    function listRow(node) {
      return `<div class="presence-edit-row" role="row" data-presence-key="${h(node.key)}"><div class="presence-node-info" role="cell"><strong>${h(node.name)}</strong><span class="hint">${node.node.nodeType===2?'Atributo':node.isGroup?'Grupo':'Campo'}${pinned(node.key)?' · estrutura mantida':''}</span><div class="presence-path">${h(node.display)}</div></div>${controls(node)}</div>`;
    }
    function xmlRow(row) {
      return `<div class="presence-edit-row presence-xml-row ${row.node?'':'presence-xml-structure'}" role="row" ${row.node?`data-presence-key="${h(row.node.key)}"`:''}><div class="presence-code-cell" role="cell"><span class="presence-line-number" aria-hidden="true">${h(row.line)}</span><code>${row.code}</code></div>${row.node?controls(row.node):'<div role="cell"></div><div role="cell"></div><div role="cell"></div>'}</div>`;
    }
    function render() {
      const oldScroll = root.querySelector('.presence-table-scroll'), top = oldScroll?.scrollTop || 0;
      root.classList.toggle('presence-view-xml', view === 'xml');
      root.innerHTML = `<div class="presence-view-toolbar"><p class="hint">${visible.length} campos e grupos${nodes.length>5000?' · exibindo os primeiros 5.000':''}</p><button type="button" class="small" data-presence-view aria-pressed="${view==='xml'}">${view==='xml'?'Ver lista':'Ver XML colorido'}</button></div><div class="presence-table-scroll" tabindex="0" aria-label="Campos e opções de presença"><div class="presence-table" role="table" aria-label="Presença dos campos e grupos"><div class="presence-table-head" role="row"><span role="columnheader">${view==='xml'?'XML de saída':'Campo ou grupo'}</span><span role="columnheader">Presença</span><span role="columnheader">Distribuição</span><span role="columnheader">Incluir</span></div><div role="rowgroup">${view==='xml'?xmlRows.map(xmlRow).join(''):visible.map(listRow).join('')}</div></div></div>`;
      root.querySelector('.presence-table-scroll').scrollTop = top;
      root.querySelector('[data-presence-view]').onclick = () => {view = view === 'xml' ? 'list' : 'xml'; render(); onViewChange?.(view); root.querySelector('[data-presence-view]').focus({preventScroll: true});};
    }
    root.addEventListener('change', event => {
      const target = event.target, row = target.closest('[data-presence-key]'); if (!row) return;
      const node = byKey.get(row.dataset.presenceKey), p = draft.get(node.key);
      if (target.hasAttribute('data-presence-choice')) {p.requirement = target.value; if (p.requirement !== 'optional' || pinned(node.key)) p.include = true;}
      else if (target.hasAttribute('data-presence-spread')) p.distribution = target.value;
      else if (target.hasAttribute('data-presence-enabled')) p.include = target.checked;
      else return;
      const next = policy(node), include = row.querySelector('[data-presence-enabled]'), spread = row.querySelector('[data-presence-spread]');
      include.checked = next.include; include.disabled = next.requirement !== 'optional' || pinned(node.key);
      spread.disabled = include.disabled || !include.checked; spread.value = next.distribution;
    });
    render();
    return {policies() {
      const result = structuredClone(policies);
      for (const node of visible) {
        const p = policy(node);
        if (p.requirement === 'inherit') delete result[node.key];
        else result[node.key] = {requirement: p.requirement, include: p.include, distribution: p.distribution};
      }
      return result;
    }};
  }
  return {mount};
})();
