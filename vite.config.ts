import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss()],
    preview: { host: env.VITE_DEV_HOST || '127.0.0.1' },
    server: {
      host: env.VITE_DEV_HOST || '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
