import { defineConfig } from 'vitest/config'

// 역산 방지 테스트는 모든 필터 조합을 따지므로 느린 기기에서도 끝나도록 넉넉히 둡니다.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 60_000 },
})
