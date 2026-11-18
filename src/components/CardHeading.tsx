import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Activity, BarChart3, Boxes, ClipboardList, Database, History, LayoutPanelTop, MessageCircle, PackageCheck, PackageOpen, PieChart, Settings, ShieldCheck, Users, Wallet } from 'lucide-react'
import './CardHeading.css'

type Props = ComponentPropsWithoutRef<'h2'> & { as?: 'h2' | 'h3' | 'p' | 'span'; icon?: ReactNode }
function titleIcon(title: string) {
  if (/saldo|top.up/i.test(title)) return <Wallet size={19} strokeWidth={1.8} />
  if (/pengguna|akun/i.test(title)) return <Users size={19} strokeWidth={1.8} />
  if (/riwayat/i.test(title)) return <History size={19} strokeWidth={1.8} />
  if (/sumber|database|cache/i.test(title)) return <Database size={19} strokeWidth={1.8} />
  if (/cuci|buyback/i.test(title)) return <ClipboardList size={19} strokeWidth={1.8} />
  if (/aman|cakupan/i.test(title)) return <ShieldCheck size={19} strokeWidth={1.8} />
  if (/pengaturan|default/i.test(title)) return <Settings size={19} strokeWidth={1.8} />
  if (/penjualan|performa|berat|kinerja/i.test(title)) return <BarChart3 size={19} strokeWidth={1.8} />
  if (/stok|stock|inventory/i.test(title)) return <Boxes size={19} strokeWidth={1.8} />
  if (/diterima|penerimaan/i.test(title)) return <PackageCheck size={19} strokeWidth={1.8} />
  if (/pengiriman|kirim|proses/i.test(title)) return <PackageOpen size={19} strokeWidth={1.8} />
  if (/distribusi|komposisi/i.test(title)) return <PieChart size={19} strokeWidth={1.8} />
  if (/chat|asisten/i.test(title)) return <MessageCircle size={19} strokeWidth={1.8} />
  if (/request|waktu/i.test(title)) return <Activity size={19} strokeWidth={1.8} />
  return <LayoutPanelTop size={19} strokeWidth={1.8} />
}
export function CardHeading({ as: Tag = 'h2', icon, children, className = '', ...props }: Props) {
  return <Tag {...props} className={`card-title ${className}`}><span className="card-title-icon" aria-hidden="true">{icon || titleIcon(typeof children === 'string' ? children : '')}</span><span className="card-title-text">{children}</span></Tag>
}
