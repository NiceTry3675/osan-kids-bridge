import type { Grade, Interest, KoreanLevel, ScreenLanguage } from '../types'

export const INTERESTS: Interest[] = ['experience_culture', 'korean_study', 'sports_arts', 'career']
export const LANGUAGES: ScreenLanguage[] = ['ko-easy', 'vi', 'zh']
export const KOREAN_LEVELS: KoreanLevel[] = ['beginner', 'intermediate', 'fluent']
export const GRADES: Grade[] = [1, 2, 3, 4, 5, 6]

/** 보호자 웹 src/format.ts의 관심 분야 이름과 같게 둡니다. */
export const INTEREST_LABELS: Record<Interest, string> = {
  experience_culture: '체험·문화',
  korean_study: '한국어',
  sports_arts: '예술·체육',
  career: '진로',
}
export const LANGUAGE_LABELS: Record<ScreenLanguage, string> = { 'ko-easy': '쉬운 한국어', vi: '베트남어', zh: '중국어' }
export const KOREAN_LEVEL_LABELS: Record<KoreanLevel | 'none', string> = { beginner: '초급', intermediate: '중급', fluent: '유창', none: '미응답' }

export const percent = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0)
export const formatNumber = (value: number): string => value.toLocaleString('ko-KR')
