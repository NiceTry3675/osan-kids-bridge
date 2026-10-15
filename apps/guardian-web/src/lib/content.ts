/** 공고 내용을 화면에 고르는 규칙: 어느 언어 글을 쓸지, 무엇을 기관에 확인해야 하는지 */
import type { Interest, Locale, Program, ReviewedSummary, UncertainItem } from '../data/types'

/** 분야별 그림과 바탕색. 그림은 장식이고 뜻은 늘 글자로도 적습니다. */
export const INTEREST_VISUAL: Record<Interest, { emoji: string; tone: string }> = {
  experience_culture: { emoji: '🎨', tone: 'peach' },
  korean_study: { emoji: '📖', tone: 'sky' },
  sports_arts: { emoji: '⚽', tone: 'leaf' },
  career: { emoji: '🧭', tone: 'lilac' },
}

export interface ProgramText {
  title: string
  institution: string
  target: string
  description: string
  /** 선택한 언어의 검수본을 쓰는지 */
  reviewed: boolean
  /** 선택한 언어가 한국어가 아닌데 검수본이 없어 한국어 원문을 보여 주는지(명세 5.4) */
  missingTranslation: boolean
  /** 원문을 보여 줄 때 붙일 lang 속성 */
  lang: 'ko' | undefined
  summary: ReviewedSummary | null
}

/** 검수본이 있으면 그 언어의 글을, 없으면 한국어 원문을 돌려줍니다. */
export function programText(program: Program, locale: Locale): ProgramText {
  const summary = program.summaries_by_language[locale] ?? null
  if (summary) return { ...summary, reviewed: true, missingTranslation: false, lang: undefined, summary }
  return {
    title: program.title,
    institution: program.institution,
    target: program.target_raw,
    description: program.description,
    reviewed: false,
    missingTranslation: locale !== 'ko-easy',
    lang: 'ko',
    summary: null,
  }
}

/** 회차마다 장소가 다르면 대표 회차의 장소를 전체 장소처럼 보이게 하지 않습니다(명세 5.1). */
export function placesDiffer(program: Program): boolean {
  return new Set(program.sessions.map((item) => (item.online ? 'online' : item.place_name ?? '?'))).size > 1
}

/** 기관에 확인할 항목: 공고의 미확인 항목 + 판정이 unknown인 나이·학년·시간 */
export function itemsToCheck(program: Program): UncertainItem[] {
  const items = [...program.uncertain_items]
  const has = (topic: UncertainItem['topic']) => items.some((item) => item.topic === topic)
  if (program.time_match_status === 'unknown' && !has('schedule')) items.unshift({ topic: 'schedule', note_ko: null })
  if (program.age_grade_match_status === 'unknown' && !has('age_grade')) items.unshift({ topic: 'age_grade', note_ko: null })
  return items
}

/** 화면 언어로 상담이 된다고 기관 자료에서 확인됐는지 */
export const consultsIn = (program: Program, locale: Locale): boolean =>
  program.inquiry_methods.some((method) => method.languages?.includes(locale)) || !!program.support_languages?.includes(locale)

/** 지금 신청 행동을 보여 줄 수 있는지(명세 5.2: open이고 확인된 방법이 있을 때만) */
export const canApply = (program: Program): boolean => program.application_status === 'open' && program.application_methods.length > 0
