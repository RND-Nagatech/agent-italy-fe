import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dailyBuybackWindows, dailyPriceWindows, isPriceAuditQuery, shouldCheckPriceAttachments, resolveChatPriceScope, readPriceAttachment, type PriceReadStatus, type PriceReference } from '../src/lib/price-audit.ts'
import { exportPriceAuditExcel, exportMarketplaceSalesExcel, exportSalesAuthorizationExcel } from '../src/lib/report-excel.ts'
import { isSalesAuthorizationTable } from '../src/lib/sales-authorization-report.ts'
import ExcelJS from 'exceljs'

test('sales authorization reports export all ordered rows with notes, barcode text, numeric weights and the shared Excel style', async () => {
  const columns = ['Tanggal', 'No. Faktur', 'Barcode', 'Keterangan', 'Deskripsi', 'Berat Awal (gram)', 'Berat (gram)', 'Input oleh']
  assert.equal(isSalesAuthorizationTable(columns),true)
  assert.equal(isSalesAuthorizationTable(['Tanggal','No. Faktur','Barcode','Nama Barang','Total Penjualan (IDR)']),false)
  assert.equal(isSalesAuthorizationTable(['Marketplace','No. Faktur','Otorisasi di Bawah Modal','Keterangan Otorisasi']),false)
  const originalDocument = globalThis.document, originalWindow = globalThis.window, originalCreate = URL.createObjectURL
  let exported: Blob | undefined, filename = ''
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({href:'',set download(value:string){filename=value},click(){},remove(){}}),body:{appendChild(){}}}})
  Object.defineProperty(globalThis,'window',{configurable:true,value:{setTimeout(){}}})
  URL.createObjectURL = blob => { exported = blob as Blob; return 'blob:sales-authorization' }
  try {
    const rows = Array.from({length:24},(_,index)=>['2026-11-25',`FJ-${23-index}`,'00012345',index ? 'Keterangan tidak diisi' : 'Disetujui harga marketplace\nSesuai persetujuan supervisor','PENJUALAN DI BAWAH MODAL',index ? null : 1.75,index ? 0 : 1.71,'SUPERVISOR'])
    await exportSalesAuthorizationExcel({title:'Data ITALY PUSAT',columns,rows})
    assert.ok(exported); assert.match(filename,/^otorisasi-penjualan-data-italy-pusat-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()))
    const sheet = workbook.getWorksheet('Otorisasi Penjualan')!
    assert.equal(workbook.subject,'Laporan otorisasi penjualan'); assert.equal(sheet.getCell('A1').value,'Otorisasi Penjualan — Data ITALY PUSAT')
    assert.deepEqual(sheet.getRow(2).values.slice(1),columns); assert.equal(sheet.rowCount,26); assert.equal(sheet.autoFilter,'A2:H26'); assert.equal(sheet.views[0].ySplit,2)
    assert.equal(sheet.getCell('B3').value,'FJ-23'); assert.equal(sheet.getCell('B26').value,'FJ-0'); assert.equal(sheet.getCell('C3').value,'00012345')
    assert.equal(sheet.getCell('D3').value,rows[0][3]); assert.equal(sheet.getCell('D3').alignment.wrapText,true); assert.equal(sheet.getCell('E3').value,'PENJUALAN DI BAWAH MODAL')
    assert.equal(sheet.getCell('F3').value,1.75); assert.equal(sheet.getCell('G3').value,1.71); assert.equal(sheet.getCell('F4').value,'—'); assert.equal(sheet.getCell('G4').value,0)
    assert.equal((sheet.getCell('A1').fill as {fgColor:{argb:string}}).fgColor.argb,'FF2458C8'); assert.equal((sheet.getCell('A2').fill as {fgColor:{argb:string}}).fgColor.argb,'FFEAF1FB')
    assert.equal((sheet.getCell('A4').fill as {fgColor:{argb:string}}).fgColor.argb,'FFF8FAFD')
  } finally {
    Object.defineProperty(globalThis,'document',{configurable:true,value:originalDocument}); Object.defineProperty(globalThis,'window',{configurable:true,value:originalWindow}); URL.createObjectURL=originalCreate
  }
})

test('opens the price form for audit requests, leaving stock and banking requests alone', () => {
  for (const text of ['saya mau cek transaksi penjualan dan buyback dengan data saya', 'cek harga penjualan dengan file acuan', 'cek harga marketplace sesuai file', 'audit harga online dengan acuan', 'audit harga emas', 'cek buyback', 'tolong cek transaksi buyback dengan file ini', 'cek buy back dengan data saya']) assert.equal(isPriceAuditQuery(text), true, text)
  for (const text of ['jumlah stok saat ini', 'penjualan hari ini', 'cek penjualan transfer dengan mutasi bank', 'kalo italy pusat']) assert.equal(isPriceAuditQuery(text), false, text)
})

