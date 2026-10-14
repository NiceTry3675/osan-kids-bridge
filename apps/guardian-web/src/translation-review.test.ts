import { describe, expect, it } from 'vitest'
import { availableLocales, messages, translate } from './language'
import type { Locale } from './language'

const locales: Locale[] = ['ko-easy', 'vi', 'zh']
const slots = (copy: string) => [...copy.matchAll(/\{([a-z]+)\}/g)].map((match) => match[1]).sort()

describe('translation catalog integrity', () => {
  it('keeps unreviewed language choices in explicit demo mode', () => {
    if (import.meta.env.VITE_DATA_MODE === 'demo') expect(availableLocales).toEqual(['ko-easy', 'vi', 'zh'])
    else expect(availableLocales).toEqual(['ko-easy'])
  })

  it('has a nonempty translation and the same variable slots for every UI message', () => {
    const keys = Object.keys(messages['ko-easy']) as (keyof typeof messages['ko-easy'])[]
    for (const locale of locales) {
      expect(Object.keys(messages[locale]).sort()).toEqual([...keys].sort())
      for (const key of keys) {
        expect(messages[locale][key].trim(), `${locale}.${key}`).not.toBe('')
        expect(slots(messages[locale][key]), `${locale}.${key}`).toEqual(slots(messages['ko-easy'][key]))
      }
    }
  })

  it('keeps dates and amounts intact in application copy', () => {
    for (const locale of locales) {
      expect(translate(locale, 'applyFrom', { date: '10:05' })).toContain('10:05')
      expect(translate(locale, 'won', { amount: '10,000' })).toContain('10,000')
    }
  })
})
