import { describe, expect, it } from 'vitest'
import { searchLanguages } from '@osan-kids-bridge/ui'
import { readStoredLocale, translate } from '../i18n'
import { messages } from '../i18n/messages'
import { languageOptions, localeState, UI_REVIEW } from '../i18n/policy'
import type { Locale } from '../data/types'

const locales: Locale[] = ['ko-easy', 'vi', 'zh']
const slots = (copy: string) => [...copy.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('문구 목록', () => {
  it('세 언어 모두 같은 키와 같은 변수를 가진다', () => {
    const keys = Object.keys(messages['ko-easy']).sort()
    for (const locale of locales) {
      expect(Object.keys(messages[locale]).sort()).toEqual(keys)
      for (const key of keys as (keyof typeof messages['ko-easy'])[]) {
        expect(messages[locale][key].trim(), `${locale}.${key}`).not.toBe('')
        expect(slots(messages[locale][key]), `${locale}.${key}`).toEqual(slots(messages['ko-easy'][key]))
      }
    }
  })

  it('날짜·금액을 바꾸지 않고 넣는다', () => {
    for (const locale of locales) {
      expect(translate(locale, 'won', { amount: '10,000' })).toContain('10,000')
      expect(translate(locale, 'upcomingAction', { date: '10/20' })).toContain('10/20')
    }
  })
})

describe('화면 언어 공개 정책(명세 9장 6항)', () => {
  it('공개 빌드에서는 검수된 언어만 고를 수 있고, 초안은 "검수 중"으로 보인다', () => {
    expect(UI_REVIEW.vi).toBe('draft')
    expect(localeState('vi', false)).toBe('in_review')
    expect(localeState('vi', true)).toBe('draft')
    expect(languageOptions(false).filter((option) => option.state !== 'in_review').map((option) => option.code)).toEqual(['ko-easy'])
  })

  it('공개 빌드에서 저장된 초안 언어는 쉬운 한국어로 되돌린다', () => {
    expect(readStoredLocale('vi', false)).toBe('ko-easy')
    expect(readStoredLocale('vi', true)).toBe('vi')
    expect(readStoredLocale('fr', true)).toBe('ko-easy')
  })

  it('언어 이름을 여러 표기로 찾고, 제공하지 않는 언어는 따로 알려 준다', () => {
    const options = languageOptions(true)
    expect(searchLanguages(options, '베트남').offered.map((option) => option.code)).toEqual(['vi'])
    expect(searchLanguages(options, 'TIENG VIET').offered.map((option) => option.code)).toEqual(['vi'])
    expect(searchLanguages(options, '中文').offered.map((option) => option.code)).toEqual(['zh'])
    expect(searchLanguages(options, 'english')).toEqual({ offered: [], notOffered: ['English'] })
  })
})
