import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    // Pre-transform critical entry files at server startup so browser requests load instantly
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/pages/HomePage.tsx',
        './src/components/Layout.tsx',
        './src/components/Hero.tsx',
        './src/components/BentoGrid.tsx',
      ],
    },
  },
  optimizeDeps: {
    // Explicitly prebundle major dependencies upfront so Vite never stalls mid-request
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})

