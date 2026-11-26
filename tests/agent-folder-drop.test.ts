import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captureAgentDrop, readAgentDrop, type AgentDropEntry } from '../src/lib/agent-folder-drop.ts'
import { inspectAgentAttachments, planAgentAttachments } from '../src/lib/agent-attachment-files.ts'

const image = (name: string): AgentDropEntry => ({ name, isFile: true, isDirectory: false, file: resolve => resolve(new File(['fixture'], name, { type: 'image/jpeg', lastModified: 12345 })) })
function folder(name: string, batches: AgentDropEntry[][]): AgentDropEntry {
  return { name, isFile: false, isDirectory: true, createReader: () => {
    const pending = [...batches, []]
    return { readEntries: resolve => resolve(pending.shift() ?? []) }
  } }
}

test('folder drops read every batch and nested reference file, retaining local paths and basenames', async () => {
  const original = image('bb muda.jpeg')
  const entries = [folder('testing', [[original, image('bb tua 1.jpeg')], [image('bb tua 2.jpeg'), folder('harga emas', [[image('muda 1.jpeg')], [image('muda 2.jpeg'), image('tua 1.jpeg')]])]])]
  const files = await readAgentDrop({ entries, files: [], source: 'folder' })
  assert.equal(files.length, 6)
  assert.deepEqual(files.map(file => file.webkitRelativePath), ['testing/bb muda.jpeg', 'testing/bb tua 1.jpeg', 'testing/bb tua 2.jpeg', 'testing/harga emas/muda 1.jpeg', 'testing/harga emas/muda 2.jpeg', 'testing/harga emas/tua 1.jpeg'])
  assert.equal(files[3].name, 'muda 1.jpeg'); assert.equal(files[3].lastModified, 12345); assert.equal(files[3].type, 'image/jpeg')
  const selection = planAgentAttachments(files, 'folder', [], { maxFiles: 8, maxFileBytes: 20 * 1024 * 1024, maxImageBytes: 10 * 1024 * 1024 })
  assert.equal(selection.error, null); assert.equal(selection.folderName, 'testing'); assert.equal(selection.files.length, 6)
})

test('drop entries are captured synchronously before the browser clears the data store', async () => {
  let available = true
  const item = { kind: 'file', webkitGetAsEntry() { assert.equal(available, true); return folder('testing', [[image('acuan.jpeg')]]) } }
  const data = { get items() { assert.equal(available, true); return [item] }, get files() { throw new Error('Do not reread dropped files after capturing entries') } }
  const captured = captureAgentDrop(data as unknown as DataTransfer)
  available = false
  const files = await readAgentDrop(captured)
  assert.equal(captured.source, 'folder'); assert.equal(files[0].webkitRelativePath, 'testing/acuan.jpeg')
})

test('plain file drops and the getAsEntry compatibility alias remain supported', async () => {
  const plain = new File(['pdf'], 'harga.pdf', { type: 'application/pdf' })
  const plainDrop = captureAgentDrop({ items: [{ kind: 'file', getAsFile: () => plain }], files: [] } as unknown as DataTransfer)
  assert.equal(plainDrop.source, 'files'); assert.deepEqual(await readAgentDrop(plainDrop), [plain])
  const alias = captureAgentDrop({ items: [{ kind: 'file', getAsEntry: () => image('a.jpeg') }], files: [] } as unknown as DataTransfer)
  assert.equal((await readAgentDrop(alias))[0].name, 'a.jpeg')
})

test('hidden directories are not traversed and unsupported files are visible as skipped in inspection', async () => {
  const hidden = folder('.secret', [])
  hidden.createReader = () => { throw new Error('Hidden folders must not be opened') }
  const files = await readAgentDrop({ entries: [folder('testing', [[hidden, image('.DS_Store'), image('harga.jpeg'), image('catatan.txt')]])], files: [], source: 'folder' })
  const inspected = inspectAgentAttachments(files, 'folder')
  assert.equal(inspected.files.length, 1); assert.deepEqual(inspected.skipped, ['testing/catatan.txt'])
})

test('read failures and traversal limits abort rather than returning a partial folder', async () => {
  const broken: AgentDropEntry = { name: 'broken', isFile: false, isDirectory: true, createReader: () => ({ readEntries: (_resolve, reject) => reject(new Error('read denied')) }) }
  await assert.rejects(() => readAgentDrop({ entries: [image('valid.jpeg'), broken], files: [], source: 'folder' }), /read denied/)
  await assert.rejects(() => readAgentDrop({ entries: [folder('testing', [[image('one.jpeg'), image('two.jpeg')]])], files: [], source: 'folder' }, 2), /Folder terlalu besar/)
})
