/* Editor presentation, scroll positions and resize handles. Preferences live in SQLite. */
globalThis.StudioLayout = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function create({ preferences = {}, save, redraw, closeInspector, notify }) {
    const prefs = { sidebarWidth: 224, inspectorWidth: 320, editorMode: 'panel', syncScroll: false, ...preferences };
    let saveTimer, frame, dragging = null, presented = false;
    const expectedScroll = new WeakMap();
    const scheduleDraw = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(redraw); };
    const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => save({ ...prefs }).catch(error => notify(error.message)), 250); };
    function widths() {
      if (innerWidth > 850) {
        prefs.sidebarWidth = clamp(prefs.sidebarWidth, 192, Math.max(192, Math.floor(Math.min(448, innerWidth - 672) / 8) * 8));
        prefs.inspectorWidth = clamp(prefs.inspectorWidth, 272, Math.max(272, Math.floor(Math.min(720, innerWidth - prefs.sidebarWidth - 400) / 8) * 8));
      }
      document.documentElement.style.setProperty('--sidebar-width', `${prefs.sidebarWidth}px`);
      document.documentElement.style.setProperty('--inspector-width', `${prefs.inspectorWidth}px`);
      for (const [id, value] of [['sidebarResize', prefs.sidebarWidth], ['inspectorResize', prefs.inspectorWidth]]) $(id).setAttribute('aria-valuenow', String(value));
      scheduleDraw();
    }
    function resize(which, value, commit = true) {
      const min = which === 'sidebar' ? 192 : 272;
      const available = which === 'sidebar' ? innerWidth - prefs.inspectorWidth - 400 : innerWidth - prefs.sidebarWidth - 400;
      const max = Math.max(min, Math.min(which === 'sidebar' ? 448 : 720, available));
      prefs[`${which}Width`] = clamp(Math.round(value / 8) * 8, min, max);
      widths(); if (commit) persist();
    }
    for (const [id, which] of [['sidebarResize', 'sidebar'], ['inspectorResize', 'inspector']]) {
      const handle = $(id);
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault(); handle.setPointerCapture(event.pointerId);
        dragging = { which, x: event.clientX, width: prefs[`${which}Width`] };
        document.body.classList.add('resizing-panels');
      });
      handle.addEventListener('pointermove', event => {
        if (!dragging || dragging.which !== which) return;
        resize(which, dragging.width + (event.clientX - dragging.x) * (which === 'sidebar' ? 1 : -1), false);
      });
      const finish = () => { if (!dragging) return; dragging = null; document.body.classList.remove('resizing-panels'); persist(); };
      handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
      handle.addEventListener('lostpointercapture', finish);
      handle.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const direction = (event.key === 'ArrowRight' ? 1 : -1) * (which === 'sidebar' ? 1 : -1);
        const value = event.key === 'Home' ? (which === 'sidebar' ? 192 : 272) : event.key === 'End' ? (which === 'sidebar' ? 448 : 720) : prefs[`${which}Width`] + direction * (event.shiftKey ? 32 : 8);
        resize(which, value);
      });
      handle.addEventListener('dblclick', () => resize(which, which === 'sidebar' ? 224 : 320));
    }
    function controls() {
      const toggle = $('editorModalMode'); if (toggle) toggle.checked = prefs.editorMode === 'modal';
      const sync = $('syncScroll');
      sync.setAttribute('aria-pressed', String(prefs.syncScroll));
      sync.title = prefs.syncScroll ? 'Rolagem sincronizada. Clique para rolar os XMLs separadamente.' : 'Sincronizar a rolagem dos dois XMLs';
      sync.classList.toggle('active', prefs.syncScroll);
    }
    function captureScroll() {
      return Object.fromEntries(['inputCode', 'outputCode'].map(id => {
        const element = $(id); if (!element) return [id, null];
        const rect = element.getBoundingClientRect();
        const row = [...element.querySelectorAll('.xml-row')].find(row => row.getBoundingClientRect().bottom > rect.top);
        return [id, { top: element.scrollTop, left: element.scrollLeft, anchor: row?.dataset.rowKey,
          offset: row ? row.getBoundingClientRect().top - rect.top : 0 }];
      }));
    }
    function restoreScroll(positions) {
      if (!positions) return;
      for (const id of ['inputCode', 'outputCode']) {
        const element = $(id), position = positions[id]; if (!element || !position) continue;
        const anchor = position.anchor && [...element.querySelectorAll('.xml-row')].find(row => row.dataset.rowKey === position.anchor);
        const top = anchor ? element.scrollTop + anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - position.offset : position.top;
        element.scrollTop = top; element.scrollLeft = position.left;
        expectedScroll.set(element, element.scrollTop);
      }
      scheduleDraw();
    }
    function alignTo(origin, destination) {
      if (!origin || !destination) return;
      destination.scrollTop = origin.scrollTop;
      expectedScroll.set(destination, destination.scrollTop);
    }
    function bindScroll() {
      for (const [id, other] of [['inputCode', 'outputCode'], ['outputCode', 'inputCode']]) {
        const element = $(id); if (!element) continue;
        element.addEventListener('scroll', () => {
          const expected = expectedScroll.get(element); expectedScroll.delete(element);
          if (prefs.syncScroll && (expected === undefined || Math.abs(expected - element.scrollTop) > 1)) alignTo(element, $(other));
          scheduleDraw();
        }, { passive: true });
      }
    }
    $('syncScroll').addEventListener('click', () => {
      prefs.syncScroll = !prefs.syncScroll;
      if (prefs.syncScroll) alignTo($('inputCode'), $('outputCode'));
      controls(); persist(); scheduleDraw();
    });
    function present(open) {
      presented = open; const modal = prefs.editorMode === 'modal';
      const dialog = $('inspectorDialog'), pane = $('inspector'), dock = $('inspectorDock');
      const host = modal ? $('inspectorModalHost') : dock;
      if (pane.parentElement !== host) host.append(pane);
      dock.hidden = !open || modal; pane.hidden = !open;
      $('workArea').classList.toggle('inspector-closed', !open || modal);
      if (modal && open && !dialog.open) dialog.showModal();
      if ((!modal || !open) && dialog.open) dialog.close();
      const title = pane.querySelector('.inspector-title');
      if (title && !title.querySelector('[data-action="editor-presentation"]')) {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'ghost presentation-button'; button.dataset.action = 'editor-presentation';
        button.title = modal ? 'Acoplar ao painel lateral' : 'Abrir em uma janela modal'; button.setAttribute('aria-label', button.title);
        button.innerHTML = modal ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>' : '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8h8v8M8 16l8-8"/></svg>';
        title.insertBefore(button, title.lastElementChild);
      }
      controls(); scheduleDraw();
    }
    $('inspectorDialog').addEventListener('click',event=>{const d=$('inspectorDialog');if(event.target!==d)return;const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeInspector();});
    $('inspectorDialog').addEventListener('cancel', event => { event.preventDefault(); closeInspector(); });
    $('inspectorDialog').addEventListener('close', () => { if (presented && prefs.editorMode === 'modal') closeInspector(); });
    function setMode(mode) { prefs.editorMode = mode; controls(); persist(); }
    window.addEventListener('resize', widths);
    widths(); controls();
    return { prefs, controls, captureScroll, restoreScroll, bindScroll, present, setMode, scheduleDraw };
  }
  function drawConnections({ rules, sourceFor, selectedKey, drag }) {
    const svg = $('connections'), bounds = $('codePair').getBoundingClientRect(); svg.replaceChildren();
    $('connectionCount').textContent = '0';
    const rail = $('connectionRail').getBoundingClientRect(), input = $('inputCode'), output = $('outputCode');
    if (!input || !output || innerWidth <= 850) return;
    const aBox = input.getBoundingClientRect(), bBox = output.getBoundingClientRect();
    const top = Math.max(aBox.top, bBox.top) + 8, bottom = Math.min(aBox.bottom, bBox.bottom) - 8;
    if (bottom <= top) return;
    const ports = { input: new Map(), output: new Map() };
    for (const port of document.querySelectorAll('.port')) ports[port.dataset.side].set(port.dataset.field, port);
    const point = port => { const r = port.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; };
    const links = [];
    for (const [target, rule] of Object.entries(rules)) {
      const source = sourceFor(rule), a = ports.input.get(source), b = ports.output.get(target); if (!a || !b) continue;
      const start = point(a), end = point(b);
      links.push({ target, source, a: start, b: end, clippedA: start.y < top || start.y > bottom, clippedB: end.y < top || end.y > bottom });
    }
    for (const side of ['a', 'b']) {
      for (const above of [true, false]) {
        const clipped = links.filter(link => above ? link[side].y < top : link[side].y > bottom).sort((a, b) => a[side].y - b[side].y || a.target.localeCompare(b.target));
        const step = Math.min(8, (bottom - top) / Math.max(4, clipped.length * 4));
        clipped.forEach((link, index) => { link[side].y = above ? top + index * step : bottom - (clipped.length - index - 1) * step; });
      }
    }
    links.sort((a, b) => a.b.y - b.b.y || a.a.y - b.a.y || a.target.localeCompare(b.target));
    const svgNS = 'http://www.w3.org/2000/svg';
    function appendPath(d, active, label, dashed = false) {
      const path = document.createElementNS(svgNS, 'path'); path.setAttribute('d', d);
      path.setAttribute('class', `connection${active ? ' active' : ''}${dashed ? ' clipped' : ''}`);
      const title = document.createElementNS(svgNS, 'title'); title.textContent = label; path.append(title); svg.append(path);
    }
    links.forEach((link, index) => {
      const lane = rail.left + 12 + (rail.width - 24) * (index + 1) / (links.length + 1);
      const ax = clamp(link.a.x, aBox.right - 40, aBox.right - 8), bx = clamp(link.b.x, bBox.left + 8, bBox.left + 48);
      const ay = link.a.y - bounds.top, by = link.b.y - bounds.top, x = lane - bounds.left;
      const startX = ax - bounds.left, endX = bx - bounds.left;
      const route = Math.abs(by - ay) < 8
        ? `M${startX},${ay} C${x},${ay} ${x},${by} ${endX},${by}`
        : `M${startX},${ay} C${startX + 8},${ay} ${x},${ay} ${x},${ay + (by >= ay ? 4 : -4)} L${x},${by - (by >= ay ? 4 : -4)} C${x},${by} ${endX - 8},${by} ${endX},${by}`;
      appendPath(route, link.target === selectedKey, `${MockXml.display(link.source)} → ${MockXml.display(link.target)}`, link.clippedA || link.clippedB);
      for (const [clipped, xPoint, y] of [[link.clippedA, startX, ay], [link.clippedB, endX, by]]) {
        if (!clipped) continue; const marker = document.createElementNS(svgNS, 'circle');
        marker.setAttribute('cx', xPoint); marker.setAttribute('cy', y); marker.setAttribute('r', '3'); marker.setAttribute('class', 'connection-edge'); svg.append(marker);
      }
    });
    $('connectionCount').textContent = String(links.length);
    $('connectionCount').title = `${links.length} vínculo(s). Linhas tracejadas continuam fora da área visível.`;
    if (drag?.moved) {
      const origin = ports.input.get(drag.key); if (!origin) return; const start = point(origin);
      appendPath(`M${start.x - bounds.left},${clamp(start.y, top, bottom) - bounds.top} L${drag.x - bounds.left},${drag.y - bounds.top}`, true, 'Novo vínculo');
    }
  }
  return { create, drawConnections };
})();
