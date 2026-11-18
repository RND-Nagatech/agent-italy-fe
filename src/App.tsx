import { lazy, Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { AppShell } from './components/AppShell'
import {
  AgentPage,
  BranchAnalyticsPage,
  DataSourcesPage,
  LoginPage,
  OverviewPage,
  ShipmentsPage,
  SettingsPage,
  UserManagementPage,
} from './pages'

const StockBaselinesPage = lazy(() => import('./pages/StockBaselinesPage').then(({ StockBaselinesPage }) => ({ default: StockBaselinesPage })))

const DistributionOrderPage = lazy(() => import('./pages/DistributionOrderPage').then(({ DistributionOrderPage }) => ({ default: DistributionOrderPage })))

const KnowledgePage = lazy(() => import('./pages/KnowledgePage').then(({ KnowledgePage }) => ({ default: KnowledgePage })))

const AgentUsagePage = lazy(() => import('./pages/AgentUsagePage').then(({ AgentUsagePage }) => ({ default: AgentUsagePage })))

const AgentEvaluationPage = lazy(() => import('./pages/AgentEvaluationPage').then(({ AgentEvaluationPage }) => ({ default: AgentEvaluationPage })))

const AgentSkillsPage = lazy(() => import('./pages/AgentSkillsPage').then(({ AgentSkillsPage }) => ({ default: AgentSkillsPage })))

const AgentGatewayAuditPage = lazy(() => import('./pages/AgentGatewayAuditPage').then(({ AgentGatewayAuditPage }) => ({ default: AgentGatewayAuditPage })))

const InventoryPage = lazy(() => import('./pages/InventoryPage').then(({ InventoryPage }) => ({ default: InventoryPage })))

function AuthenticatedRoutes() {
  const { status, user } = useAuth()

  if (status === 'loading') {
    return <div className="app-loading" role="status"><LoaderCircle size={22} className="spin" /><span>Memeriksa sesi aman…</span></div>
  }

  return (
    <Routes>
      <Route path="/login" element={status === 'authenticated' ? <Navigate to="/distribusi/agent" replace /> : <LoginPage />} />
      <Route element={status === 'authenticated' ? <AppShell /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Navigate to="/distribusi/agent" replace />} />
        <Route path="/distribusi" element={<OverviewPage />} />
        <Route path="/pengiriman" element={<ShipmentsPage />} />
        <Route path="/penerimaan" element={<ShipmentsPage receiving />} />
        <Route path="/distribusi/cabang" element={<BranchAnalyticsPage />} />
        <Route path="/knowledge" element={<Suspense fallback={<div className="app-loading" role="status">Memuat Knowledge…</div>}><KnowledgePage /></Suspense>} />
        <Route path="/distribusi/agent" element={<AgentPage />} />
        <Route path="/inventaris" element={user?.role === 'admin' || user?.role === 'pusat' ? <Suspense fallback={<div className="app-loading" role="status"><LoaderCircle size={22} className="spin" /><span>Memuat inventory…</span></div>}><InventoryPage /></Suspense> : <Navigate to="/distribusi" replace />} />
        <Route path="/distribusi/penggunaan-agent" element={user?.role === 'admin' ? <Suspense fallback={<div className="app-loading" role="status">Memuat penggunaan Agent…</div>}><AgentUsagePage /></Suspense> : <Navigate to="/distribusi" replace />} />
        <Route path="/distribusi/audit-payload-agent" element={user?.email?.trim().toLowerCase() === 'rnd@nagatech.id' ? <Suspense fallback={<div className="app-loading" role="status">Memuat audit payload Agent…</div>}><AgentGatewayAuditPage /></Suspense> : <Navigate to="/distribusi" replace />} />
        <Route path="/distribusi/evaluasi-agent" element={user?.role === 'admin' ? <Suspense fallback={<div className="app-loading" role="status">Memuat evaluasi Agent…</div>}><AgentEvaluationPage /></Suspense> : <Navigate to="/distribusi" replace />} />
        <Route path="/pengaturan/skill-agent" element={user?.role === 'admin' ? <Suspense fallback={<div className="app-loading" role="status">Memuat skill Agent…</div>}><AgentSkillsPage /></Suspense> : <Navigate to="/distribusi" replace />} />
        <Route path="/pengaturan/patokan-stok" element={user?.role === 'admin' || user?.role === 'pusat' ? <Suspense fallback={<div className="app-loading" role="status">Memuat patokan stok…</div>}><StockBaselinesPage /></Suspense> : <Navigate to="/distribusi" replace />} />
        <Route path="/pengaturan" element={<SettingsPage />} />
        <Route path="/pengaturan/sumber-data" element={<DataSourcesPage />} />
        <Route path="/pengaturan/urutan-distribusi" element={user?.role === 'admin' ? <Suspense fallback={<div className="app-loading" role="status">Memuat urutan distribusi…</div>}><DistributionOrderPage /></Suspense> : <Navigate to="/distribusi" replace />} />
        <Route path="/pengaturan/pengguna" element={user?.role === 'admin' ? <UserManagementPage /> : <Navigate to="/distribusi" replace />} />
      </Route>
      <Route path="*" element={<Navigate to={status === 'authenticated' ? '/distribusi/agent' : '/login'} replace />} />
    </Routes>
  )
}

function App() {
  return <AuthProvider><BrowserRouter><AuthenticatedRoutes /></BrowserRouter></AuthProvider>
}

export default App
