/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// vitest는 CSS를 처리하지 않아 ?raw로 읽으면 빈 글자가 되므로 파일을 직접 읽는다
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

/** `@media (max-width: …)` 블록 안쪽 글자 (중괄호 짝을 맞춰 자른다) */
function media(query: string): string {
  const start = css.indexOf(`@media (${query}) {`)
  expect(start, query).toBeGreaterThanOrEqual(0)
  let depth = 0
  for (let at = css.indexOf('{', start); at < css.length; at++) {
    if (css[at] === '{') depth++
    else if (css[at] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, at)
  }
  throw new Error(`닫히지 않은 블록: ${query}`)
}

/** 선택자 하나의 선언 (블록 안에서 처음 나오는 것) */
function rule(source: string, selector: string): string {
  const match = new RegExp(`(^|[\\s}])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(source)
  expect(match, selector).not.toBeNull()
  return match![2]
}

// 실제 폭(768·375·320px, 쉬운 한국어·베트남어·중국어)에서 가로 넘침이 없는지는 브라우저로 쟀다. 여기서는 그 원인이 된 규칙이 되돌아가지 않게만 지킨다
describe('좁은 화면에서 화면 전체가 옆으로 밀리지 않게', () => {
  it('960px 아래: 본문 칸이 메뉴 막대의 최소 폭만큼 늘어나지 않고, 메뉴는 막대 안에서만 넘긴다', () => {
    const narrow = media('max-width: 960px')
    expect(rule(narrow, '.admin')).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(rule(narrow, '.side')).toContain('min-width: 0')
    const nav = rule(narrow, '.side-nav')
    expect(nav).toContain('min-width: 0')
    expect(nav).toContain('overflow-x: auto')
  })

  it('공고 표의 숨은 글자(absolute)는 옆으로 넘기는 표 카드 안에 묶인다', () => {
    const card = rule(css, '.table-card')
    expect(card).toContain('position: relative')
    expect(card).toContain('overflow-x: auto')
  })

  it('360px 이하: 분야 고르기 다섯 칸을 두 줄로 나눈다', () => {
    expect(rule(media('max-width: 360px'), '.tiles--five')).toContain('repeat(3, minmax(0, 1fr))')
  })
})