test('bullion buyback Excel retains categories, per-weight tariffs, dynamic batches and invoice authorizations', async () => {
  const originalDocument=globalThis.document,originalWindow=globalThis.window,originalCreate=URL.createObjectURL
  let exported:Blob|undefined
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({href:'',download:'',click(){},remove(){}}),body:{appendChild(){}}}})
  Object.defineProperty(globalThis,'window',{configurable:true,value:{setTimeout(){}}})
  URL.createObjectURL=blob=>{exported=blob as Blob;return 'blob:bullion-buyback'}
  try {
    const columns=['Tanggal','Jam WIB','No. Faktur','Nama Barang','Kode Grup','Kategori Acuan','Berat (gram)','Harga Buyback (IDR)','Harga Nota (IDR)','Harga Rata per gram (IDR)','Acuan Batch 1 (IDR/gram)','Selisih Batch 1 (IDR/gram)','Acuan Batch 3 (IDR/gram)','Selisih Batch 3 (IDR/gram)','Batch Acuan','Hasil Pemeriksaan','Keterangan Pemeriksaan','Otorisasi di Atas Nota','Deskripsi Otorisasi','Keterangan Otorisasi','File Acuan']
    const rows=[['2026-11-25','13:07:32','FB-LM-1','ANTAM CERTI EYE RED 2026','LM','ANTAM 2026',0.5,1234567.5,1200000,2460000,2458000,2000,2470000,-10000,'Batch 1','Di luar range acuan','Harga buyback lebih tinggi Rp2.000 dari acuan.','Ada otorisasi','PEMBELIAN DI ATAS NOTA','FB-LM-1: Disetujui supervisor','Buyback LM.png'],['2026-11-25','14:00:00','FB-LM-2','EMASKU','LMM','EMASKU',3,6285000,6000000,2095000,'Tarif belum tersedia','Belum dapat dihitung','Tarif belum tersedia','Belum dapat dihitung','Batch 1','Perlu diperhatikan','Tarif EMASKU 3 gram kosong pada file.','Tidak ditemukan','Tidak ditemukan','Tidak ditemukan otorisasi pembelian di atas nota.','Buyback LM.png']]
    await exportPriceAuditExcel({title:'Audit harga buyback logam mulia',columns,rows});assert.ok(exported)
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()));const sheet=workbook.getWorksheet('Buyback LM')!
    assert.equal(sheet.getCell('A1').value,'Audit harga buyback logam mulia');assert.deepEqual(sheet.getRow(2).values.slice(1),columns);assert.equal(sheet.autoFilter,'A2:U4');assert.equal(sheet.views[0].ySplit,2)
    assert.equal(sheet.getCell('B3').value,'13:07:32');assert.equal(sheet.getCell('F3').value,'ANTAM 2026');assert.equal(sheet.getCell('G3').value,0.5);assert.equal(sheet.getCell('H3').value,1234567.5)
    assert.equal(sheet.getCell('K3').value,2458000);assert.equal(sheet.getCell('L3').value,2000);assert.equal(sheet.getCell('M3').value,2470000);assert.equal(sheet.getCell('N3').value,-10000);assert.match(sheet.getCell('N3').numFmt,/Rp/)
    assert.equal(sheet.getCell('S3').value,'PEMBELIAN DI ATAS NOTA');assert.equal(sheet.getCell('T3').value,'FB-LM-1: Disetujui supervisor');assert.equal(sheet.getCell('K4').value,'Tarif belum tersedia')
    assert.equal((sheet.getCell('P3').font.color as {argb:string}).argb,'FFB73535');assert.equal((sheet.getCell('P4').font.color as {argb:string}).argb,'FF986218')
  } finally {Object.defineProperty(globalThis,'document',{configurable:true,value:originalDocument});Object.defineProperty(globalThis,'window',{configurable:true,value:originalWindow});URL.createObjectURL=originalCreate}
})

test('bullion marketplace Excel distinguishes raw piece tariffs from gram references and retains authorization and overpayment fields',async()=>{
  const originalDocument=globalThis.document,originalWindow=globalThis.window,originalCreate=URL.createObjectURL
  let exported:Blob|undefined
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({href:'',download:'',click(){},remove(){}}),body:{appendChild(){}}}})
  Object.defineProperty(globalThis,'window',{configurable:true,value:{setTimeout(){}}})
  URL.createObjectURL=blob=>{exported=blob as Blob;return 'blob:bullion-marketplace'}
  try{
    const columns=['No. Faktur','Marketplace','Nama Barang','Kategori Acuan','Berat (gram)','Harga Jual (IDR)','Harga Transaksi per gram (IDR)','Satuan Harga File','Dasar Pemeriksaan','Tarif File Batch 1 (IDR)','Acuan Batch 1 (IDR)','Selisih Batch 1 (IDR)','Tarif File Batch 3 (IDR)','Acuan Batch 3 (IDR)','Selisih Batch 3 (IDR)','Hasil Pemeriksaan','Otorisasi di Bawah Modal','Deskripsi Otorisasi','Keterangan Otorisasi','Pengembalian Kelebihan Pembayaran (IDR)']
    const rows=[['J-GIFT','TIKTOK','ANTAM GIFT 2026','Gift',0.5,1425000,2850000,'Per piece','Per gram (harga_gram)',1425000,2850000,0,1430000,2860000,-10000,'Masih dalam batas range acuan','Ada otorisasi','PENJUALAN DI BAWAH MODAL','J-GIFT: Disetujui harga khusus',25000.5],['J-MICRO','TIKTOK','ANTAM MICRO GOLD','Micro Gold',0.1,294000,2940000,'Belum dapat ditentukan','Per gram (harga_gram)','Tarif belum tersedia','Tarif belum tersedia','Belum dapat dihitung','Tarif belum tersedia','Tarif belum tersedia','Belum dapat dihitung','Perlu diperhatikan','Tidak ditemukan','Tidak ditemukan','Tidak ditemukan otorisasi',0]]
    await exportMarketplaceSalesExcel({title:'Audit harga penjualan marketplace logam mulia',columns,rows});assert.ok(exported)
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()));const sheet=workbook.getWorksheet('Penjualan LM')!
    assert.equal(sheet.getCell('A1').value,'Audit harga penjualan marketplace logam mulia');assert.equal(workbook.subject,'Pemeriksaan harga penjualan marketplace');assert.deepEqual(sheet.getRow(2).values.slice(1),columns)
    assert.equal(sheet.autoFilter,'A2:T4');assert.equal(sheet.views[0].ySplit,2);assert.equal(sheet.getCell('D3').value,'Gift');assert.equal(sheet.getCell('H3').value,'Per piece')
    assert.equal(sheet.getCell('J3').value,1425000);assert.equal(sheet.getCell('K3').value,2850000);assert.equal(sheet.getCell('L3').value,0);assert.equal(sheet.getCell('N3').value,2860000);assert.equal(sheet.getCell('O3').value,-10000);assert.match(sheet.getCell('O3').numFmt,/Rp/)
    assert.equal(sheet.getCell('R3').value,'PENJUALAN DI BAWAH MODAL');assert.equal(sheet.getCell('T3').value,25000.5);assert.equal(sheet.getCell('T4').value,0)
    assert.equal((sheet.getCell('P3').font.color as {argb:string}).argb,'FF147A69');assert.equal((sheet.getCell('P4').font.color as {argb:string}).argb,'FF986218')
  }finally{Object.defineProperty(globalThis,'document',{configurable:true,value:originalDocument});Object.defineProperty(globalThis,'window',{configurable:true,value:originalWindow});URL.createObjectURL=originalCreate}
})

