// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { DetailScreen } from '../screens/detail/DetailScreen'
import { shownPoster } from '../screens/detail/usePosterInfo'
import { getMockProgram } from '../data/mock'
import { emptyFilters } from '../data/types'
import type { Locale, Program, SearchFilters } from '../data/types'

// 서버가 연결된 화면처럼: 포스터·기관 추가 안내는 서버에서만 옵니다.
vi.hoisted(() => { vi.stubEnv('VITE_API_BASE_URL', 'http://api.test'); vi.stubEnv('VITE_DATA_MODE', 'live') })

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const POSTERS = {
  program_id: 'demo-korean', original: true,
  languages: { vi: { status: 'machine_checked', attempts: 1, chosen_attempt: 1, checked: { segments: 20, qr: true, issues: 0 }, created_at: '2026-10-16T00:00:00Z' } },
}

/** program-api 대신: 공고 조회·조건 판정은 시연 데이터로, 포스터 정보는 POSTERS로 답합니다. */
function serve(extra: Partial<Program> & Record<string, unknown> = {}, posters: unknown = POSTERS) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url)
    const program = url.match(/\/programs\/([^/?]+)(\/evaluate)?/)
    if (program) {
      const filters = program[2] ? { ...emptyFilters(), ...JSON.parse(String(init?.body)) } as SearchFilters : emptyFilters()
      const found = getMockProgram(decodeURIComponent(program[1]), filters)
      return found ? json({ ...found, ...extra }) : json({}, 404)
    }
    if (url.endsWith('/posters/demo-korean')) return posters ? json(posters) : json({}, 404)
    return json({}, 404)
  }))
  return calls
}

