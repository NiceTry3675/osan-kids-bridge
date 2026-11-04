// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigate, SCROLL_ROOT_ID } from '../lib/router'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('화면 틀 안의 스크롤', () => {
  it('페이지를 넘길 때 틀 안의 위치를 기억하고, 새 페이지는 맨 위에서 시작한다', () => {
    const root = document.createElement('div')
    root.id = SCROLL_ROOT_ID
    document.body.append(root)
    root.scrollTop = 320
    const remembered = vi.spyOn(window.history, 'replaceState')
    const windowScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    navigate('/programs/demo-korean', { fromList: true })

    expect(remembered.mock.calls[0][0]).toMatchObject({ scrollY: 320 })
    expect(root.scrollTop).toBe(0)
    // 틀은 움직이지 않습니다
    expect(windowScroll).not.toHaveBeenCalled()
  })
})