test('marketplace price audit Excel retains grades, native prices, deltas, batches and shared styling', async () => {
  const originalDocument = globalThis.document, originalWindow = globalThis.window, originalCreate = URL.createObjectURL
  let exported: Blob | undefined, filename = ''
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ href: '', set download(value: string) { filename = value }, click() {}, remove() {} }), body: { appendChild() {} } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout() {} } })
  URL.createObjectURL = blob => { exported = blob as Blob; return 'blob:marketplace-audit' }
  try {
    const columns = ['Marketplace', 'No. Faktur', 'Kadar Barang', 'Berat (gram)', 'Harga Transaksi per gram (IDR)', 'Acuan Batch 1 (IDR/gram)', 'Selisih Batch 1 (IDR/gram)', 'Acuan Batch 2 (IDR/gram)', 'Selisih Batch 2 (IDR/gram)', 'Batch Acuan', 'Status Pemeriksaan', 'Keterangan Pemeriksaan', 'Lebih Bayar (IDR)', 'Otorisasi di Bawah Modal', 'Keterangan Otorisasi']
    const rows = Array.from({ length: 24 }, (_, index) => ['TIKTOK', `J${23 - index}`, 88, 1.71, index ? 1850000 : 1848000, 1848000, index ? 2000 : 0, 1860000, index ? -10000 : -12000, 'Batch 1', ['Cocok', 'Tidak cocok', 'Belum dapat diperiksa'][index] ?? 'Di luar range acuan', index ? 'Harga lebih tinggi Rp2.000 dari acuan kadar 88.' : 'Harga sesuai acuan kadar 88.', index === 0 ? 25000.5 : index === 2 ? null : 0, index === 1 ? 'Ada otorisasi' : index === 2 ? 'Belum dapat diperiksa' : 'Tidak ditemukan', index === 1 ? 'J22: Disetujui harga promosi marketplace\nPersetujuan tambahan' : index === 2 ? 'Data otorisasi belum dapat dibaca lengkap; periksa kembali.' : 'Tidak ditemukan otorisasi penjualan di bawah modal untuk faktur ini.'])
    await exportMarketplaceSalesExcel({ title: 'Audit harga penjualan marketplace perhiasan', columns, rows })
    assert.ok(exported); assert.match(filename, /^audit-harga-penjualan-marketplace-perhiasan-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()))
    const sheet = workbook.getWorksheet('Penjualan Online')!
    assert.equal(workbook.subject, 'Pemeriksaan harga penjualan marketplace'); assert.equal(sheet.getCell('A1').value, 'Audit harga penjualan marketplace perhiasan')
    assert.deepEqual(sheet.getRow(2).values.slice(1), columns.map(column=>column === 'Lebih Bayar (IDR)' ? 'Pengembalian Kelebihan Pembayaran (IDR)' : column)); assert.equal(sheet.rowCount, 26); assert.equal(sheet.autoFilter, 'A2:O26'); assert.equal(sheet.views[0].ySplit, 2)
    assert.equal(sheet.getCell('B3').value, 'J23'); assert.equal(sheet.getCell('B26').value, 'J0'); assert.equal(sheet.getCell('C3').value, 88); assert.equal(sheet.getCell('D3').value, 1.71)
    assert.equal(sheet.getCell('E3').value, 1848000); assert.equal(sheet.getCell('F3').value, 1848000); assert.equal(sheet.getCell('G3').value, 0); assert.equal(sheet.getCell('G4').value, 2000)
    assert.equal(sheet.getCell('H3').value, 1860000); assert.equal(sheet.getCell('I3').value, -12000); assert.equal(sheet.getCell('I4').value, -10000); assert.match(sheet.getCell('I3').numFmt, /Rp/)
    assert.match(sheet.getCell('F3').numFmt, /Rp/); assert.equal((sheet.getCell('A1').fill as { fgColor: { argb: string } }).fgColor.argb, 'FF2458C8')
    assert.equal((sheet.getCell('K3').font.color as { argb: string }).argb, 'FF147A69'); assert.equal((sheet.getCell('K4').font.color as { argb: string }).argb, 'FFB73535')
    assert.equal(sheet.getCell('K3').value, 'Masih dalam batas range acuan'); assert.equal(sheet.getCell('K4').value, 'Di luar range acuan')
    assert.equal(sheet.getCell('K5').value, 'Perlu diperhatikan'); assert.equal(sheet.getCell('K6').value, 'Di luar range acuan')
    assert.equal((sheet.getCell('K5').font.color as { argb: string }).argb, 'FF986218')
    assert.equal(sheet.getCell('M3').value, 25000.5); assert.equal(sheet.getCell('M4').value, 0); assert.equal(sheet.getCell('M5').value, '—'); assert.match(sheet.getCell('M3').numFmt, /Rp/)
    assert.equal(sheet.getCell('N4').value,'Ada otorisasi'); assert.equal(sheet.getCell('O4').value,'J22: Disetujui harga promosi marketplace\nPersetujuan tambahan');
    assert.equal(sheet.getCell('K4').value,'Di luar range acuan','authorization must not override price audit status');
    assert.equal(sheet.getCell('N3').value,'Tidak ditemukan'); assert.equal(sheet.getCell('N5').value,'Belum dapat diperiksa'); assert.equal(sheet.getCell('O4').alignment.wrapText,true)
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }); Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow }); URL.createObjectURL = originalCreate
  }
})

