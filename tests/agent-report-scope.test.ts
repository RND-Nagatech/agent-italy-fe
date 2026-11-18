import assert from 'node:assert/strict'
import test from 'node:test'
import { mentionsAgentSource, resolveAgentReportScope } from '../src/lib/agent-report-scope.ts'

const sources = [
  { alias: 'ITALY PUSAT', branchId: 'PUSAT' },
  { alias: 'ITALY OTISTA', branchId: 'IT2' },
]

test('asks for a store with or without the Italy brand in a sales question', () => {
  for (const prompt of ['penjualan hari ini berapa', 'penjualan italy hari ini berapa']) {
    assert.deepEqual(resolveAgentReportScope(prompt, sources), { needsDate: false, needsSource: true })
  }
})

test('does not mistake part of an ordinary word for a short store code', () => {
  const riSource = { alias: 'ITALY RI', branchId: 'RI' }
  assert.deepEqual(resolveAgentReportScope('penjualan hari ini berapa', [...sources, riSource]), {
    needsDate: false, needsSource: true,
  })
  assert.equal(mentionsAgentSource('hari ini', riSource), false)
  assert.equal(mentionsAgentSource('penjualan RI hari ini', riSource), true)
})

test('recognizes the full store name, short name, and branch code', () => {
  for (const store of ['italy pusat', 'pusat', 'italy otista', 'otista', 'IT2']) {
    assert.deepEqual(resolveAgentReportScope(`penjualan ${store} hari ini berapa`, sources), {
      needsDate: false, needsSource: false,
    })
  }
})

test('the brand alone never identifies a specific store', () => {
  assert.deepEqual(resolveAgentReportScope('penjualan italy hari ini', [{ alias: 'ITALY', branchId: 'PUSAT' }]), {
    needsDate: false, needsSource: true,
  })
})

test('keeps explicit all-store selections and date ranges', () => {
  assert.deepEqual(resolveAgentReportScope('penjualan semua toko 2026-11-01 sampai 2026-11-18', sources), {
    needsDate: false, needsSource: false,
  })
})

test('asks only for the missing scope', () => {
  assert.deepEqual(resolveAgentReportScope('penjualan berapa', sources), { needsDate: true, needsSource: true })
  assert.deepEqual(resolveAgentReportScope('penjualan italy pusat berapa', sources), { needsDate: true, needsSource: false })
})

test('other supported reports also ask for a store', () => {
  for (const prompt of ['pembelian rongsok hari ini', 'otorisasi penjualan hari ini', 'penjualan non cash hari ini']) {
    assert.deepEqual(resolveAgentReportScope(prompt, sources), { needsDate: false, needsSource: true })
  }
})

test('ordinary conversation does not open report filters', () => {
  assert.equal(resolveAgentReportScope('halo bro', sources), null)
})

test('database discovery templates do not ask for report dates or stores', () => {
  for (const prompt of [
    'Tampilkan sumber database aktif yang bisa saya akses, bedakan sumber Pusat dan Cabang serta tampilkan alias dan ID sumbernya.',
    'Daftar nama collection yang tersedia pada sumber database yang bisa saya akses.',
    'Jelaskan struktur field collection tt_jual_detail pada sumber yang bisa saya akses.',
  ]) {
    assert.equal(resolveAgentReportScope(prompt, sources), null)
  }
})
