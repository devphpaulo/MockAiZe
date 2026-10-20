/* Keep native select semantics and events; only customize the displayed value. */
(() => {
  'use strict';
  if (!CSS.supports('appearance', 'base-select') || !('HTMLSelectedContentElement' in window)) return;
  function enhance(root) {
    const selects = root.matches?.('select') ? [root] : root.querySelectorAll?.('select') || [];
    for (const select of selects) {
      if (select.hasAttribute('data-custom-combobox') || select.multiple || select.hasAttribute('size') || select.querySelector(':scope > button')) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'select-value-button';
      button.append(document.createElement('selectedcontent'));
      select.prepend(button);
    }
  }
  enhance(document);
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
    }
  }).observe(document.body, {childList:true, subtree:true});
})();
