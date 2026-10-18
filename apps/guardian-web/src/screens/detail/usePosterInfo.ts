import { useEffect, useState } from 'react'
import { getPosterInfo } from '../../data/agent'
import type { PosterInfo, PosterLanguage } from '../../data/agent'
import type { Locale, Program } from '../../data/types'

/** 서버가 공고에 붙여 보내는 포스터 요약(Program.posters). 이 필드를 보내지 않는 서버도 있어 여기서 모양만 적어 둡니다. */
type PosterSummary = { original: boolean; languages: PosterLanguage[] }

/** 상세 화면이 쓰는 포스터 정보: 원본이 있는지, 번역본마다 담당자가 승인했는지(모르면 false) */
export interface Posters {
  original: boolean
  languages: Partial<Record<PosterLanguage, { approved: boolean }>>
}

const fromInfo = (info: PosterInfo): Posters => ({
  original: info.original,
  languages: Object.fromEntries(Object.entries(info.languages).map(([language, entry]) => [language, { approved: entry?.status === 'approved' }])),
})

/** 요약만 있을 때는 승인 여부를 모르므로 ‘담당자 확인 전’으로 둡니다(확인되지 않은 것을 확인된 것처럼 보이지 않게). */
const fromSummary = (summary: PosterSummary): Posters => ({
  original: summary.original,
  languages: Object.fromEntries(summary.languages.map((language) => [language, { approved: false }])),
})

const hasAny = (posters: Posters) => posters.original || Object.keys(posters.languages).length > 0

/**
 * 공고의 포스터 정보를 한 번만 받아 머리글 썸네일과 포스터 구역이 함께 씁니다.
 * 공고에 포스터 요약이 붙어 오면 그것으로 먼저 그리고, 포스터가 없다고 하면 서버에 다시 묻지 않습니다.
 */
export function usePosterInfo(program: Program): Posters | null {
  const summary = (program as Program & { posters?: PosterSummary }).posters
  const none = summary !== undefined && !summary.original && !summary.languages.length
  const id = program.program_id
  const [info, setInfo] = useState<{ id: string; info: PosterInfo | null } | null>(null)

  useEffect(() => {
    if (none) return
    const controller = new AbortController()
    getPosterInfo(id, controller.signal)
      .then((result) => setInfo({ id, info: result }))
      .catch(() => { if (!controller.signal.aborted) setInfo({ id, info: null }) })
    return () => controller.abort()
  }, [id, none])

  const loaded = info?.id === id ? info : null
  const posters = loaded?.info ? fromInfo(loaded.info) : summary ? fromSummary(summary) : null
  return posters && hasAny(posters) ? posters : null
}

/** 화면 언어로 보여 줄 포스터: 베트남어·중국어 번역본이 있으면 그것, 없으면 한국어 원본. 둘 다 없으면 null */
export function shownPoster(posters: Posters | null, locale: Locale): PosterLanguage | 'original' | null {
  if (!posters) return null
  if ((locale === 'vi' || locale === 'zh') && posters.languages[locale]) return locale
  return posters.original ? 'original' : null
}
