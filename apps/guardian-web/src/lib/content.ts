/** 공고 내용을 화면에 고르는 규칙: 어느 언어 글을 쓸지, 무엇을 기관에 확인해야 하는지 */
import type { Interest, Locale, Program, ReviewedSummary, UncertainItem } from '../data/types'

const CIRCLE = 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17Z'

/**
 * 분야별 그림과 바탕색. 그림은 장식이고 뜻은 늘 글자로도 적습니다.
 * icon은 첫 화면·홈의 선 아이콘과 같은 그림체(24 격자, 선)로 그린 경로이고, emoji는 예전 그림입니다.
 */
export const INTEREST_VISUAL: Record<Interest, { emoji: string; tone: string; icon: string[] }> = {
  // 팔레트
  experience_culture: { emoji: '🎨', tone: 'peach', icon: [
    'M12 3.5c-4.8 0-8.5 3.6-8.5 8.3 0 4.8 3.8 8.7 8.4 8.7 1.3 0 2-.8 2-1.8 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8h2.1c2.2 0 3.8-1.7 3.8-3.9 0-3.9-3.8-6.8-8.5-6.8Z',
    'M7.6 11a.9.9 0 1 0 0 1.8.9.9 0 1 0 0-1.8ZM9.7 7a.9.9 0 1 0 0 1.8.9.9 0 1 0 0-1.8ZM14.2 6.6a.9.9 0 1 0 0 1.8.9.9 0 1 0 0-1.8Z',
  ] },
  // 펼친 책
  korean_study: { emoji: '📖', tone: 'sky', icon: [
    'M3.5 6c2.8-.8 5.7-.5 8.5 1.4 2.8-1.9 5.7-2.2 8.5-1.4v12.5c-2.8-.8-5.7-.5-8.5 1.4-2.8-1.9-5.7-2.2-8.5-1.4Z',
    'M12 7.4v12.5',
  ] },
  // 공
  sports_arts: { emoji: '⚽', tone: 'leaf', icon: [
    CIRCLE,
    'M12 3.5v17M3.5 12h17M6 6c1.8 1.6 2.8 3.7 2.8 6S7.8 16.4 6 18M18 6c-1.8 1.6-2.8 3.7-2.8 6s1 4.4 2.8 6',
  ] },
  // 나침반
  career: { emoji: '🧭', tone: 'lilac', icon: [
    CIRCLE,
    'm15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1Z',
  ] },
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
  if (summary) return { ...summary, reviewed: summary.status !== 'machine_checked', missingTranslation: false, lang: undefined, summary }
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