test('buyback Excel preserves decrypted identity, conditions, range statuses, missing rows and filters', async () => {
  const originalDocument = globalThis.document, originalWindow = globalThis.window, originalCreate = URL.createObjectURL
  let exported: Blob | undefined
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ href: '', download: '', click() {}, remove() {} }), body: { appendChild() {} } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout() {} } })
  URL.createObjectURL = blob => { exported = blob as Blob; return 'blob:buyback' }
  try {
    const columns = ['Kode Intern', 'Kode Acuan', 'Kondisi', 'Berat (gram)', 'Harga Buyback (IDR)', 'Harga Nota (IDR)', 'Harga Rata per gram (IDR)', 'Batas Bawah Acuan per gram (IDR)', 'Batas Atas Acuan per gram (IDR)', 'Status Pemeriksaan', 'Keterangan Pemeriksaan', 'Otorisasi di Atas Nota', 'Deskripsi Otorisasi', 'Keterangan Otorisasi']
    const rows = [
      ['D3 16', 'D3', 'CUCI 16K / 17K RP', 1.71, 3490123.45, 3520456.75, 1800000, 1757000, 1808000, 'Masih dalam batas range acuan', 'Termasuk kedua batas.', 'Tidak ditemukan', 'Tidak ditemukan', 'Tidak ditemukan otorisasi pembelian di atas nota untuk faktur ini.'],
      ['D3 17', 'D3', 'CUCI 16K / 17K RP', 2, 3640000, 0, 1820000, 1757000, 1808000, 'Di luar range acuan', 'Melebihi batas atas Rp12.000.', 'Ada otorisasi', 'PEMBELIAN DI ATAS NOTA', 'FB-2: Disetujui nominal pembelian\nPersetujuan tambahan'],
      ['-', '-', 'CUCI 16K / 17K RP', null, null, null, 1480000, null, null, 'Perlu diperhatikan', 'Pukul 11:06:18 WIB masuk Batch 1. Barang tidak ditemukan di master MongoDB maupun MariaDB; kode intern belum diketahui. Acuan belum dapat ditentukan. Harga rata transaksi Rp1.480.000.', 'Belum dapat diperiksa', 'Belum dapat diperiksa', 'Data otorisasi belum dapat dibaca lengkap; periksa kembali.'],
    ]
    await exportPriceAuditExcel({ title: 'Audit harga buyback perhiasan', columns, rows })
    assert.ok(exported)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()))
    const sheet = workbook.getWorksheet('Buyback')!
    assert.deepEqual(sheet.getRow(2).values.slice(1), columns)
    assert.equal(sheet.rowCount, 5); assert.equal(sheet.autoFilter, 'A2:N5'); assert.equal(sheet.views[0].state, 'frozen')
    assert.equal(sheet.getCell('A3').value, 'D3 16'); assert.equal(sheet.getCell('C3').value, 'CUCI 16K / 17K RP')
    assert.equal(sheet.getCell('D3').value, 1.71); assert.equal(sheet.getCell('E3').value, 3490123.45); assert.equal(sheet.getCell('F3').value, 3520456.75)
    assert.equal(sheet.getCell('G3').value, 1800000); assert.equal(sheet.getCell('H3').value, 1757000)
    assert.match(sheet.getCell('F3').numFmt, /Rp/); assert.equal(sheet.getCell('F4').value, 0)
    assert.equal(sheet.getCell('A5').value, '-'); assert.equal(sheet.getCell('G5').value, 1480000); assert.equal(sheet.getCell('E5').value, '—'); assert.equal(sheet.getCell('F5').value, '—')
    assert.equal((sheet.getCell('J3').font.color as { argb: string }).argb, 'FF147A69')
    assert.equal((sheet.getCell('J4').font.color as { argb: string }).argb, 'FFB73535')
    assert.equal((sheet.getCell('J5').font.color as { argb: string }).argb, 'FF986218')
    assert.match(String(sheet.getCell('K5').value), /1\.480\.000/)
    assert.match(String(sheet.getCell('K5').value), /Pukul 11:06:18 WIB masuk Batch 1\. Kode intern barang belum diketahui\./)
    assert.doesNotMatch(String(sheet.getCell('K5').value), /mongo\s*db|maria\s*db|mysql|rds/i)
    assert.equal(sheet.getCell('L4').value,'Ada otorisasi'); assert.equal(sheet.getCell('M4').value,'PEMBELIAN DI ATAS NOTA')
    assert.equal(sheet.getCell('N4').value,'FB-2: Disetujui nominal pembelian\nPersetujuan tambahan'); assert.equal(sheet.getCell('N4').alignment.wrapText,true)
    assert.equal(sheet.getCell('J4').value,'Di luar range acuan','authorization does not replace the price result')
    assert.equal(sheet.getCell('L3').value,'Tidak ditemukan'); assert.equal(sheet.getCell('L5').value,'Belum dapat diperiksa')
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    URL.createObjectURL = originalCreate
  }
})
test('generic chat attachment requests check price references before banking routing', () => {
  assert.equal(shouldCheckPriceAttachments('tolong cek data ini dengan transaksi', 4), true)
  assert.equal(shouldCheckPriceAttachments('cek transaksi jam 9 sampai 17', 4), true)
  assert.equal(shouldCheckPriceAttachments('tolong cek mutasi bank ini', 2), false)
  assert.equal(shouldCheckPriceAttachments('cek harga emas', 0), false)
})
test('four chat files are read separately then composed together, preserving all files on failure', async () => {
  const calls: string[][] = [], progress: number[] = []
  const result = await resolveChatPriceScope(['old-sales','old-buyback','young-sales','young-buyback'], async ids => { calls.push(ids); return { handled: true, needsTime: true } }, done => { progress.push(done) })
  assert.equal(result.handled, true)
  assert.deepEqual(calls.map(ids => ids.length), [1,1,1,1,4])
  assert.deepEqual(progress, [1,2,3,4])
  await assert.rejects(() => resolveChatPriceScope(['price','bank'], async ids => ({ handled: ids[0] === 'price' })), /Semua lampiran tetap/)
  assert.equal((await resolveChatPriceScope(['bank'], async () => ({ handled: false }))).handled, false)
})
test('four buyback batch uploads go straight to a daily report selection without a time form', async () => {
  const files: PriceReference[] = [1, 2].flatMap(batch => (['young', 'old'] as const).map(family => ({
    id: `${family}-${batch}`, filename: `BATCH-${batch}.jpeg`, date: '2026-11-23', batch, complete: true, warnings: [],
    rows: [{ family, kind: 'buyback', kadar: null, sourceCode: family === 'young' ? 'H04' : 'D3', rate: 795000, maxRate: null, condition: 'GOOD', fee: null, feeType: 'unknown', note: '' }],
  })))
  const windows = dailyBuybackWindows([...files, files[0]])
  assert.deepEqual(windows, [{ date: '2026-11-23', fromTime: '00:00', toTime: '24:00', attachmentIds: files.map(file => file.id) }])
  const result = await resolveChatPriceScope(files.map(file => file.id), async ids => {
    const references = files.filter(file => ids.includes(file.id))
    return { handled: true, needsTime: false, buybackAutoBatch: true, references, selection: { windows: dailyBuybackWindows(references), toleranceRp: 0, buybackRatesFinal: true, buybackAutoBatch: true, kadarOverrides: [] } }
  })
  assert.equal(result.needsTime, false); assert.equal(result.selection?.buybackAutoBatch, true)
  assert.equal(result.selection?.windows.length, 1); assert.equal(result.selection?.windows[0].attachmentIds.length, 4)
  const otherDate = { ...files[0], id: 'other-date', date: '2026-11-24' }
  assert.equal(dailyBuybackWindows([...files, otherDate]).length, 2)
})
test('sales batch files also use daily selection, with buyback documents kept separately typed', async () => {
  const files: PriceReference[] = [1, 2].map(batch => ({ id: `sales-${batch}`, filename: `harga-emas-${batch}.jpeg`, date: '2026-11-23', batch, complete: true, warnings: [], rows: [{ family: 'young', kind: 'sales', sourceCode: 'H04', kadar: 38, rate: batch === 1 ? 798000 : 804000, maxRate: null, fee: null, feeType: 'unknown', condition: 'ANY', note: '' }] }))
  const result = await resolveChatPriceScope(files.map(file => file.id), async ids => ({ handled: true, needsTime: false, salesAutoBatch: true, selection: { windows: dailyPriceWindows(files.filter(file => ids.includes(file.id))), toleranceRp: 0, buybackRatesFinal: true, salesAutoBatch: true, buybackAutoBatch: false, kadarOverrides: [] } }))
  assert.equal(result.selection?.salesAutoBatch, true); assert.equal(result.needsTime, false)
  assert.deepEqual(result.selection?.windows[0], { date: '2026-11-23', fromTime: '00:00', toTime: '24:00', attachmentIds: files.map(file => file.id) })
})
test('file reads expose queue, elapsed time and retries without re-uploading the attachment', async () => {
  const states: PriceReadStatus[] = [
    { id: 'job', status: 'queued', message: 'Menunggu giliran', elapsedMs: 0 },
    { id: 'job', status: 'reading', message: 'Membaca tabel', elapsedMs: 1500 },
    { id: 'job', status: 'reading', message: 'Mencoba ulang otomatis (2/2)', elapsedMs: 90000 },
    { id: 'job', status: 'complete', message: 'Selesai', elapsedMs: 93000, handled: true },
  ]
  const paths: string[] = [], progress: string[] = []
  const request = async <T,>(path: string) => { paths.push(path); return states.shift() as T }
  const result = await readPriceAttachment('session', 'original-attachment', request, state => progress.push(`${state.message}:${state.elapsedMs}`), async () => {})
  assert.equal(result.status, 'complete'); assert.equal(paths.filter(p => p.endsWith('/reads')).length, 1)
  assert.equal(paths.some(p => p.includes('/attachments')), false)
  assert.ok(progress.some(text => text.includes('(2/2):90000')))
  await assert.rejects(() => readPriceAttachment('session', 'same-attachment', async <T,>() => ({ id: 'job', status: 'error', elapsedMs: 0, message: 'Coba lagi tanpa unggah ulang' }) as T, () => {}, async () => {}), /tanpa unggah ulang/)
})

