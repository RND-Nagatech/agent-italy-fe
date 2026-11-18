import { BookOpen } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Highlight, HighlightItem } from '@animate-ui/react/primitives/effects/highlight'
import {
  Activity,
  Bot,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Database,
  ClipboardList,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageOpen,
  Settings,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import './AppShell.css'

type NavigationLink = { to: string; label: string; icon: LucideIcon; end?: boolean }
const showOperationalMenu = false

const primaryLinks: NavigationLink[] = [
  { to: '/distribusi', label: 'Ringkasan', icon: LayoutDashboard, end: true },
  { to: '/pengiriman', label: 'Pengiriman', icon: PackageOpen },
  { to: '/distribusi/cabang', label: 'Analitik cabang', icon: Activity },
]

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const activePath = location.pathname
  const reducedMotion = useReducedMotion()
  const links = user?.role === 'admin' || user?.role === 'pusat'
    ? [...primaryLinks, { to: '/inventaris', label: 'Inventory', icon: Boxes }]
    : primaryLinks
  const supportLinks: NavigationLink[] = [
    { to: '/distribusi/agent', label: 'Agent AI', icon: Bot },
    { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
    ...(user?.role === 'admin' ? [{ to: '/distribusi/penggunaan-agent', label: 'Penggunaan Agent', icon: Activity }] : []),
    ...(user?.email?.trim().toLowerCase() === 'rnd@nagatech.id' ? [{ to: '/distribusi/audit-payload-agent', label: 'Audit payload Agent', icon: FileSearch }] : []),
    ...(user?.role === 'admin' ? [{ to: '/distribusi/evaluasi-agent', label: 'Evaluasi Agent', icon: ClipboardList }] : []),
    ...(user?.role === 'admin' ? [{ to: '/pengaturan/skill-agent', label: 'Skill Agent', icon: SlidersHorizontal }] : []),
    ...(user?.role === 'admin' ? [{ to: '/pengaturan/sumber-data', label: 'Sumber Agent AI', icon: Database }] : []),
    ...(user?.role === 'admin' || user?.role === 'pusat' ? [{ to: '/pengaturan/patokan-stok', label: 'Patokan stok', icon: ClipboardList }] : []),
    { to: '/pengaturan', label: 'Pengaturan', icon: Settings, end: true },
    ...(user?.role === 'admin' ? [{ to: '/pengaturan/pengguna', label: 'Kelola pengguna', icon: Users }] : []),
  ]
  const roleLabel = user?.role === 'cabang' ? `Cabang ${user.branchId || ''}` : user?.role === 'pusat' ? 'Pusat' : 'Administrator'

  return (
    <>
      <div className="brand-lockup">
        <div className="brand-mark"><Boxes size={20} strokeWidth={2.1} /></div>
        <div><strong>Italy</strong><span>Asisten data AI</span></div>
      </div>

      <div className="workspace-chip">
        <span className="workspace-indicator" />
        <span>Pusat & cabang</span>
      </div>

      <nav className="side-navigation" aria-label="Navigasi utama">
        {showOperationalMenu && <>
          <p className="nav-section-label">OPERASIONAL</p>
          <Highlight
            mode="parent"
            value={activePath}
            controlledItems
            className="nav-highlight"
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', bounce: 0.12, duration: 0.32 }}
          >
            {links.map((link) => {
              const active = link.end ? activePath === link.to : activePath === link.to || activePath.startsWith(`${link.to}/`)
              const Icon = link.icon
              return (
                <HighlightItem key={link.to} value={link.to} className="nav-highlight-item">
                  <NavLink
                    to={link.to}
                    end={link.end}
                    onClick={onNavigate}
                    aria-label={link.label}
                    title={link.label}
                    className={`nav-link${active ? ' is-active' : ''}`}
                  >
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                    <span>{link.label}</span>
                  </NavLink>
                </HighlightItem>
              )
            })}
          </Highlight>
        </>}
        <p className="nav-section-label nav-section-gap">ANALISIS & PENGATURAN</p>
        <div className="nav-secondary">
          {supportLinks.map((link) => {
            const active = activePath === link.to || (!link.end && activePath.startsWith(`${link.to}/`))
            const Icon = link.icon
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => {
                  onNavigate?.()
                  if (link.to === '/distribusi/agent' && active) {
                    window.requestAnimationFrame(() => document.getElementById('agent-question')?.focus({ preventScroll: true }))
                  }
                }}
                onKeyDown={event => {
                  if (link.to !== '/distribusi/agent' || !active || event.key !== 'Tab' || event.shiftKey) return
                  const composer = document.getElementById('agent-question') as HTMLTextAreaElement | null
                  if (!composer || composer.disabled) return
                  event.preventDefault()
                  composer.focus({ preventScroll: true })
                }}
                aria-label={link.label}
                title={link.label}
                className={`nav-link${active ? ' is-active' : ''}`}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>{link.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>

      <div className="sidebar-bottom">
        <div className="profile-card">
          <div className="profile-avatar" aria-hidden="true">{user?.name?.trim().charAt(0).toUpperCase() || 'P'}</div>
          <div className="profile-copy"><strong>{user?.name || 'Pengguna'}</strong><span>{roleLabel}</span></div>
          <button className="icon-button sidebar-logout" type="button" aria-label="Keluar" title="Keluar" onClick={() => void logout()}>
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  )
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('italy.sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const { user, logout } = useAuth()
  const location = useLocation()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeMenuRef = useRef<HTMLButtonElement>(null)
  const menuNavigationRef = useRef(false)
  const titles: Record<string, string> = {
    '/distribusi': 'Ringkasan distribusi',
    '/pengiriman': 'Pengiriman',
    '/pengaturan/patokan-stok': 'Patokan stok',
    '/penerimaan': 'Penerimaan',
    '/distribusi/cabang': 'Analitik cabang',
    '/distribusi/agent': 'Agent AI',
    '/inventaris': 'Inventory',
    '/distribusi/penggunaan-agent': 'Penggunaan Agent',
    '/distribusi/audit-payload-agent': 'Audit payload Agent',
    '/distribusi/evaluasi-agent': 'Evaluasi Agent',
    '/pengaturan/skill-agent': 'Skill Agent',
    '/knowledge': 'Knowledge',
    '/pengaturan': 'Pengaturan',
    '/pengaturan/sumber-data': 'Sumber Agent AI',
    '/pengaturan/urutan-distribusi': 'Urutan distribusi',
    '/pengaturan/pengguna': 'Kelola pengguna',
  }
  const pageTitle = titles[location.pathname] || 'Kendali distribusi'

  useEffect(() => {
    try {
      window.localStorage.setItem('italy.sidebar-collapsed', String(sidebarCollapsed))
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!menuOpen) return
    menuNavigationRef.current = false
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeMenuRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const drawer = document.getElementById('mobile-nav-drawer')
      const focusable = drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable.item(0)
      const last = focusable.item(focusable.length - 1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      if (!menuNavigationRef.current) previousFocus?.focus()
    }
  }, [menuOpen])

  return (
    <div className={`app-frame${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <aside id="desktop-sidebar" className="desktop-sidebar" aria-hidden={sidebarCollapsed} inert={sidebarCollapsed}><SidebarContents /></aside>
      <button
        className="desktop-sidebar-toggle"
        type="button"
        aria-label={sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}
        title={sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}
        aria-expanded={!sidebarCollapsed}
        aria-controls="desktop-sidebar"
        onClick={() => setSidebarCollapsed(collapsed => !collapsed)}
      >
        {sidebarCollapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
      </button>
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.button
              className="mobile-backdrop"
              type="button"
              aria-label="Tutup navigasi"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              className="mobile-sidebar"
              id="mobile-nav-drawer"
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ duration: 0.18 }}
              role="dialog" aria-modal="true" aria-label="Navigasi utama"
            >
              <button ref={closeMenuRef} className="mobile-sidebar-close icon-button" type="button" aria-label="Tutup navigasi" onClick={() => setMenuOpen(false)}><X size={18} /></button>
              <SidebarContents onNavigate={() => { menuNavigationRef.current = true; setMenuOpen(false) }} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="main-column">
        <header className="topbar">
          <button ref={menuButtonRef} className="mobile-menu-button icon-button" type="button" aria-label="Buka navigasi" aria-expanded={menuOpen} aria-controls="mobile-nav-drawer" onClick={() => setMenuOpen(true)}>
            <Menu size={19} />
          </button>
          <div className="topbar-crumb"><span>Operasional</span><ChevronRight size={13} /><strong>{pageTitle}</strong></div>
          <div className="topbar-right">
            <span className="topbar-avatar" aria-hidden="true">{user?.name?.trim().charAt(0).toUpperCase() || 'P'}</span>
            <span className="role-label">{user?.role === 'cabang' ? `Cabang ${user.branchId || ''}` : user?.role === 'pusat' ? 'Kantor pusat' : 'Administrator'}</span>
            <button className="topbar-logout" type="button" aria-label="Keluar" title="Keluar" onClick={() => void logout()}><LogOut size={15} /><span>Keluar</span></button>
          </div>
        </header>
        <main id="main-content" className="page-content"><Outlet /></main>
      </div>
    </div>
  )
}
