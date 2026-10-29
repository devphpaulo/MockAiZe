/* Named return templates. The active model mirrors the legacy fields used by the editor. */
globalThis.ReturnModels = (() => {
  'use strict';
  const clone = value => structuredClone(value);
  function current(draft) { return draft.returnModels.find(model => model.id === draft.activeReturnId); }
  function capture(draft) {
    const model = current(draft);
    if (!model) return;
    Object.assign(model, {
      outputXml: draft.outputTemplate || '', outputGroup: draft.outputGroup || '',
      rules: clone(draft.rulesByMode.return), presence: clone(draft.presenceByMode.return),
      filename: clone(draft.filenameByMode.return), outputNotes: clone(draft.outputNotesByMode.return),
      headers: clone(draft.headersByMode.return)
    });
  }
  function activate(draft, id) {
    const model = draft.returnModels.find(item => item.id === id);
    if (!model) throw Error('Retorno não encontrado.');
    draft.activeReturnId = model.id;
    draft.outputTemplate = model.outputXml;
    draft.outputGroup = model.outputGroup;
    draft.rulesByMode.return = clone(model.rules);
    draft.presenceByMode.return = clone(model.presence);
    draft.filenameByMode.return = clone(model.filename);
    draft.outputNotesByMode.return = clone(model.outputNotes);
    draft.headersByMode.return = clone(model.headers);
  }
  function ensure(draft) {
    draft.returnModels ||= [];
    if (!draft.returnModels.length) {
      draft.returnModels.push({id:'return-default',name:'Retorno 1',selected:true});
      draft.activeReturnId = 'return-default';
      capture(draft);
    }
    if (!current(draft)) draft.activeReturnId = draft.returnModels[0].id;
    activate(draft, draft.activeReturnId);
    return draft;
  }
  function validName(draft, name, exceptId) {
    const value = name.trim();
    if (!value || value.length > 120) throw Error('Informe um nome de retorno com até 120 caracteres.');
    if (draft.returnModels.some(model => model.id !== exceptId && model.name.toLocaleLowerCase() === value.toLocaleLowerCase())) throw Error('Já existe um retorno com esse nome.');
    return value;
  }
  function rename(draft, id, name) {
    const model = draft.returnModels.find(item => item.id === id);
    if (!model) throw Error('Retorno não encontrado.');
    model.name = validName(draft, name, id);
  }
  function add(draft, name, id = crypto.randomUUID()) {
    const value = validName(draft, name);
    if (draft.returnModels.length >= 20) throw Error('Cada arquivo aceita até 20 modelos de retorno.');
    capture(draft);
    draft.returnModels.push({id,name:value,selected:true,outputXml:'',outputGroup:'',rules:{},presence:{},filename:{type:'literal',value},outputNotes:{},headers:[]});
    activate(draft, id);
    return id;
  }
  function remove(draft, id) {
    if (draft.returnModels.length === 1) throw Error('Mantenha pelo menos um modelo de retorno.');
    capture(draft);
    const index = draft.returnModels.findIndex(model => model.id === id);
    if (index < 0) throw Error('Retorno não encontrado.');
    draft.returnModels.splice(index, 1);
    if (draft.activeReturnId === id) activate(draft, draft.returnModels[Math.min(index, draft.returnModels.length - 1)].id);
  }
  function forSave(draft) { const copy = {...draft, returnModels: clone(draft.returnModels)}; capture(copy); return copy.returnModels; }
  function selected(draft) { return forSave(draft).filter(model => model.selected); }
  function configuration(draft, model) {
    return {...draft,mode:'return',outputTemplate:model.outputXml,outputGroup:model.outputGroup,
      rules:model.rules,presence:model.presence,filename:model.filename,
      headersByMode:{...draft.headersByMode,return:model.headers}};
  }
  return {ensure,current,capture,activate,add,remove,rename,validName,forSave,selected,configuration};
})();
