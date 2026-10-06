import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { readPublicEnvironment } from './config/public-environment.ts'

export default defineConfig(({ mode }) => {
  const environment = {
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  }

  readPublicEnvironment(environment)

  return {
    plugins: [react(), tailwindcss()],
  }
})
