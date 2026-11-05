// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
import { I18nProvider } from '../i18n'

vi.hoisted(() => { vi.stubEnv('VITE_DATA_MODE', 'demo') })

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

const NOTICE = '시연용 화면이에요. 프로그램과 일정은 예시이고, 기관이 실제로 여는 것이 아니에요.'
const open = () => render(<I18nProvider initial="ko-easy"><App /></I18nProvider>)

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('조건 지우기', () => {
  it('되돌리기 안내 없이 처음 목록으로 돌아간다', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '둘러보기 시작' }))
    const interest = await screen.findByRole('button', { name: /^한국어/ })
    fireEvent.click(interest)
    fireEvent.click(await screen.findByRole('button', { name: '조건 지우기' }))
    expect(await screen.findByRole('heading', { name: /지금 볼 수 있는 프로그램/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '조건 지우기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull()
    expect(screen.queryByText('조건을 지웠어요')).toBeNull()
  })
})

describe('데모 모드의 첫 화면', () => {
  it('둘러보기를 시작한 뒤 다시 열어도 첫 화면부터 보인다', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '둘러보기 시작' }))
    expect(screen.queryByRole('button', { name: '둘러보기 시작' })).toBeNull()
    expect(await screen.findByRole('heading', { name: /지금 볼 수 있는 프로그램/ })).toBeTruthy()

    cleanup()
    open()
    expect(screen.getByRole('button', { name: '둘러보기 시작' })).toBeTruthy()
  })

  it('예전에 본 기록이 남아 있어도 첫 화면부터 보인다', () => {
    localStorage.setItem('osan-guardian-intro-seen', '1')
    open()
    expect(screen.getByRole('button', { name: '둘러보기 시작' })).toBeTruthy()
  })

  it('공유 링크로 온 상세는 첫 화면 없이 바로 연다', () => {
    window.history.replaceState(null, '', '/programs/demo-korean')
    open()
    expect(screen.queryByRole('button', { name: '둘러보기 시작' })).toBeNull()
  })

  it('첫 화면에 시연용이라고 알린다', () => {
    open()
    expect(screen.getByText(NOTICE)).toBeTruthy()
  })

  it('첫 화면을 건너뛴 상세에도 시연용이라고 알린다', async () => {
    window.history.replaceState(null, '', '/programs/demo-korean')
    open()
    expect(await screen.findByText(NOTICE)).toBeTruthy()
  })
})
