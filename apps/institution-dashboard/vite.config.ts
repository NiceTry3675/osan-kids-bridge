import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  // 역산 방지 테스트는 모든 필터 조합을 따지므로 느린 기기에서도 끝나도록 넉넉히 둡니다.
  test: { environment: 'node', testTimeout: 60_000 },
})
