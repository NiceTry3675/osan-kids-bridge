// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { listPoster, ProgramItem } from '../components/ProgramItem'
import { getMockProgram } from '../data/mock'
import { emptyFilters } from '../data/types'
import type { Locale, Program } from '../data/types'

afterEach(cleanup)

/** 시연 공고(demo-korean: 가족 자격·동반이 미확인)에 필요한 값만 바꾼 것 */
const program = (overrides: Partial<Program> = {}): Program => ({ ...getMockProgram('demo-korean', emptyFilters())!, ...overrides })

const renderItem = (item: Program, locale: Locale = 'ko-easy') =>
  render(<I18nProvider initial={locale}><ul><ProgramItem program={item} /></ul></I18nProvider>)

describe('목록 카드', () => {
  it('맞는 이유를 위쪽 초록 알약(.item-match)으로 보여 준다', () => {
    const { container } = renderItem(program({ age_grade_match_status: 'matched', time_match_status: 'matched' }))
    const pills = container.querySelector('.item-match')!
    expect([...pills.children].map((pill) => pill.textContent)).toEqual(['나이·학년 맞아요', '시간 맞아요'])
    expect(pills.querySelectorAll('svg.icon')).toHaveLength(2)
    expect(container.querySelector('.item-body')!.firstElementChild).toBe(pills)
  })

  it('조건을 넣지 않았거나 맞는 것이 없으면 알약을 그리지 않는다', () => {
    const { container } = renderItem(program({ age_grade_match_status: 'unknown', time_match_status: 'not_applied' }))
    expect(container.querySelector('.item-match')).toBeNull()
  })

  it('기관에 확인할 점은 개수 칩 하나로 보여 주고, 전체 항목은 읽기 프로그램에 남긴다', () => {
    const { container } = renderItem(program())
    const chip = container.querySelector('.item-check-chip')!
    expect(chip.getAttribute('aria-hidden')).toBe('true')
    expect(chip.textContent).toBe('기관에 확인할 점2')
    expect(container.querySelector('.item-checks .marked')).toBeNull()
    const full = container.querySelector('.item-checks .visually-hidden')!
    expect(full.textContent).toBe('기관에 확인할 점: 가족 자격(다문화가족 여부 등), 보호자·형제자매가 함께 갈 수 있는지')
    // 링크 이름은 짧게 두고, 카드 내용(전체 항목 포함)은 설명으로 읽는다
    const link = screen.getByRole('link', { name: '주말 한국어 놀이교실 자세히 보기' })
    expect(document.getElementById(link.getAttribute('aria-describedby')!)!.contains(full)).toBe(true)
  })

  it('확인할 점이 없으면 칩이 없다', () => {
    const { container } = renderItem(program({ uncertain_items: [], age_grade_match_status: 'matched', time_match_status: 'matched' }))
    expect(container.querySelector('.item-checks')).toBeNull()
  })

  it('기관이 덧붙인 안내가 답한 주제는 확인할 점 개수에서 빼고, 비용에 답했으면 비용 칸에 그 문장을 보인다', () => {
    const addenda = [
      { topic: 'companion' as const, text: '형제자매도 함께 올 수 있어요.', added_at: '2026-10-15', covers: ['companion'] },
      { topic: 'other' as const, text: '참가비: 무료', added_at: '2026-10-15', covers: ['cost'], translations: { vi: 'Phí tham gia: Miễn phí' } },
    ]
    const { container } = renderItem(program({ cost_krw: null, cost_raw: null, addenda }), 'vi')
    expect(container.querySelector('.item-check-count')!.textContent).toBe('1')
    const cost = screen.getByText('Phí tham gia: Miễn phí')
    expect(cost.closest('mark')).toBeNull()
    expect(cost.closest('.item-fact')!.querySelector('b')!.textContent).toBe('Chi phí')
    expect(screen.queryByText('Cần hỏi chi phí')).toBeNull()
    cleanup()
    // 안내가 없으면 그대로 ‘비용 확인 필요’ 형광펜
    renderItem(program({ cost_krw: null, cost_raw: null }))
    expect(screen.getByText('비용 확인 필요').tagName).toBe('MARK')
  })

  it('장소 칸은 기관이 적은 한국어 장소 이름에만 lang="ko"를 붙인다', () => {
    const session = { id: 's1', date: '2026-10-24', start_time: '10:00', end_time: '12:00', place_name: '신장동 청소년문화의집', dong: '신장동', online: false }
    renderItem(program({ next_session: session }), 'vi')
    expect(screen.getByText('신장동 청소년문화의집').getAttribute('lang')).toBe('ko')
    cleanup()
    renderItem(program({ next_session: { ...session, place_name: null, online: true } }), 'vi')
    expect(screen.getByText('Trực tuyến').getAttribute('lang')).toBeNull()
  })

  it('시연용 가상 공고에만 ‘시연용 예시’ 꼬리표를 붙인다', () => {
    renderItem(program({ is_demo: true }), 'vi')
    expect(screen.getByText('Ví dụ mô phỏng').className).toContain('tag-demo')
    cleanup()
    renderItem(program({ is_demo: false }))
    expect(screen.queryByText('시연용 예시')).toBeNull()
  })
})

