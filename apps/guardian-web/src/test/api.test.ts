import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyFilters } from '../data/types'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('공고 API 경계(명세 6장)', () => {
  it('API 주소도 데모 모드도 없으면 가상 공고로 대신하지 않는다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('VITE_DATA_MODE', '')
    const api = await import('../data/api')
    expect(api.usingDemoData).toBe(false)
    await expect(api.searchPrograms(emptyFilters(), 'ko-easy')).rejects.toBeInstanceOf(api.MissingApiError)
  })

  it('목록에서 온 상세는 조건과 언어를 evaluate로 보내고, 공유 링크 상세는 조건 없이 GET 한다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/')
    vi.stubEnv('VITE_DATA_MODE', '')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ program_id: 'sample' }) })
    vi.stubGlobal('fetch', fetchMock)
    const api = await import('../data/api')
    const filters = { ...emptyFilters(), child_grade: 2, available_windows: [{ day_of_week: 'sat' as const, start_time: '10:05', end_time: '12:10' }] }

    await api.getProgram('sample', filters, 'vi')
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.example.test/programs/sample/evaluate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ child_grade: 2, available_windows: filters.available_windows, display_language: 'vi' }),
    }))

    await api.getProgram('sample', null, 'zh')
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.example.test/programs/sample?display_language=zh', { signal: undefined })
  })

  it('404·410은 볼 수 없는 공고로 처리한다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubEnv('VITE_DATA_MODE', '')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 410 }))
    const api = await import('../data/api')
    await expect(api.getProgram('gone', null, 'ko-easy')).resolves.toBeNull()
  })
})
