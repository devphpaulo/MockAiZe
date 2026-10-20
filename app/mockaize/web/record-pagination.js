/* Pagination 03: numbered pages with a solid primary active button. */
globalThis.RecordPagination = (() => {
  'use strict';
  const chevron = right => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${right ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'}"/></svg>`;
  function markup(index, count, scope = 'output') {
    const total = Math.max(1, Math.floor(Number(count) || 1));
    const current = Math.max(0, Math.min(total - 1, Math.floor(Number(index) || 0)));
    const start = Math.max(0, Math.min(current - 1, total - 3));
    const page = (number, content, label, disabled = false) => `<li><button type="button" data-record-page="${number}" aria-label="${label}" ${disabled ? 'disabled' : ''} ${number === current && !disabled ? 'aria-current="page"' : ''}>${content}</button></li>`;
    let items = page(current - 1, chevron(false) + '<span>Anterior</span>', 'Registro anterior', current === 0);
    for (let i = start; i < Math.min(total, start + 3); i++) items += page(i, i + 1, `Registro ${i + 1} de ${total}`);
    items += page(current + 1, '<span>Próximo</span>' + chevron(true), 'Próximo registro', current === total - 1);
    return `<nav class="record-pagination" data-record-scope="${scope === 'manual' ? 'manual' : 'output'}" aria-label="Registros · página ${current + 1} de ${total}" data-total="${total}" data-current="${current}" title="Registro ${current + 1} de ${total}"><ul>${items}</ul><span class="pagination-total">${current + 1} de ${total}</span></nav>`;
  }
  function bind(root, navigate) {
    for (const nav of root.querySelectorAll('.record-pagination')) {
      function go(index) {
        const next = Math.max(0, Math.min(Number(nav.dataset.total) - 1, index));
        if (next === Number(nav.dataset.current)) return;
        const scope = nav.dataset.recordScope;
        navigate(next, scope);
        root.querySelector(`.record-pagination[data-record-scope="${scope}"] [aria-current="page"]`)?.focus({preventScroll: true});
      }
      nav.addEventListener('click', event => {
        const button = event.target.closest('button[data-record-page]');
        if (button && !button.disabled) go(Number(button.dataset.recordPage));
      });
      nav.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        go(event.key === 'Home' ? 0 : event.key === 'End' ? Number(nav.dataset.total) - 1 : Number(nav.dataset.current) + (event.key === 'ArrowRight' ? 1 : -1));
      });
    }
  }
  return {markup, bind};
})();
