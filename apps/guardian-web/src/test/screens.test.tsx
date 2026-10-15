// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { DetailScreen } from '../screens/detail/DetailScreen'
import { emptyFilters } from '../data/types'
import type { Locale } from '../data/types'

vi.hoisted(() => { vi.stubEnv('VITE_DATA_MODE', 'demo') })
afterEach(cleanup)

const renderDetail = (id: string, locale: Locale, filters = null as Parameters<typeof DetailScreen>[0]['filters']) =>
  render(<I18nProvider initial={locale}><DetailScreen id={id} filters={filters} /></I18nProvider>)

describe('상세 화면', () => {
  it('선택한 언어의 검수본이 없으면 그 사실을 먼저 알리고 원문은 접어 둔다', async () => {
    renderDetail('demo-art', 'vi')
    expect(await screen.findByText(/chưa có hướng dẫn bằng Tiếng Việt/)).toBeTruthy()
    expect(screen.getByText('Xem bản gốc tiếng Hàn')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).getAttribute('lang')).toBe('ko')
  })

  it('검수본이 있으면 그 언어로 보여 주고 원문 대조 사실을 표시한다', async () => {
    renderDetail('demo-korean', 'zh')
    expect(await screen.findByRole('heading', { level: 1, name: /周末韩语游戏班/ })).toBeTruthy()
    expect(screen.getByText(/与原文核对过/)).toBeTruthy()
  })

  it('신청과 문의를 다른 행동으로 두고, 문의처가 없으면 없다고 말한다', async () => {
    renderDetail('demo-art', 'ko-easy')
    fireEvent.click(await screen.findByRole('button', { name: '신청하러 가기' }))
    expect(screen.getByText('방문해서 신청')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /물어보기/ })[0])
    expect(await screen.findByText('확인된 문의처가 없어요')).toBeTruthy()
  })

  it('신청 기간을 모르면 신청 버튼 대신 원문 확인을 안내한다', async () => {
    renderDetail('demo-reading', 'ko-easy')
    expect(await screen.findByRole('button', { name: '원문에서 신청 방법 보기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '신청하러 가기' })).toBeNull()
  })

  it('공유 링크로 열면 아이 조건과 비교하지 않았다고 알린다', async () => {
    renderDetail('demo-craft', 'ko-easy')
    expect(await screen.findByText(/공유 링크로 열어서/)).toBeTruthy()
  })

  it('목록에서 조건을 가지고 들어오면 나이·학년 판정을 보여 준다', async () => {
    renderDetail('demo-korean', 'ko-easy', { ...emptyFilters(), child_grade: 2 })
    const compare = (await screen.findByRole('heading', { name: '우리 아이 조건과 비교' })).closest('section')!
    expect(within(compare).getByText('맞아요')).toBeTruthy()
    expect(within(compare).getByText('공고만으로는 알 수 없어요')).toBeTruthy()
  })

  it('원문이 바뀐 공고는 재검수 중임을 알린다', async () => {
    renderDetail('demo-choir', 'ko-easy')
    expect(await screen.findByText('기관 원문이 바뀌어 다시 확인하고 있어요')).toBeTruthy()
  })

  it('없는 공고는 탐색으로 돌려보낸다', async () => {
    renderDetail('nope', 'ko-easy')
    expect(await screen.findByText('이 공고는 볼 수 없어요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다른 프로그램 보기' })).toBeTruthy()
  })
})
