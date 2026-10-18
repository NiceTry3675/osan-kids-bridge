// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { messages } from '../i18n/messages'
import { searchMockPrograms } from '../data/mock'
import { emptyFilters } from '../data/types'
import type { Locale, Program, SearchResponse } from '../data/types'
import { HomeScreen } from '../screens/home/HomeScreen'
import { posterPicks } from '../screens/home/PosterStrip'
import { IntroScreen } from '../screens/intro/IntroScreen'

vi.hoisted(() => { vi.stubEnv('VITE_DATA_MODE', 'demo') })

/** 서버가 포스터 정보(program.posters)를 붙인 것처럼: 한국어는 원본과 두 번역본, 합창은 원본과 중국어만 */
const withPosters = (): Program[] => searchMockPrograms(emptyFilters()).results.map((program) => {
  if (program.program_id === 'demo-korean') return { ...program, posters: { original: true, languages: ['vi', 'zh'] } }
  if (program.program_id === 'demo-choir') return { ...program, posters: { original: true, languages: ['zh'] } }
  if (program.program_id === 'demo-craft') return { ...program, posters: { original: false, languages: [] } }
  return program
})

const search = vi.hoisted(() => ({ response: null as SearchResponse | null }))
vi.mock('../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/api')>()),
  searchPrograms: async () => search.response!,
}))

const renderHome = (locale: Locale, programs: Program[]) => {
  search.response = { results: programs, needs_confirmation: [] }
  return render(<I18nProvider initial={locale}><HomeScreen filters={emptyFilters()} onFiltersChange={() => {}} /></I18nProvider>)
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

describe('첫 화면', () => {
  it('언어를 고르기 전에 이 서비스가 해 주는 세 가지를 글자로 보여 주고, 그림은 읽기 프로그램에 숨긴다', () => {
    const { container } = render(<I18nProvider initial="vi"><IntroScreen onStart={() => {}} onMoreLanguages={() => {}} /></I18nProvider>)
    const values = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(values).toEqual(['Áp phích bằng ngôn ngữ của bạn', 'Có hợp với con bạn không', 'Câu tiếng Hàn để hỏi cơ quan'])
    expect(container.querySelector('.intro-art')!.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('radiogroup')).toBeTruthy()
  })

  it('번역 초안 안내는 세 언어 모두 한 문장이다', () => {
    for (const locale of ['ko-easy', 'vi', 'zh'] as Locale[]) {
      const notice = messages[locale].draftNotice
      expect(notice, locale).not.toMatch(/[.。]\s*\S/)
      expect(notice.length, locale).toBeLessThan(45)
    }
  })
})

describe('홈 포스터 띠', () => {
  it('베트남어·중국어는 그 언어 번역본이 있는 공고만, 쉬운 한국어는 원본을 고른다', () => {
    const programs = withPosters()
    expect(posterPicks(programs, 'vi').map((pick) => [pick.program.program_id, pick.variant])).toEqual([['demo-korean', 'vi']])
    expect(posterPicks(programs, 'zh').map((pick) => pick.program.program_id).sort()).toEqual(['demo-choir', 'demo-korean'])
    expect(posterPicks(programs, 'ko-easy').every((pick) => pick.variant === 'original')).toBe(true)
    expect(posterPicks(programs, 'ko-easy')).toHaveLength(2)
  })

  it('화면 언어 번역본이 하나도 없으면 한국어 원본으로 대신하고, 포스터가 없으면 아무것도 고르지 않는다', () => {
    const originalsOnly = withPosters().map((program) => (program.posters ? { ...program, posters: { ...program.posters, languages: [] } } : program))
    expect(posterPicks(originalsOnly, 'vi').every((pick) => pick.variant === 'original')).toBe(true)
    expect(posterPicks(searchMockPrograms(emptyFilters()).results, 'vi')).toEqual([])
  })

  it('번역 포스터를 AI 번역이라고 밝히고, 누르면 그 공고 상세로 간다', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderHome('vi', withPosters())
    const strip = (await screen.findByRole('heading', { name: 'Áp phích bằng ngôn ngữ của bạn' })).closest('section')!
    expect(within(strip).getByText('AI dịch và đã đối chiếu số, ngày với bản gốc')).toBeTruthy()
    const links = within(strip).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].textContent).toContain('AI dịch')
    expect(links[0].textContent).toContain('Lớp học vui chơi tiếng Hàn cuối tuần')
    fireEvent.click(links[0])
    expect(window.location.pathname).toBe('/programs/demo-korean')
  })

  it('쉬운 한국어는 원본을 기관 포스터로 보여 주며 다른 언어 번역본이 있다고만 알린다', async () => {
    renderHome('ko-easy', withPosters())
    const strip = (await screen.findByRole('heading', { name: '기관 포스터' })).closest('section')!
    expect(within(strip).getByText('AI가 베트남어·중국어로도 옮겨 두었어요')).toBeTruthy()
    expect(within(strip).queryByText('AI 번역')).toBeNull()
    expect(within(strip).getAllByRole('link')).toHaveLength(2)
  })

  it('포스터가 있는 공고가 없으면 띠를 그리지 않는다', async () => {
    renderHome('zh', searchMockPrograms(emptyFilters()).results)
    expect(await screen.findByRole('heading', { level: 1, name: /孩子可以参加的活动 \d+个/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '译成您语言的海报' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '机构海报' })).toBeNull()
  })
})
