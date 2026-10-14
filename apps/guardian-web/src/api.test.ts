import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyFilters } from './types'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('공고 API 경계', () => {
  it('API 주소가 없고 데모 모드도 아니면 가상 공고를 노출하지 않는다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('VITE_DATA_MODE', '')
    const api = await import('./api')
    expect(api.usingDemoData).toBe(false)
    await expect(api.searchPrograms(emptyFilters())).rejects.toThrow('API 주소')
  })

  it('조건 적용 상세에는 검색 조건을 보내고 공유 상세는 조건 없이 조회한다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubEnv('VITE_DATA_MODE', '')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ program_id: 'sample' }) })
    vi.stubGlobal('fetch', fetchMock)
    const api = await import('./api')
    const filters = { ...emptyFilters(), child_grade: 2, available_windows: [{ day_of_week: 'sat' as const, start_time: '10:05', end_time: '12:10' }] }
    await api.getProgram('sample', filters)
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/programs/sample/evaluate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ child_grade: 2, available_windows: filters.available_windows }),
    }))
    await api.getProgram('sample', emptyFilters())
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.example.test/programs/sample', { signal: undefined })
  })
})
