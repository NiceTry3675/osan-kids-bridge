import { describe, expect, it } from 'vitest'
import { BOOT_SCRIPT, frameDocument, toScriptString } from './frame.js'
import { shellPage } from './shell.js'

describe('휴대폰 틀 시연 페이지', () => {
  it('틀 안에서 #/ 주소를 자기 문서 기준으로 바꾼다', () => {
    const calls = []
    const history = { pushState: (_s, _t, u) => calls.push(u), replaceState: (_s, _t, u) => calls.push(u) }
    new Function('history', BOOT_SCRIPT)(history)
    history.pushState(null, '', '#/programs/demo-art')
    history.replaceState(null, '', 'about:srcdoc#/')
    expect(calls).toEqual(['about:srcdoc#/programs/demo-art', 'about:srcdoc#/'])
  })

  it('앱 코드 안의 </script>가 틀 문서를 끊지 않는다', () => {
    const doc = frameDocument({ css: '', js: 'const a = "</script>"' })
    expect(doc.match(/<\/script>/g)).toHaveLength(3)
  })

  it('부모 페이지에 싣는 문자열에는 < 가 남지 않고 원래대로 되돌아온다', () => {
    const text = '<div>안녕</div>' + String.fromCharCode(0x2028)
    const encoded = toScriptString(text)
    expect(encoded).not.toContain('<')
    expect(JSON.parse(encoded)).toBe(text)
  })

  it('틀은 375×760 고정이고 휴대폰에서는 화면 전체를 쓴다', () => {
    const page = shellPage({ title: 't', label: '보호자 웹', css: '', js: '' })
    expect(page).toContain('width: 375px; height: 760px')
    expect(page).toContain('@media (max-width: 480px)')
  })
})
