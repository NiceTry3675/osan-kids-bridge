/** 포스터 이미지를 고르는 차례: 화면 언어 번역본 → 한국어 원본 → (둘 다 못 불러오면) 없음 */
import { useState } from 'react'
import { posterUrl } from '../data/agent'
import type { PosterLanguage } from '../data/agent'

export type PosterVariant = PosterLanguage | 'original'

export interface ShownImage {
  variant: PosterVariant
  src: string
}

/**
 * 번역본 이미지를 못 불러오면 한국어 원본으로 바꾸고, 원본도 안 되면 null을 돌려줍니다(그때는 분야 그림 등으로).
 * 못 불러온 주소를 기억하므로 공고·언어·폭이 바뀌어 주소가 달라지면 처음부터 다시 고릅니다.
 * cssWidth를 주면 썸네일(?w=), 없으면 원래 크기 이미지입니다.
 */
export function usePosterImage(programId: string, variant: PosterVariant | null, hasOriginal: boolean, cssWidth?: number) {
  const [failed, setFailed] = useState<string[]>([])
  const order: PosterVariant[] = !variant ? [] : variant === 'original' || !hasOriginal ? [variant] : [variant, 'original']
  const shown: ShownImage | null = order
    .map((item) => ({ variant: item, src: posterUrl(programId, item, cssWidth) }))
    .find((item) => !failed.includes(item.src)) ?? null
  const onError = () => { if (shown) setFailed((list) => (list.includes(shown.src) ? list : [...list, shown.src])) }
  return { shown, onError }
}