describe('목록 카드 포스터 썸네일', () => {
  const posters = { original: true, languages: ['vi'] as ('vi' | 'zh')[] }

  it('화면 언어 번역본이 있으면 그것을, 없거나 쉬운 한국어면 원본을, 포스터가 없으면 null', () => {
    expect(listPoster(program({ posters }), 'vi')).toBe('vi')
    expect(listPoster(program({ posters }), 'zh')).toBe('original')
    expect(listPoster(program({ posters }), 'ko-easy')).toBe('original')
    expect(listPoster(program({ posters: { original: false, languages: [] } }), 'ko-easy')).toBeNull()
    expect(listPoster(program(), 'vi')).toBeNull()
  })

  it('번역본 썸네일에는 ‘AI 번역’ 표시를 달고, 원본에는 달지 않는다. 둘 다 64px 정사각형의 세 배 폭을 덮는 썸네일을 받는다', () => {
    const { container } = renderItem(program({ posters }), 'vi')
    const image = container.querySelector('.item-poster img')!
    expect(image.getAttribute('src')).toMatch(/\/posters\/demo-korean\/vi\?w=256$/)
    expect(image.getAttribute('loading')).toBe('lazy')
    expect([image.getAttribute('width'), image.getAttribute('height'), image.getAttribute('alt')]).toEqual(['64', '64', ''])
    expect(container.querySelector('.item-poster-ai')!.textContent).toBe('AI dịch')
    expect(container.querySelector('.item-art')).toBeNull()
    cleanup()
    const original = renderItem(program({ posters }), 'ko-easy').container
    expect(original.querySelector('.item-poster img')!.getAttribute('src')).toMatch(/\/posters\/demo-korean\/original\?w=256$/)
    expect(original.querySelector('.item-poster-ai')).toBeNull()
  })

  it('번역본을 못 불러오면 한국어 원본으로, 원본도 못 불러오면 분야 그림을 보여 준다', () => {
    const { container } = renderItem(program())
    expect(container.querySelector('.item-poster')).toBeNull()
    expect(container.querySelector('.item-art .interest-icon')).toBeTruthy()
    cleanup()
    const broken = renderItem(program({ posters }), 'vi').container
    fireEvent.error(broken.querySelector('.item-poster img')!)
    expect(broken.querySelector('.item-poster img')!.getAttribute('src')).toMatch(/\/original\?w=256$/)
    expect(broken.querySelector('.item-poster-ai')).toBeNull()
    fireEvent.error(broken.querySelector('.item-poster img')!)
    expect(broken.querySelector('.item-poster')).toBeNull()
    expect(broken.querySelector('.item-art')).toBeTruthy()
    cleanup()
    // 원본이 없으면 번역본 다음은 바로 분야 그림
    const noOriginal = renderItem(program({ posters: { original: false, languages: ['vi'] } }), 'vi').container
    fireEvent.error(noOriginal.querySelector('.item-poster img')!)
    expect(noOriginal.querySelector('.item-art')).toBeTruthy()
  })
})
