import type { Interest } from '../data/types'

/** 분야별 그림과 바탕색. 그림은 장식이며 뜻은 항상 글자로도 적습니다. */
export const INTEREST_VISUAL: Record<Interest, { emoji: string; tone: string }> = {
  experience_culture: { emoji: '🎨', tone: 'peach' },
  korean_study: { emoji: '📖', tone: 'sky' },
  sports_arts: { emoji: '⚽', tone: 'leaf' },
  career: { emoji: '🧭', tone: 'lilac' },
}