test('Excel exports exactly the selected table with its order, filters and native numeric cells', async () => {
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window
  const originalCreate = URL.createObjectURL
  let exported: Blob | undefined
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ href: '', download: '', click() {}, remove() {} }), body: { appendChild() {} } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout() {} } })
  URL.createObjectURL = blob => { exported = blob as Blob; return 'blob:test' }
  try {
    const rows = Array.from({ length: 23 }, (_, i) => [`J${22 - i}`, 1542000, 'Tidak cocok', 'Ongkos lebih rendah Rp5.000.'])
    const columns = ['Faktur', 'Harga (IDR)', 'Status Pemeriksaan', 'Keterangan Pemeriksaan']
    await exportPriceAuditExcel({ title: 'Audit harga penjualan perhiasan', columns, rows })
    assert.ok(exported)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()))
    const sheet = workbook.getWorksheet('Penjualan')!
    assert.equal(workbook.worksheets.length, 1, 'does not insert summary, buyback, or reference sheets')
    assert.deepEqual(sheet.getRow(2).values.slice(1), columns)
    assert.equal(sheet.rowCount, 25)
    assert.equal(sheet.autoFilter, 'A2:D25')
    assert.equal(sheet.views[0].state, 'frozen')
    assert.equal(sheet.getCell('B3').value, 1542000)
    assert.equal(sheet.getCell('A3').value, 'J22')
    assert.equal(sheet.getCell('A25').value, 'J0')
    assert.equal(sheet.getCell('D3').value, 'Ongkos lebih rendah Rp5.000.')
    assert.equal(sheet.getCell('A1').fill.type, 'pattern')
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    URL.createObjectURL = originalCreate
  }
})