const renderDetail = (locale: Locale, filters: SearchFilters | null = null, id = 'demo-korean') =>
  render(<I18nProvider initial={locale}><DetailScreen id={id} filters={filters} /></I18nProvider>)

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('상세 첫 화면', () => {
  it('조건을 넣고 들어오면 ‘맞아요’ 요약이 머리글 바로 아래에 오고, 넣지 않은 조건은 감춘다', async () => {
    serve()
    renderDetail('ko-easy', { ...emptyFilters(), child_grade: 2 })
    const compare = (await screen.findByRole('heading', { name: '우리 아이 조건과 비교' })).closest('section')!
    expect(compare.classList.contains('compare')).toBe(true)
    expect(compare.previousElementSibling?.tagName).toBe('HEADER')
    expect(compare.nextElementSibling?.classList.contains('facts')).toBe(true)
    expect(within(compare).getByText('맞아요').closest('.compare-pill')?.textContent).toBe('나이·학년맞아요')
    expect(within(compare).getByText('공고만으로는 알 수 없어요').tagName).toBe('MARK')
    expect(within(compare).queryByText('시간')).toBeNull()
  })

  it('조건 없이 목록에서 들어오면 비교한 것처럼 보이지 않게 아래쪽에 두고, 넣지 않은 조건을 그대로 밝힌다', async () => {
    serve()
    renderDetail('ko-easy', emptyFilters())
    const compare = (await screen.findByRole('heading', { name: '우리 아이 조건과 비교' })).closest('section')!
    expect(compare.previousElementSibling?.tagName).not.toBe('HEADER')
    const toCheck = screen.getByRole('heading', { name: '기관에 확인할 점' }).closest('section')!
    expect(toCheck.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(compare).getAllByText('조건을 넣지 않았어요')).toHaveLength(2)
    expect(within(compare).getByText(/아이 학년·시간을 넣지 않아/)).toBeTruthy()
    expect(within(compare).queryByText(/공유 링크로 열어서/)).toBeNull()
    expect(compare.querySelector('.compare-pill')).toBeNull()
  })

  it('공유 링크로 열면 비교하지 않았다는 안내를 확인할 점 아래에 둔다', async () => {
    serve()
    renderDetail('ko-easy')
    const note = await screen.findByText(/공유 링크로 열어서/)
    const toCheck = screen.getByRole('heading', { name: '기관에 확인할 점' }).closest('section')!
    expect(toCheck.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('확인할 점은 카드 하나로, 항목에 형광펜을 다시 칠하지 않고 원문 표현은 lang="ko"로 둔다', async () => {
    serve()
    renderDetail('vi')
    const toCheck = (await screen.findByRole('heading', { name: 'Cần hỏi cơ quan' })).closest('section')!
    expect(toCheck.querySelector('mark')).toBeNull()
    expect(within(toCheck).getByText('다문화가족 자녀').getAttribute('lang')).toBe('ko')
    expect(within(toCheck).getByText('다문화가족 자녀').parentElement!.textContent).toBe('Bản gốc ghi: “다문화가족 자녀”')
  })

  it('아래쪽 구역의 같은 미확인 값은 형광펜 대신 ? 표시로 둔다', async () => {
    serve()
    renderDetail('ko-easy')
    const companion = (await screen.findByRole('heading', { name: '함께 가기와 한국어' })).closest('section')!
    const unknown = within(companion).getByText('공고에 없어요')
    expect(unknown.closest('mark')).toBeNull()
    expect(unknown.closest('.unknown')).toBeTruthy()
  })
})

describe('번역 포스터 썸네일', () => {
  it('제목 옆에 내 언어 포스터를 두고, 포스터 정보는 한 번만 받으며, 누르면 포스터 구역으로 간다', async () => {
    const calls = serve()
    renderDetail('vi')
    const thumb = await screen.findByRole('button', { name: /Áp phích Tiếng Việt/ })
    expect(thumb.querySelector('img')!.getAttribute('src')).toBe('http://api.test/posters/demo-korean/vi')
    expect(thumb.closest('header')).toBeTruthy()
    const poster = document.getElementById('poster')!
    expect(within(poster).getByText(/Người phụ trách chưa kiểm tra/).tagName).toBe('MARK')
    fireEvent.click(thumb)
    expect(document.activeElement).toBe(poster)
    expect(calls.filter((url) => url.includes('/posters/')).length).toBe(1)
  })

  it('공고에 포스터가 없다고 붙어 오면 서버에 다시 묻지 않는다', async () => {
    const calls = serve({ posters: { original: false, languages: [] } })
    renderDetail('vi')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: /Áp phích/ })).toBeNull()
    expect(calls.some((url) => url.includes('/posters/'))).toBe(false)
  })

  it('번역본이 없으면 한국어 원본을, 원본도 없으면 보여 주지 않는다', () => {
    const posters = { original: true, languages: { vi: { approved: false } } }
    expect(shownPoster(posters, 'vi')).toBe('vi')
    expect(shownPoster(posters, 'zh')).toBe('original')
    expect(shownPoster(posters, 'ko-easy')).toBe('original')
    expect(shownPoster({ original: false, languages: { vi: { approved: true } } }, 'ko-easy')).toBeNull()
    expect(shownPoster(null, 'vi')).toBeNull()
  })
})

describe('기관이 확인해 덧붙인 안내', () => {
  const addenda = [
    { topic: 'materials' as const, text: '준비물 및 복장: 운동하기 편한 옷과 운동화', added_at: '2026-10-15' },
    { topic: 'other' as const, text: '참가비: 무료', added_at: null },
  ]

  it('확인할 점 위에 초록 카드로, 한국어 문장·덧붙인 날·공고 원문이 아니라는 표시를 함께 보인다', async () => {
    serve({ addenda })
    renderDetail('vi')
    const card = (await screen.findByRole('heading', { name: 'Thông tin bổ sung đã được cơ quan xác nhận' })).closest('section')!
    expect(within(card).getByText(/Không phải bản gốc/)).toBeTruthy()
    expect(within(card).getByText('준비물 및 복장: 운동하기 편한 옷과 운동화').getAttribute('lang')).toBe('ko')
    expect(within(card).getByText('Đồ cần mang và chi phí thêm · Bổ sung T5, 15/10')).toBeTruthy()
    expect(within(card).getByText('참가비: 무료').getAttribute('lang')).toBe('ko')
    const toCheck = screen.getByRole('heading', { name: 'Cần hỏi cơ quan' }).closest('section')!
    expect(card.compareDocumentPosition(toCheck) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('예전 서버처럼 안내가 없으면 카드를 그리지 않는다', async () => {
    serve()
    renderDetail('ko-easy')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: '기관이 확인해 덧붙인 안내' })).toBeNull()
  })
})
