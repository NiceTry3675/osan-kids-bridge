// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { I18nProvider } from '../i18n'
import type { AgentReply } from '../data/agent'
import { getMockProgram, searchMockPrograms } from '../data/mock'
import { emptyFilters } from '../data/types'
import type { SearchFilters } from '../data/types'

// 서버가 연결된 화면처럼: AI 상담은 서버가 있어야 보입니다.
vi.hoisted(() => { vi.stubEnv('VITE_API_BASE_URL', 'http://api.test'); vi.stubEnv('VITE_DATA_MODE', 'live') })

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** AI가 다른 공고(demo-craft)를 권하는 답 */
const reply: AgentReply = {
  reply: '토요일에 갈 수 있는 공고가 있어요.', citations: [], follow_ups: [], steps: [], inquiry: null, unanswered: [],
  programs: [{ program_id: 'demo-craft', title: '토요 가족 공예' }],
}

/** program-api 대신: 공고 찾기·조회·조건 판정은 시연 데이터로, 상담은 reply로 답하고 받은 요청을 적어 둡니다. */
function serve() {
  const calls: { method: string; url: string; body: Record<string, unknown> | null }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
    calls.push({ method: init?.method ?? 'GET', url, body })
    if (url === 'http://api.test/agent/chat') return json(reply)
    if (url === 'http://api.test/programs/search') return json(searchMockPrograms({ ...emptyFilters(), ...body }))
    const program = url.match(/\/programs\/([^/?]+)(\/evaluate)?/)
    if (program) {
      const found = getMockProgram(decodeURIComponent(program[1]), program[2] ? { ...emptyFilters(), ...body } as SearchFilters : emptyFilters())
      return found ? json(found) : json({}, 404)
    }
    return json({}, 404)
  }))
  return calls
}

/** 이 탭의 저장소 대신(Node의 실험용 localStorage가 jsdom 것을 가리는 환경에서도 같게) */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() { return items.size },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, String(value)) },
    removeItem: (key) => { items.delete(key) },
    clear: () => items.clear(),
  }
}

async function askAndOpenSuggestion() {
  const input = screen.getByLabelText('궁금한 것을 쓰세요')
  fireEvent.change(input, { target: { value: '토요일에 갈 수 있어요?' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.click(await screen.findByText('토요 가족 공예'))
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
  localStorage.setItem('osan-guardian-intro-seen', '1')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('AI 상담이 권한 공고 열기', () => {
  it('상세에서 조건을 넣고 물었으면, 권한 공고도 같은 조건으로 판정하고 공유 링크로 열었다고 하지 않는다', async () => {
    sessionStorage.setItem('guardian-search-v2', JSON.stringify({ ...emptyFilters(), child_grade: 2 }))
    window.history.replaceState({ fromList: true }, '', '/programs/demo-korean')
    const calls = serve()
    render(<I18nProvider initial="ko-easy"><App /></I18nProvider>)
    fireEvent.click(await screen.findByRole('button', { name: /이 공고, AI에게 물어보기/ }))
    await askAndOpenSuggestion()

    await waitFor(() => expect(window.location.pathname).toBe('/programs/demo-craft'))
    expect(await screen.findByRole('heading', { name: '우리 아이 조건과 비교' })).toBeTruthy()
    expect(screen.queryByText(/공유 링크로 열어서/)).toBeNull()
    const evaluate = calls.find((call) => call.url === 'http://api.test/programs/demo-craft/evaluate')
    expect(evaluate?.method).toBe('POST')
    expect(evaluate?.body).toMatchObject({ child_grade: 2 })
    // ‘목록’은 이전 상세로 돌아가지 않고 홈으로 갑니다.
    expect(window.history.state).toMatchObject({ fromChat: true })
    expect(window.history.state.fromList).toBeUndefined()
  })

  it('홈에서 조건 없이 물었으면, 조건을 넣지 않아 비교하지 않았다고 말한다(공유 링크라고 하지 않음)', async () => {
    serve()
    render(<I18nProvider initial="ko-easy"><App /></I18nProvider>)
    fireEvent.click(await screen.findByRole('button', { name: /궁금한 걸 AI에게 물어보세요/ }))
    await askAndOpenSuggestion()

    expect(await screen.findByText(/아이 학년·시간을 넣지 않아 비교하지 않았어요/)).toBeTruthy()
    expect(screen.queryByText(/공유 링크로 열어서/)).toBeNull()
  })

  it('본문으로 건너뛰기 링크는 화면마다 같은 이름을 쓴다', async () => {
    serve()
    render(<I18nProvider initial="vi"><App /></I18nProvider>)
    expect(screen.getByText('Chuyển đến nội dung chính').getAttribute('href')).toBe('#main')
  })
})

describe('본문으로 건너뛰기', () => {
  it('목록에서 연 상세에서 눌러도 주소와 기록을 바꾸지 않고, 본문으로 초점만 옮긴다', async () => {
    sessionStorage.setItem('guardian-search-v2', JSON.stringify({ ...emptyFilters(), child_grade: 2 }))
    window.history.replaceState({ fromList: true }, '', '/programs/demo-korean')
    const calls = serve()
    render(<I18nProvider initial="ko-easy"><App /></I18nProvider>)
    expect(await screen.findByRole('heading', { name: '우리 아이 조건과 비교' })).toBeTruthy()
    const fetched = calls.length

    fireEvent.click(screen.getByRole('link', { name: '본문으로 건너뛰기' }))

    expect(window.location.hash).toBe('')
    expect(window.history.state).toMatchObject({ fromList: true })
    expect(document.activeElement?.id).toBe('main')
    expect(screen.getByRole('heading', { name: '우리 아이 조건과 비교' })).toBeTruthy()
    expect(calls).toHaveLength(fetched)
  })
})
