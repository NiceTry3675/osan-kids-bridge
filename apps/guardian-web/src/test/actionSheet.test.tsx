// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { getMockProgram } from '../data/mock'
import { emptyFilters } from '../data/types'
import type { Locale, Program } from '../data/types'
import { ActionSheet } from '../screens/detail/ActionSheet'
import type { ActionTab } from '../screens/detail/ActionSheet'

afterEach(cleanup)

const base = (): Program => ({ ...getMockProgram('demo-korean', emptyFilters())!, is_demo: false, source_url: 'https://example.com/center/recruitReceipt/list.do' })
const open = (program: Program, tab: ActionTab, locale: Locale = 'ko-easy') =>
  render(<I18nProvider initial={locale}><ActionSheet program={program} tab={tab} onTab={() => {}} onClose={() => {}} /></I18nProvider>)
const online = { type: 'online' as const, label: '신청 QR코드', url: 'https://example.com/center/recruitReceipt/list.do' }
const visit = { type: 'visit' as const, label: '방문 접수', address: '대원동 행정복지센터' }

describe('신청하기', () => {
  it('신청 방법을 글로 알리고, 목록 페이지면 찾을 제목을 함께 준다', () => {
    open({ ...base(), application_methods: [online] }, 'apply')
    expect(screen.getByText('신청 QR코드')).toBeTruthy()
    expect(screen.getByText('기관 페이지의 목록에서 이 제목을 찾아 신청하세요.')).toBeTruthy()
    expect(screen.getByText('주말 한국어 놀이교실').getAttribute('lang')).toBe('ko')
  })

  it('공고 자체 주소면 찾으라고 하지 않는다', () => {
    open({ ...base(), application_methods: [{ ...online, url: 'https://example.com/apply/123' }] }, 'apply')
    expect(screen.queryByText('기관 페이지의 목록에서 이 제목을 찾아 신청하세요.')).toBeNull()
  })

  it('신청 기간은 있고 방법만 없으면 기간이 없다고 하지 않는다', () => {
    open({ ...base(), application_status: 'open', application_methods: [] }, 'apply')
    expect(screen.getByText(/신청 방법이 공고에 없어요/)).toBeTruthy()
    expect(screen.queryByText(/신청 기간이 공고에 없어요/)).toBeNull()
  })

  it('기간도 방법도 원문도 없으면 한 줄로 말하고 없는 원문을 찾으라고 하지 않는다', () => {
    open({ ...base(), source_url: null, application_status: 'unknown', application_methods: [] }, 'apply')
    expect(screen.getByText('신청 기간과 방법이 공고에 없어요. 기관에 물어보세요.')).toBeTruthy()
    expect(screen.queryByText(/원문/)).toBeNull()
  })

  it('마감된 공고에는 신청 방법을 내놓지 않는다', () => {
    open({ ...base(), application_status: 'closed', application_methods: [online] }, 'apply')
    expect(screen.queryByRole('link', { name: /기관 신청 페이지 열기/ })).toBeNull()
    expect(screen.queryByText('신청 QR코드')).toBeNull()
  })

  it('방문 접수에는 기관 페이지 이야기와 링크 안내를 하지 않는다', () => {
    open({ ...base(), application_methods: [visit] }, 'apply')
    expect(screen.getByText('대원동 행정복지센터')).toBeTruthy()
    expect(screen.queryByText(/기관 페이지에서 해요/)).toBeNull()
    expect(screen.queryByText('링크가 안 열리나요?')).toBeNull()
  })

  it('신청 시작 전이어도 아는 신청 방법을 보여 준다', () => {
    open({ ...base(), application_status: 'upcoming', application_start: '2026-11-20', application_methods: [visit] }, 'apply')
    expect(screen.getByText(/부터 신청할 수 있어요/)).toBeTruthy()
    expect(screen.getByText('대원동 행정복지센터')).toBeTruthy()
  })
})

describe('물어보기', () => {
  it('문장을 문의처보다 먼저 보여 준다', () => {
    const { container } = open({ ...base(), uncertain_items: [{ topic: 'materials', note_ko: null }] }, 'ask')
    const sentence = container.querySelector('.inquiry-box')!
    const contact = container.querySelector('.contacts')!
    expect(sentence.compareDocumentPosition(contact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('연락처가 없으면 다른 프로그램으로 돌리지 않고 찾을 곳을 알려 준다', () => {
    open({ ...base(), inquiry_methods: [] }, 'ask')
    expect(screen.getByText('이 공고에는 연락처가 없어요')).toBeTruthy()
    expect(screen.getByText('기관 원문에서 연락처를 확인해 주세요.')).toBeTruthy()
    expect(screen.queryByText(/다른 프로그램을 살펴보세요/)).toBeNull()
  })

  it('원문이 없으면 원문을 찾으라는 말을 하지 않는다', () => {
    open({ ...base(), source_url: null, inquiry_methods: [] }, 'ask')
    expect(screen.queryByText('기관 원문에서 연락처를 확인해 주세요.')).toBeNull()
    expect(screen.queryByText('기관 원문 보기')).toBeNull()
  })

  it('다른 언어 화면에서는 한국어 문장이 무엇을 묻는지 그 언어로 알려 준다', () => {
    open({ ...base(), uncertain_items: [{ topic: 'materials', note_ko: null }], cost_krw: null }, 'ask', 'vi')
    expect(screen.getByText(/^Nội dung hỏi:/).textContent).toContain('Chi phí')
    expect(screen.getByText(/안녕하세요/).getAttribute('lang')).toBe('ko')
  })
})