test('Excel exports batch assignment and ambiguous candidate ranges without duplicating transactions', async () => {
  const originalDocument = globalThis.document, originalWindow = globalThis.window, originalCreate = URL.createObjectURL
  let exported: Blob | undefined
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ href: '', download: '', click() {}, remove() {} }), body: { appendChild() {} } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout() {} } })
  URL.createObjectURL = blob => { exported = blob as Blob; return 'blob:batches' }
  try {
    const columns = ['No. Faktur', 'Harga Rata per gram (IDR)', 'Batch Acuan', 'Status Batch', 'Keterangan Batch', 'Rincian Range per Batch', 'Status Harga', 'Status Pemeriksaan']
    const rows = [
      ['B2', 795000, 'Batch 2', 'Satu batch sesuai', 'Harga sesuai Batch 2.', 'Batch 1: Rp790.000; Batch 2: Rp795.000.', 'Masih dalam batas range acuan', 'Masih dalam batas range acuan'],
      ['AMBIGU', 1845000, 'Batch 1 / 2 — belum pasti', 'Lebih dari satu batch sesuai', 'Harga masuk kedua batch.', 'Batch 1: Rp1.796.000–Rp1.848.000; Batch 2: Rp1.808.000–Rp1.861.000.', 'Masih dalam batas range acuan', 'Perlu diperhatikan'],
      ['GAP', 792000, 'Tidak teridentifikasi', 'Tidak masuk seluruh batch', 'Harga di luar kedua batch.', 'Batch 1: Rp790.000; Batch 2: Rp795.000.', 'Di luar range acuan', 'Di luar range acuan'],
    ]
    await exportPriceAuditExcel({ title: 'Audit harga buyback perhiasan', columns, rows })
    assert.ok(exported)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()))
    const sheet = workbook.getWorksheet('Buyback')!
    assert.equal(sheet.rowCount, 5, 'one row per transaction, not one per matching batch'); assert.equal(sheet.autoFilter, 'A2:H5')
    assert.equal(sheet.getCell('B3').value, 795000); assert.equal(sheet.getCell('C3').value, 'Batch 2')
    assert.equal(sheet.getCell('C4').value, 'Batch 1 / 2 — belum pasti'); assert.equal(sheet.getCell('D4').value, 'Lebih dari satu batch sesuai')
    assert.match(String(sheet.getCell('F4').value), /1\.796\.000/); assert.match(String(sheet.getCell('F4').value), /1\.861\.000/)
    assert.equal(sheet.getCell('G4').value, 'Masih dalam batas range acuan'); assert.equal(sheet.getCell('H4').value, 'Perlu diperhatikan')
    assert.equal(sheet.getCell('C5').value, 'Tidak teridentifikasi'); assert.equal(sheet.views[0].state, 'frozen')
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    URL.createObjectURL = originalCreate
  }
})

