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
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#F5F6F8',
      theme_color: '#E10600',
      orientation: 'portrait-primary',
      categories: ['business', 'utilities'],
      dir: 'ltr',
      lang: 'en',
      display_override: ['standalone', 'window-controls-overlay'],
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        {
          name: 'Owner Portal',
          short_name: 'Owner',
          url: '/?tab=owner',
          description: 'Open owner portal'
        },
        {
          name: 'Driver Portal',
          short_name: 'Driver',
          url: '/?tab=driver',
          description: 'Open driver fill-up wizard'
        }
      ],
      screenshots: [
        {
          src: '/screenshots/01_welcome.png',
          sizes: '1280x800',
          type: 'image/png',
          form_factor: 'wide',
          label: 'Welcome Screen'
        },
        {
          src: '/screenshots/02_owner_login.png',
          sizes: '1280x800',
          type: 'image/png',
          form_factor: 'wide',
          label: 'Owner Login'
        },
        {
          src: '/screenshots/04_owner_dashboard.png',
          sizes: '1280x800',
          type: 'image/png',
          form_factor: 'wide',
          label: 'Owner Dashboard'
        },
        {
          src: '/screenshots/18_driver_dashboard.png',
          sizes: '1280x800',
          type: 'image/png',
          form_factor: 'wide',
          label: 'Driver Dashboard'
        }
      ],
    },
  })],
  base: '/',
  server: {
    host: true,
    port: 5177,
    allowedHosts: true
  },
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
