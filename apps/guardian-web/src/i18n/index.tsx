import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { langAttr } from '@osan-kids-bridge/ui'
import type { Locale } from '../data/types'
import { messages } from './messages'
import type { MessageKey } from './messages'
import { isSelectable, LOCALES } from './policy'

export type { MessageKey } from './messages'
export type Vars = Record<string, string | number>

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const template = messages[locale][key] ?? messages['ko-easy'][key]
  return vars ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : template
}

const STORAGE_KEY = 'osan-guardian-locale'

export function readStoredLocale(raw: string | null, allowDraft?: boolean): Locale {
  return raw && (LOCALES as readonly string[]).includes(raw) && isSelectable(raw as Locale, allowDraft) ? (raw as Locale) : 'ko-easy'
}

const DEVICE_LOCALE: Record<string, Locale> = { vi: 'vi', zh: 'zh', ko: 'ko-easy' }

/**
 * 처음 온 사람의 화면 언어: 기기 언어 중 제공하는 첫 언어. 없으면 쉬운 한국어.
 * 한국어를 읽기 전에 내 언어로 시작하게 하려는 것이고, 고른 언어가 있으면 그것을 씁니다.
 */
export function detectLocale(languages: readonly string[], allowDraft?: boolean): Locale {
  for (const language of languages) {
    const locale = DEVICE_LOCALE[language.toLowerCase().split('-')[0]]
    if (locale && isSelectable(locale, allowDraft)) return locale
  }
  return 'ko-easy'
}

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? readStoredLocale(stored) : detectLocale(navigator.languages ?? [navigator.language])
  } catch {
    return 'ko-easy'
  }
}

interface I18n {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Vars) => string
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return initial ?? initialLocale()
  })
  const setLocale = useCallback((next: Locale) => {
    if (!isSelectable(next)) return
    setLocaleState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* 이 기기에서만 기억하지 못할 뿐 */ }
  }, [])
  useEffect(() => { document.documentElement.lang = langAttr(locale) }, [locale])
  const value = useMemo<I18n>(() => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }), [locale, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('I18nProvider가 필요합니다.')
  return value
}
