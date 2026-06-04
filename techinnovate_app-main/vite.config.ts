import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    workbox: {
      globPatterns: ['**/*.{js,css,html,jpg,jpeg,png,svg,ico,json}'],
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
      skipWaiting: true,
      clientsClaim: true,
    },
    manifest: {
      name: 'Techinnovate Fleet CNG',
      short_name: 'CNG Tracker',
      description: 'Fleet CNG Monitoring System',
      start_url: '/techinnovate_app/',
      scope: '/techinnovate_app/',
      display: 'standalone',
      background_color: '#F5F6F8',
      theme_color: '#E10600',
      orientation: 'portrait-primary',
      categories: ['business', 'utilities'],
      icons: [
        { src: '/techinnovate_app/logo.jpg', sizes: '192x192', type: 'image/jpeg', purpose: 'any' },
        { src: '/techinnovate_app/logo.jpg', sizes: '512x512', type: 'image/jpeg', purpose: 'any' },
      ],
    },
  })],
  base: '/techinnovate_app/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          vendor: ['react', 'react-dom', 'framer-motion', 'lucide-react'],
        },
      },
    },
  },
})
