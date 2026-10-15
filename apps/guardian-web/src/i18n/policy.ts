/**
 * 화면 언어 공개 정책(명세 v2.2 9장 6항).
 * 공개 빌드에는 최종 검수된 UI 문구만 고를 수 있게 하고, 검수 전 초안은 개발·시연 빌드에서만 엽니다.
 * 검수가 끝나면 UI_REVIEW의 값을 'reviewed'로 바꾸고 CONTENT_REVIEW.md에 기록합니다.
 */
import type { LanguageOption, LanguageState } from '@osan-kids-bridge/ui'
import type { Locale } from '../data/types'

export const LOCALES: readonly Locale[] = ['ko-easy', 'vi', 'zh']

export const UI_REVIEW: Record<Locale, 'reviewed' | 'draft'> = {
  'ko-easy': 'reviewed',
  vi: 'draft',
  zh: 'draft',
}

const NATIVE: Record<Locale, { native: string; aliases: string[] }> = {
  'ko-easy': { native: '쉬운 한국어', aliases: ['한국어', 'korean', 'ko', 'tieng han', '韩语', '韩文'] },
  vi: { native: 'Tiếng Việt', aliases: ['베트남어', 'vietnamese', 'vi', 'tieng viet', '越南语'] },
  zh: { native: '中文', aliases: ['중국어', 'chinese', 'zh', 'zhongwen', 'mandarin', '汉语', 'tieng trung'] },
}

const draftLocalesAllowed = (): boolean => import.meta.env.DEV || import.meta.env.VITE_DATA_MODE === 'demo'

export function localeState(locale: Locale, allowDraft = draftLocalesAllowed()): LanguageState {
  if (UI_REVIEW[locale] === 'reviewed') return 'available'
  return allowDraft ? 'draft' : 'in_review'
}

export const isSelectable = (locale: Locale, allowDraft = draftLocalesAllowed()) => localeState(locale, allowDraft) !== 'in_review'

export function languageOptions(allowDraft = draftLocalesAllowed()): LanguageOption<Locale>[] {
  return LOCALES.map((code) => ({ code, ...NATIVE[code], state: localeState(code, allowDraft) }))
}
