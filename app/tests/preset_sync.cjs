const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the actual async handlers with controlled API responses; no DOM is
// needed for these state transitions. Browser rendering remains a separate gate.
const source = fs.readFileSync(path.join(__dirname, '../mockaize/web/studio.js'), 'utf8');
const handlers = source.slice(source.indexOf(' async function publishSnapshot('), source.indexOf(' function stable('))
  + source.slice(source.indexOf(' async function recoverPending('), source.indexOf(' function remember(){'));
assert.ok(handlers.includes('async function recoverPending'));

function context() {
  const meta = {id: 'variation'};
  return vm.createContext({
    state: {configId: 'variation', draft: {content: 'sent', revision: 7, fileIndex: 2}},
    StudioApi: {}, workspace: () => ({configs: [meta]}),
    contentFingerprint: draft => draft.content,
    renderSaved() {}, renderNav() {}, refreshDirty() {}, toast() {},
  });
}

(async () => {
  const ctx = context();
  vm.runInContext(handlers, ctx);
  const failure = Object.assign(new Error('disk failure'), {
    synchronization: {pending: true, committed: true, revision: 8},
  });
  ctx.StudioApi.publish = async () => {throw failure;};
  await assert.rejects(vm.runInContext('publishSnapshot({xml:"<R/>"})', ctx), error => error === failure);
  assert.equal(ctx.state.syncPending, failure.synchronization);
  assert.equal(ctx.state.draft.revision, 8);

  // Recovery must not rebase a stale tab on a different remote edit.
  ctx.StudioApi.recover = async () => ({content: 'other tab', revision: 9, fileIndex: 4});
  assert.equal(await vm.runInContext('recoverPending()', ctx), false);
  assert.equal(ctx.state.draft.revision, 8);
  assert.equal(ctx.state.draft.content, 'sent');
  assert.equal(ctx.state.syncPending, null);

  ctx.state.syncPending = failure.synchronization;
  ctx.state.syncFingerprint = 'sent';
  ctx.state.draft.content = 'edited while pending';
  ctx.StudioApi.recover = async () => ({content: 'sent', revision: 8, fileIndex: 3});
  assert.equal(await vm.runInContext('recoverPending()', ctx), true);
  assert.equal(ctx.state.savedFingerprint, 'sent');
  assert.equal(ctx.state.draft.content, 'edited while pending');
  assert.equal(ctx.state.draft.fileIndex, 3);
  console.log('preset sync state transitions PASS');
})().catch(error => {console.error(error); process.exitCode = 1;});
