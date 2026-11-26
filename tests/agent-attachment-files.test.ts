import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agentAttachmentMime, planAgentAttachments } from '../src/lib/agent-attachment-files.ts'

const mb = 1024 * 1024
const limits = { maxFiles: 8, maxFileBytes: 20 * mb, maxImageBytes: 10 * mb }
function file(path: string, size = 100, type = ''): File {
  const result = new File(['fixture'], path.split('/').at(-1)!, { type })
  Object.defineProperty(result, 'size', { value: size })
  Object.defineProperty(result, 'webkitRelativePath', { value: path })
  return result
}

test('a selected folder stages all six reference files in stable path order', () => {
  const input = [
    file('Folder A/harga tua batch 1.jpeg'), file('Folder A/bb tua batch 2.jpeg'),
    file('Folder A/bb muda gabungan batch.jpeg'), file('Folder A/harga muda batch 2.jpeg'),
    file('Folder A/bb tua batch 1.jpeg'), file('Folder A/harga muda batch 1.jpeg'),
  ]
  const result = planAgentAttachments(input, 'folder', [], limits)
  assert.equal(result.error, null); assert.equal(result.folderName, 'Folder A'); assert.equal(result.files.length, 6)
  assert.equal(new Set(result.files).size, 6); assert.ok(input.every(item => result.files.includes(item)))
  assert.equal(input[0].name, 'harga tua batch 1.jpeg', 'selection does not mutate the browser file list')
  assert.deepEqual(result.files.map(item => item.name), [...result.files.map(item => item.name)].sort((a, b) => a.localeCompare(b, 'id', { numeric: true })))
})

test('subfolder images and PDFs are retained while hidden/system and unsupported files are excluded', () => {
  const result = planAgentAttachments([
    file('Folder A/buyback/acuan.JPG'), file('Folder A/penjualan/acuan.pdf'),
    file('Folder A/.DS_Store'), file('Folder A/__MACOSX/._acuan.JPG'), file('Folder A/.arsip/rahasia.png'),
    file('Folder A/catatan.xlsx'), file('Folder A/catatan.txt'),
  ], 'folder', [], limits)
  assert.equal(result.error, null)
  assert.deepEqual(result.files.map(item => item.webkitRelativePath), ['Folder A/buyback/acuan.JPG', 'Folder A/penjualan/acuan.pdf'])
  assert.deepEqual(result.skipped, ['Folder A/catatan.xlsx', 'Folder A/catatan.txt'])
  assert.equal(agentAttachmentMime(result.files[0]), 'image/jpeg'); assert.equal(agentAttachmentMime(result.files[1]), 'application/pdf')
})

test('folder limits include existing pending attachments and never truncate a selection', () => {
  const input = Array.from({ length: 6 }, (_, i) => file(`Folder A/${i}.png`))
  assert.equal(planAgentAttachments(input, 'folder', [{ mime: 'application/pdf', size: 1 }, { mime: 'image/png', size: 1 }], limits).files.length, 6)
  const tooMany = planAgentAttachments(input, 'folder', Array.from({ length: 3 }, () => ({ mime: 'application/pdf', size: 1 })), limits)
  assert.match(tooMany.error!, /Maksimal 8/); assert.deepEqual(tooMany.files, [])
  assert.deepEqual(planAgentAttachments(Array.from({ length: 9 }, (_, i) => file(`A/${i}.pdf`)), 'folder', [], limits).files, [])
})

test('image size limits count files with an empty browser MIME and already pending images', () => {
  const result = planAgentAttachments([file('A/acuan.JPEG', 6 * mb)], 'folder', [{ mime: 'image/png', size: 5 * mb }], limits)
  assert.match(result.error!, /Total ukuran gambar maksimal 10 MB/); assert.deepEqual(result.files, [])
  assert.equal(planAgentAttachments([file('A/acuan.PDF', 15 * mb)], 'folder', [], limits).error, null)
})

test('one oversized or empty supported file prevents all files in the folder from uploading', () => {
  for (const size of [0, 21 * mb]) {
    const result = planAgentAttachments([file('A/valid.pdf'), file('A/invalid.pdf', size)], 'folder', [], limits)
    assert.match(result.error!, /Setiap file/); assert.deepEqual(result.files, [])
  }
})

test('empty or unsupported-only folders produce a useful error; individual file selection stays strict', () => {
  for (const input of [[], [file('A/a.xlsx')], [file('A/.DS_Store')]]) {
    const result = planAgentAttachments(input, 'folder', [], limits)
    assert.match(result.error!, /tidak berisi gambar atau PDF/); assert.deepEqual(result.files, [])
  }
  const mixed = planAgentAttachments([file('a.png'), file('a.txt')], 'files', [], limits)
  assert.match(mixed.error!, /Format didukung/); assert.deepEqual(mixed.files, [])
})

test('identical basenames in different subfolders remain separate files and user file order is preserved', () => {
  const a = file('A/buyback/batch1.jpeg'), b = file('A/penjualan/batch1.jpeg')
  const folder = planAgentAttachments([a, b], 'folder', [], limits)
  assert.equal(folder.files.length, 2); assert.notEqual(folder.files[0], folder.files[1])
  assert.deepEqual(planAgentAttachments([b, a], 'files', [], limits).files, [b, a])
})
