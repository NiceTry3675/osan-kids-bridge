import { describe, expect, it } from 'vitest'
import { FLOWS } from './flows'
import { bootScript, frameDocument } from './frame'

describe('유저플로우 보드', () => {
  it('보호자와 운영기관 모두 일곱 화면이고 id가 겹치지 않는다', () => {
    for (const flow of FLOWS) expect(flow.screens).toHaveLength(7)
    const ids = FLOWS.flatMap((flow) => flow.screens.map((screen) => screen.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('틀마다 저장소를 따로 두고 시작 주소를 맞추는 스크립트를 만든다', () => {
    const script = bootScript({ local: { a: '1' }, session: { b: '</script>' }, hash: '#/programs/demo-art' })
    expect(script).not.toContain('</script>')
    const fakeWindow: Record<string, unknown> = {}
    let url = ''
    const history = { pushState: () => undefined, replaceState: (_s: unknown, _t: string, next: string) => { url = next } }
    new Function('window', 'history', 'location', script)(fakeWindow, history, {})
    const local = fakeWindow.localStorage as Storage
    expect(local.getItem('a')).toBe('1')
    local.setItem('c', '2')
    expect(local.getItem('c')).toBe('2')
    expect((fakeWindow.sessionStorage as Storage).getItem('b')).toBe('</script>')
    expect(url).toBe('about:srcdoc#/programs/demo-art')
  })

  it('틀 문서는 부트 스크립트를 앱보다 먼저 싣는다', () => {
    const doc = frameDocument({ css: 'body{}', js: 'console.log(1)' }, {})
    expect(doc.indexOf('Object.defineProperty')).toBeLessThan(doc.indexOf('console.log(1)'))
  })
})
