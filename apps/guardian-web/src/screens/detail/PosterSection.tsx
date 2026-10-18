import { useState } from 'react'
import { useI18n } from '../../i18n'
import { posterUrl } from '../../data/agent'
import { screenLanguageName } from '../../lib/format'
import { Icon } from '../../components/Icon'
import { Marked } from '../../components/feedback'
import { shownPoster } from './usePosterInfo'
import type { Posters } from './usePosterInfo'

/** 머리글 썸네일이 눌렸을 때 내려갈 포스터 구역의 id */
const POSTER_ID = 'poster'

/**
 * 기관 포스터. 화면 언어의 번역 포스터가 있으면 그것을 먼저 보여 주고, 한국어 원본으로 바꿔 볼 수 있습니다.
 * 번역 포스터는 원본 디자인을 그대로 두고 글만 옮긴 것이며, 숫자·날짜·전화번호·QR을 원본과 대조한 것만 서버가 내보냅니다.
 */
export function PosterSection({ programId, posters }: { programId: string; posters: Posters | null }) {
  const { locale, t } = useI18n()
  const [showOriginal, setShowOriginal] = useState(false)
  const shown = shownPoster(posters, locale)

  if (!posters || !shown) return null
  const language = screenLanguageName(locale)
  const translated = shown === 'original' ? undefined : posters.languages[shown]
  const variant = translated && !showOriginal ? shown : 'original'
  const src = posterUrl(programId, variant)

  return (
    <section className="block poster" id={POSTER_ID} tabIndex={-1} aria-label={t('posterTitle')}>
      <h2 className="block-title">{translated && !showOriginal ? t('posterTranslated', { language }) : t('posterTitle')}</h2>
      {translated && !showOriginal && (
        <div className="poster-check">
          <p><Icon name="check" />{t('posterChecked')}</p>
          {translated.approved ? <p>{t('posterApproved', { language })}</p> : <p><Marked>{t('posterMachine')}</Marked></p>}
        </div>
      )}
      {!translated && locale !== 'ko-easy' && <p className="muted">{t('posterOriginalOnly', { language })}</p>}
      <a className="poster-frame" href={src} target="_blank" rel="noopener noreferrer" aria-label={t('posterEnlarge')}>
        <img src={src} alt={t('posterTitle')} lang={variant === 'original' ? 'ko' : undefined} loading="lazy" />
      </a>
      {translated && posters.original && (
        <button type="button" className="btn btn--quiet" onClick={() => setShowOriginal((value) => !value)}>
          {showOriginal ? t('posterShowTranslated', { language }) : t('posterShowOriginal')}
        </button>
      )}
    </section>
  )
}

/**
 * 머리글 제목 옆의 포스터 썸네일. 내 언어 번역본이 있으면 그것(AI 표시), 없으면 한국어 원본입니다.
 * 누르면 아래 포스터 구역으로 내려가고, 그 구역에서 원본 대조 결과와 담당자 확인 여부를 함께 봅니다.
 */
export function PosterThumb({ programId, posters }: { programId: string; posters: Posters | null }) {
  const { locale, t } = useI18n()
  const [failed, setFailed] = useState<string | null>(null)
  const shown = shownPoster(posters, locale)
  const src = shown ? posterUrl(programId, shown) : null
  if (!shown || !src || failed === src) return null
  const translated = shown !== 'original'

  const jump = () => {
    const target = document.getElementById(POSTER_ID)
    if (!target) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    target.focus({ preventScroll: true })
  }

  return (
    <button type="button" className="poster-thumb" onClick={jump}>
      <span className="poster-thumb-frame">
        <img src={src} alt="" onError={() => setFailed(src)} />
        {translated && <span className="poster-thumb-badge" aria-hidden="true">AI</span>}
      </span>
      <span className="poster-thumb-caption">
        {translated ? t('posterTranslated', { language: screenLanguageName(locale) }) : t('posterTitle')}
        <span className="visually-hidden"> · {t('posterJump')}</span>
      </span>
    </button>
  )
}
