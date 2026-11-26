import { buybackAuditExplanation } from './buyback-audit-presentation.ts'
import { marketplaceStatusCell } from './price-audit-status.ts'
import { marketplaceColumnLabel } from './marketplace-report-presentation.ts'

export type ExcelTable = { title?: string; columns: string[]; rows: Array<Array<string | number | null>> }
const measureNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 })

function columnName(index: number) {
  let result = ''
  while (index > 0) { index--; result = String.fromCharCode(65 + index % 26) + result; index = Math.floor(index / 26) }
  return result
}

export function exportPriceAuditExcel(table: ExcelTable) {
  const name = /daftar acuan/i.test(table.title ?? '') ? 'Daftar Acuan' : /penjualan/i.test(table.title ?? '') ? 'Penjualan' : 'Buyback'
  const display = table.title === 'Audit harga buyback perhiasan' ? { ...table, rows: table.rows.map(row => row.map((value, index) =>
    /keterangan/i.test(table.columns[index]) && typeof value === 'string' ? buybackAuditExplanation(value) : value,
  )) } : table
  return exportTableExcel(display, name, 'Pemeriksaan harga penjualan dan buyback')
}

export function exportMarketplaceSalesExcel(table: ExcelTable) {
  const audit = table.title === 'Audit harga penjualan marketplace perhiasan'
  const title = audit ? table.title! : table.title ? `Penjualan Online — ${table.title}` : 'Penjualan Online Marketplace'
  const columns = table.columns.map(marketplaceColumnLabel)
  const rows = audit ? table.rows.map(row => row.map((value, index) => marketplaceStatusCell(table.columns[index], value))) : table.rows
  return exportTableExcel({ ...table, title, columns, rows }, 'Penjualan Online', audit ? 'Pemeriksaan harga penjualan marketplace' : 'Laporan penjualan online marketplace')
}

/** Workbook uses the same typography, colors, frozen headers and filter as reconciliation. */
async function exportTableExcel(table: ExcelTable, name: string, subject: string) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Italy Agent AI'; workbook.subject = subject; workbook.created = new Date()
  {
    const sheet = workbook.addWorksheet(name)
    sheet.views = [{ state: 'frozen', ySplit: 2, topLeftCell: 'A3' }]
    sheet.mergeCells(1, 1, 1, table.columns.length)
    const title = sheet.getCell(1, 1)
    title.value = table.title || name
    title.font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: 'FFFFFFFF' } }
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2458C8' } }
    title.alignment = { vertical: 'middle' }; sheet.getRow(1).height = 30
    const header = sheet.addRow(table.columns); header.height = 32
    header.eachCell(cell => {
      cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF344A68' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FB' } }
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = { bottom: { style: 'medium', color: { argb: 'FFD6E1F0' } } }
    })
    for (const [rowIndex, values] of table.rows.entries()) {
      const row = sheet.addRow(values.map(value => value === null || value === '' ? '—' : value))
      row.eachCell((cell, columnNumber) => {
        const column = table.columns[columnNumber - 1]
        cell.font = { name: 'Aptos', size: 10, color: { argb: 'FF526177' } }
        cell.alignment = { vertical: 'top', wrapText: true }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE7ECF2' } } }
        if (rowIndex % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFD' } }
        if (typeof cell.value === 'number') {
          cell.numFmt = /IDR|\(Rp\)/i.test(column) ? Number.isInteger(cell.value) ? '"Rp" #,##0;[Red]-"Rp" #,##0;"Rp" 0' : '"Rp" #,##0.00####;[Red]-"Rp" #,##0.00####;"Rp" 0' : /berat|kadar/i.test(column) ? '#,##0.######' : '#,##0.##'
          cell.alignment = { vertical: 'top', horizontal: 'right', wrapText: true }
        }
        if (/(?:status|hasil) pemeriksaan/i.test(column)) cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: ['Cocok', 'Masih dalam batas range acuan'].includes(String(cell.value)) ? 'FF147A69' : ['Tidak cocok', 'Di luar range acuan'].includes(String(cell.value)) ? 'FFB73535' : 'FF986218' } }
      })
    }
    table.columns.forEach((column, i) => {
      const width = table.rows.reduce((max, row) => Math.max(max, String(row[i] ?? '').length), column.length)
      sheet.getColumn(i + 1).width = /^range\b/i.test(column) ? 37 : /keterangan pemeriksaan/i.test(column) ? 62 : Math.min(58, Math.max(13, width + 2))
    })
    for (let index = 3; index <= sheet.rowCount; index++) {
      const row = sheet.getRow(index)
      let lines = 1
      row.eachCell((cell, columnNumber) => {
        const width = Math.max(8, (sheet.getColumn(columnNumber).width ?? 13) - 3)
        const text = typeof cell.value === 'number' ? measureNumber.format(cell.value) : String(cell.value ?? '')
        lines = Math.max(lines, ...text.split('\n').map(line => Math.max(1, Math.ceil(line.length / width))))
      })
      row.height = Math.max(26, lines * 14 + 10)
    }
    sheet.autoFilter = `A2:${columnName(table.columns.length)}${table.rows.length + 2}`
  }
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  const reportName = (table.title || 'audit-harga-emas').toLocaleLowerCase('id-ID').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  link.href = url; link.download = `${reportName}-${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}.xlsx`
  document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
