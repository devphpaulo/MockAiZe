/* SQLite persistence for the generation interface adapted from base/mock-studio.html. */
globalThis.StudioApi = (() => {
  'use strict';
  const token = document.querySelector('meta[name="csrf-token"]').content;
  const clientId = crypto.randomUUID();
  let clientDirty = false, reportedDirty = null;
  async function request(url, { method = 'GET', headers = {}, ...options } = {}) {
    const response = await fetch(url, { credentials: 'same-origin', method,
      headers: { ...headers, ...(method === 'GET' ? {} : { 'X-CSRF-Token': token }) }, ...options });
    if (response.status === 204) return null;
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Erro ${response.status}`);
    return body;
  }
  const json = (url, method, body) => request(url, { method,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  function configFromRecord(record) {
    const config = { inputByMode: {}, inputXml: '', outputXml: '', recordCount: 1, fileName: 'mock',
      manual: {templateXml:'',values:{},confirmed:false,fileName:'',recordCount:1,recordGroup:''}, mode: 'new', inputGroup: '', outputGroup: '', returnSource: 'all', baseDate: '',
      rulesByMode: { new: {}, return: {} }, presenceByMode: { new: {}, return: {} },
      filenameByMode: { new: { type: 'literal', value: 'mock' }, return: { type: 'literal', value: 'mock' } },
      inputNotes: {}, outputNotesByMode: { new: {}, return: {} }, headersByMode: { new: [], return: [] }, ...record.config };
    config.manual={templateXml:'',values:{},confirmed:false,fileName:'',recordCount:1,recordGroup:'',...config.manual};
    config.returnSource = 'all';
    for (const mode of ['new', 'return']) {
      config.rulesByMode[mode] ||= {};
      config.presenceByMode[mode] ||= {};
      if (!config.filenameByMode[mode]?.type) config.filenameByMode[mode] = { type: 'literal', value: config.fileName };
      config.outputNotesByMode[mode] ||= {};
      config.headersByMode[mode] ||= [];
    }
    if (config.rules) config.rulesByMode[config.mode] = config.rules;
    if (config.presence) config.presenceByMode[config.mode] = config.presence;
    if (config.filename) config.filenameByMode[config.mode] = config.filename;
    return ReturnModels.ensure({ ...structuredClone(config), id: record.id, name: record.name,
      sourceTemplate: config.inputXml, outputTemplate: config.outputXml,
      count: config.recordCount, fileIndex: record.file_index, revision: record.revision,
      baseDate: config.baseDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) });
  }
  function configForSave(draft) {
    return { returnModels: ReturnModels.forSave(draft), activeReturnId: draft.activeReturnId, manual: draft.manual || {templateXml:'',values:{},confirmed:false,fileName:'',recordCount:1,recordGroup:''}, inputByMode: draft.inputByMode || {}, inputXml: draft.sourceTemplate, outputXml: draft.outputTemplate,
      recordCount: draft.count, fileName: draft.fileName || 'mock', mode: draft.mode,
      inputGroup: draft.inputGroup, outputGroup: draft.outputGroup, returnSource: draft.returnSource,
      baseDate: draft.baseDate, rulesByMode: draft.rulesByMode,
      presenceByMode: draft.presenceByMode || { new: {}, return: {} },
      filenameByMode: draft.filenameByMode, inputNotes: draft.inputNotes || {},
      outputNotesByMode: draft.outputNotesByMode || { new: {}, return: {} },
      headersByMode: draft.headersByMode || { new: [], return: [] } };
  }
  function navigationBook(library) {
    const nodes=library.nodes,byId=new Map(nodes.map(n=>[n.id,n]));
    const chain=n=>{const result=[];for(let p=byId.get(n.parent_id);p;p=byId.get(p.parent_id))result.unshift(p);return result;};
    return {workspaces:nodes.filter(n=>n.kind==='workspace').map(ws=>({id:ws.id,name:ws.name,configs:nodes.filter(n=>n.kind==='variation'&&chain(n)[0]?.id===ws.id).map(n=>({id:n.id,name:n.name,revision:n.revision,file_index:n.file_index,workspaceId:ws.id,parentId:n.parent_id,applicationId:null,communicationGroupId:null,specificFileId:null,context:chain(n).slice(1).map(p=>p.name).join(' / ')}))}))};
  }
  function report(dirty, force = false) {
    clientDirty = !!dirty;
    if (!force && reportedDirty === clientDirty) return Promise.resolve();
    const sent = clientDirty; reportedDirty = sent;
    return json('/api/lifecycle/report', 'POST', { clientId, dirty: sent }).catch(() => { if(reportedDirty===sent)reportedDirty=null; });
  }
  setInterval(() => report(clientDirty, true), 15000);
  window.addEventListener('pagehide', () => {
    fetch('/api/lifecycle/report', { method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ clientId, dirty: false }) }).catch(() => {});
  });
  async function bootstrap() {
    const [tree, settings] = await Promise.all([request('/api/library'), request('/api/settings')]);
    return { book: navigationBook(tree), library: tree, settings };
  }
  async function select(meta) {
    return json('/api/settings', 'PUT', { lastSelection: { workspaceId: meta.workspaceId,
      applicationId: meta.applicationId, communicationGroupId: meta.communicationGroupId,
      specificFileId: meta.specificFileId, variationId: meta.id } });
  }
  async function save(draft) {
    const record = await json(`/api/variations/${encodeURIComponent(draft.id)}`, 'PUT', {
      expectedRevision: draft.revision, name: draft.name, config: configForSave(draft) });
    return configFromRecord(record);
  }
  async function publish(draft, snapshot) {
    return request(`/api/variations/${encodeURIComponent(draft.id)}/artifacts`, { method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8',
        'X-Expected-Revision': String(draft.revision), 'X-File-Name': encodeURIComponent(snapshot.name) },
      body: snapshot.xml });
  }
  return { bootstrap, select, save, publish, report, configForSave,
    theme: theme => json('/api/settings', 'PUT', { theme }),
    layout: studioLayout => json('/api/settings', 'PUT', { studioLayout }),
    load: async id => configFromRecord(await request(`/api/variations/${encodeURIComponent(id)}`)),
    bundles: draft => json(`/api/variations/${encodeURIComponent(draft.id)}/powershell`, 'POST', { expectedRevision: draft.revision }),
    artifacts: id => request(`/api/variations/${encodeURIComponent(id)}/artifacts`) };
})();
