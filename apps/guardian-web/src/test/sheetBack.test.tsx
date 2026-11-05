// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { Sheet } from '../components/Sheet'

HTMLDialogElement.prototype.showModal = function showModal() { this.open = true }
HTMLDialogElement.prototype.close = function close() { this.open = false }

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '') })

const view = (open: boolean, onClose = () => {}) => <I18nProvider initial="ko-easy"><Sheet open={open} onClose={onClose} title="시트">내용</Sheet></I18nProvider>

describe('시트를 열 때의 포커스', () => {
  it('첫 단추가 아니라 시트 자체로 옮겨 테두리가 뜨지 않게 한다', () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const { rerender } = render(view(true))
    expect(document.activeElement).toBe(document.querySelector('dialog'))
    rerender(view(false))
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})

describe('늦게 온 닫힘 신호', () => {
  it('다시 연 시트는 지난번에 닫을 때의 close 신호로 닫히지 않는다', () => {
    const onClose = vi.fn()
    render(view(false, onClose))
    const dialog = document.querySelector('dialog')!
    dialog.open = true
    fireEvent(dialog, new Event('close'))
    expect(onClose).not.toHaveBeenCalled()
    dialog.open = false
    fireEvent(dialog, new Event('close'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('시트와 뒤로 가기', () => {
  it('뒤로 가기는 페이지를 떠나지 않고 시트를 닫는다', () => {
    const onClose = vi.fn()
    render(view(true, onClose))
    expect((window.history.state as { sheet?: boolean }).sheet).toBe(true)
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('닫기 단추로 닫으면 넣었던 기록을 도로 뺀다', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const { rerender } = render(view(true))
    rerender(view(false))
    expect(back).toHaveBeenCalledOnce()
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  it('닫으며 부른 뒤로 가기 신호가 늦게 와도 다시 연 시트는 닫히지 않는다', () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const onClose = vi.fn()
    const { rerender } = render(view(true, onClose))
    rerender(view(false, onClose))
    rerender(view(true, onClose))
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(onClose).not.toHaveBeenCalled()
    // 그다음 뒤로 가기는 사용자의 것이므로 닫습니다.
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('시트 안에서 다른 페이지로 넘어갔으면 기록을 건드리지 않는다', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const { unmount } = render(view(true))
    window.history.pushState({ fromChat: true }, '')
    unmount()
    expect(back).not.toHaveBeenCalled()
  })
})
