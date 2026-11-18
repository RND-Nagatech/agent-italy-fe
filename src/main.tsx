import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './redesign.css'
import './components/TableStyle.css'
import './components/AgentResponsive.css'
import './components/AgentScopeClarifier.css'
import './components/AgentLayout.css'
import './components/AgentContent.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