test('readable buyback Excel keeps every batch range, explicit missing-data labels and one colored outcome', async () => {
  const originalDocument = globalThis.document, originalWindow = globalThis.window, originalCreate = URL.createObjectURL
  let exported: Blob | undefined
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ href: '', download: '', click() {}, remove() {} }), body: { appendChild() {} } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout() {} } })
  URL.createObjectURL = blob => { exported = blob as Blob; return 'blob:readable-buyback' }
  try {
    const columns = ['No. Faktur', 'Kode Intern', 'Harga Rata per gram (IDR)', 'Range Batch 1 (IDR/gram)', 'Range Batch 2 (IDR/gram)', 'Batch yang Sesuai', 'Hasil Pemeriksaan', 'Keterangan Pemeriksaan']
    const rows = [
      ['OUTSIDE', 'D7', 1480874, 'Rp1.491.000–Rp1.533.000', 'Rp1.502.000–Rp1.544.000', 'Tidak masuk batch mana pun', 'Di luar range acuan', 'Batch 1: Rp10.126 di bawah batas bawah; Batch 2: Rp21.126 di bawah batas bawah.'],
      ['WITHIN', 'H04', 795000, 'Rp790.000 (harga tunggal)', 'Rp795.000 (harga tunggal)', 'Batch 2', 'Masih dalam batas range acuan', 'Harga masih dalam acuan Batch 2.'],
      ['OVERLAP', 'D3', 1845000, 'Rp1.796.000–Rp1.848.000', 'Rp1.808.000–Rp1.861.000', 'Batch 1 dan Batch 2', 'Perlu diperhatikan', 'Harga masih dalam acuan Batch 1 dan Batch 2; batch tunggal belum dapat ditentukan.'],
      ['MISSING', '-', 1480000, 'Kode intern belum diketahui', 'Kode intern belum diketahui', 'Belum dapat ditentukan', 'Perlu diperhatikan', 'Barang tidak ditemukan pada master barang. Harga rata transaksi Rp1.480.000/gram.'],
      ['PRECISE', 'H04', 795000.0001, 'Rp790.000 (harga tunggal)', 'Rp795.000 (harga tunggal)', 'Tidak masuk batch mana pun', 'Di luar range acuan', 'Harga melebihi acuan Batch 2 sebesar Rp0,0001/gram.'],
      ['D7-CUCI', 'D7', 1507874, 'Rp1.491.000–Rp1.533.000', 'Rp1.502.000–Rp1.544.000', 'Batch 1 dan Batch 2', 'Perlu diperhatikan', 'Harga masih dalam acuan Batch 1 dan Batch 2; batch tunggal belum dapat ditentukan.'],
    ]
    await exportPriceAuditExcel({ title: 'Audit harga buyback perhiasan', columns, rows })
    assert.ok(exported)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()))
    const sheet = workbook.getWorksheet('Buyback')!
    assert.deepEqual(sheet.getRow(2).values.slice(1), columns)
    assert.equal(sheet.rowCount, 8); assert.equal(sheet.autoFilter, 'A2:H8')
    assert.equal(sheet.views[0].state, 'frozen'); assert.equal(sheet.views[0].ySplit, 2)
    assert.equal(sheet.getCell('C3').value, 1480874)
    assert.equal(sheet.getCell('C7').value, 795000.0001); assert.match(sheet.getCell('C7').numFmt, /00####/)
    assert.equal(sheet.getCell('D3').value, 'Rp1.491.000–Rp1.533.000'); assert.equal(sheet.getCell('E3').value, 'Rp1.502.000–Rp1.544.000')
    assert.equal(sheet.getCell('C8').value, 1507874); assert.equal(sheet.getCell('F8').value, 'Batch 1 dan Batch 2')
    assert.equal(sheet.getCell('F5').value, 'Batch 1 dan Batch 2'); assert.equal(sheet.getCell('D6').value, 'Kode intern belum diketahui')
    assert.equal((sheet.getCell('G3').font.color as { argb: string }).argb, 'FFB73535')
    assert.equal((sheet.getCell('G4').font.color as { argb: string }).argb, 'FF147A69')
    assert.equal((sheet.getCell('G5').font.color as { argb: string }).argb, 'FF986218')
    assert.equal(sheet.getColumn(4).width, 37); assert.equal(sheet.getColumn(8).width, 62)
    assert.ok(sheet.getRow(3).height! >= 38, 'wrapped explanation receives enough row height')
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    URL.createObjectURL = originalCreate
  }
})

