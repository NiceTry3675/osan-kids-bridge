import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  // 두 앱을 통째로 문자열로 싣기 때문에 경고 기준만 올립니다.
  build: { chunkSizeWarningLimit: 5000, assetsInlineLimit: 0 },
  test: { environment: 'node' },
})