test('timed buyback Excel preserves a time-assigned batch even when only another batch price matches', async () => {
  const originalDocument = globalThis.document, originalWindow = globalThis.window, originalCreate = URL.createObjectURL
  let exported: Blob | undefined
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ href: '', download: '', click() {}, remove() {} }), body: { appendChild() {} } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout() {} } })
  URL.createObjectURL = blob => { exported = blob as Blob; return 'blob:timed-buyback' }
  try {
    const columns = ['No. Faktur', 'Jam WIB', 'Harga Rata per gram (IDR)', 'Range Batch 1 (IDR/gram)', 'Range Batch 2 (IDR/gram)', 'Batch Acuan', 'Dasar Penentuan Batch', 'Berlaku WIB', 'Hasil Pemeriksaan', 'Keterangan Pemeriksaan']
    const rows = [
      ['BEFORE', '13:39:59', 790000, 'Rp790.000 (harga tunggal)', 'Rp795.000 (harga tunggal)', 'Batch 1', 'Jam transaksi', '08:15–sebelum 13:40', 'Masih dalam batas range acuan', 'Pukul 13:39:59 WIB masuk Batch 1.'],
      ['BOUNDARY', '13:40:00', 790000, 'Rp790.000 (harga tunggal)', 'Rp795.000 (harga tunggal)', 'Batch 2', 'Jam transaksi', '13:40–akhir hari', 'Di luar range acuan', 'Pukul 13:40:00 WIB masuk Batch 2; harga Rp5.000 di bawah batas bawah.'],
    ]
    await exportPriceAuditExcel({ title: 'Audit harga buyback perhiasan', columns, rows })
    assert.ok(exported)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()))
    const sheet = workbook.getWorksheet('Buyback')!
    assert.deepEqual(sheet.getRow(2).values.slice(1), columns)
    assert.equal(sheet.getCell('B4').value, '13:40:00'); assert.equal(sheet.getCell('C4').value, 790000)
    assert.equal(sheet.getCell('F3').value, 'Batch 1'); assert.equal(sheet.getCell('F4').value, 'Batch 2')
    assert.equal(sheet.getCell('G4').value, 'Jam transaksi'); assert.equal(sheet.getCell('H4').value, '13:40–akhir hari')
    assert.equal(sheet.getCell('I4').value, 'Di luar range acuan'); assert.equal((sheet.getCell('I4').font.color as { argb: string }).argb, 'FFB73535')
    assert.equal(sheet.rowCount, 4); assert.equal(sheet.autoFilter, 'A2:J4')
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    URL.createObjectURL = originalCreate
  }
})

test('one image with multiple timed batch sections remains one upload and needs no manual hours', () => {
  const sections = [
    { date: '2026-11-23', batch: 1, effectiveFrom: '08:15', complete: true, warnings: [], rows: [] },
    { date: '2026-11-23', batch: 2, effectiveFrom: '13:40', complete: true, warnings: [], rows: [] },
  ]
  const file: PriceReference = { id: 'single-image', filename: 'two-panels.jpeg', date: '2026-11-23', batch: null, effectiveFrom: null, sections, complete: true, warnings: [], rows: [] }
  assert.deepEqual(dailyPriceWindows([file]), [{ date: '2026-11-23', fromTime: '00:00', toTime: '24:00', attachmentIds: ['single-image'] }])
  assert.deepEqual(file.sections?.map(section => section.effectiveFrom), ['08:15', '13:40'])
})

test('sales Excel retains internal code, selected batch and independently checked per-code fees', async () => {
  const originalDocument = globalThis.document, originalWindow = globalThis.window, originalCreate = URL.createObjectURL
  let exported: Blob | undefined
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ href: '', download: '', click() {}, remove() {} }), body: { appendChild() {} } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout() {} } })
  URL.createObjectURL = blob => { exported = blob as Blob; return 'blob:sales-code' }
  try {
    const columns = ['No. Faktur', 'Kode Intern', 'Kode Acuan', 'Batch Acuan', 'Harga Transaksi per gram (IDR)', 'Ongkos Acuan (IDR)', 'Status Pemeriksaan', 'Keterangan Batch']
    const rows = [['J-D7', 'D7 16', 'D7', 'Batch 1', 1848000, 50000, 'Cocok', 'Kode D7 dan harga sesuai Batch 1.'], ['J-C5', 'C5 16', 'C5', 'Batch 1', 1848000, 40000, 'Cocok', 'Kode C5 dan harga sesuai Batch 1.'], ['J-H04', 'H04 8', 'H04', 'Batch 2', 804000, null, 'Belum dapat diperiksa', 'Kode H04 dan harga sesuai Batch 2; ongkos tidak tercantum.']]
    await exportPriceAuditExcel({ title: 'Audit harga penjualan perhiasan', columns, rows })
    assert.ok(exported)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()))
    const sheet = workbook.getWorksheet('Penjualan')!
    assert.equal(sheet.rowCount, 5); assert.equal(sheet.autoFilter, 'A2:H5'); assert.equal(sheet.views[0].state, 'frozen')
    assert.equal(sheet.getCell('B3').value, 'D7 16'); assert.equal(sheet.getCell('C3').value, 'D7'); assert.equal(sheet.getCell('F3').value, 50000)
    assert.equal(sheet.getCell('B4').value, 'C5 16'); assert.equal(sheet.getCell('F4').value, 40000)
    assert.equal(sheet.getCell('D5').value, 'Batch 2'); assert.equal(sheet.getCell('E5').value, 804000); assert.equal(sheet.getCell('F5').value, '—')
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    URL.createObjectURL = originalCreate
  }
})
