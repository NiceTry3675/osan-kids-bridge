import { useState } from 'react'
import { useI18n } from '../../i18n'
import { posterUrl } from '../../data/agent'
import { screenLanguageName } from '../../lib/format'
import { usePosterImage } from '../../lib/poster'
import { Icon } from '../../components/Icon'
import { Marked } from '../../components/feedback'
import { shownPoster } from './usePosterInfo'
import type { Posters } from './usePosterInfo'

/** 머리글 썸네일이 눌렸을 때 내려갈 포스터 구역의 id */
const POSTER_ID = 'poster'

/** 머리글 썸네일 틀의 폭(CSS px, styles/detail.css .poster-thumb-frame). 포스터가 정사각형이라 정사각형으로 그립니다. */
const THUMB_SIZE = 72

/**
 * 기관 포스터. 화면 언어의 번역 포스터가 있으면 그것을 먼저 보여 주고, 한국어 원본으로 바꿔 볼 수 있습니다.
 * 번역 포스터는 원본 디자인을 그대로 두고 글만 옮긴 것이며, 숫자·날짜·전화번호·QR을 원본과 대조한 것만 서버가 내보냅니다.
 * 크게 보는 자리라 원래 크기 이미지를 씁니다. 번역본을 못 불러오면 원본으로 바꾸고(대조 안내도 함께 감춤), 원본도 안 되면 구역을 감춥니다.
 */
export function PosterSection({ programId, posters }: { programId: string; posters: Posters | null }) {
  const { locale, t } = useI18n()
  const [showOriginal, setShowOriginal] = useState(false)
  // 못 불러온 이미지 주소. 주소가 공고·언어마다 다르므로 바뀌면 저절로 처음부터 다시 봅니다.
  const [failed, setFailed] = useState<string[]>([])
  const shown = shownPoster(posters, locale)

  if (!posters || !shown) return null
  const language = screenLanguageName(locale)
  const loads = (src: string | null): src is string => !!src && !failed.includes(src)
  const translatedSrc = shown === 'original' ? null : posterUrl(programId, shown)
  const originalSrc = posters.original ? posterUrl(programId, 'original') : null
  // 번역본은 그 이미지를 불러올 수 있을 때만 ‘번역 포스터’와 대조 안내를 보입니다.
  const translated = shown !== 'original' && loads(translatedSrc) ? posters.languages[shown] : undefined
  const originalOk = loads(originalSrc)
  const showingTranslated = !!translated && !(showOriginal && originalOk)
  const src = showingTranslated ? translatedSrc : originalOk ? originalSrc : null
  if (!src) return null

  return (
    <section className="block poster" id={POSTER_ID} tabIndex={-1} aria-label={t('posterTitle')}>
      <h2 className="block-title">{showingTranslated ? t('posterTranslated', { language }) : t('posterTitle')}</h2>
      {showingTranslated && translated && (
        <div className="poster-check">
          <p><Icon name="check" />{t('posterChecked')}</p>
          {translated.approved ? <p>{t('posterApproved', { language })}</p> : <p><Marked>{t('posterMachine')}</Marked></p>}
        </div>
      )}
      {shown === 'original' && locale !== 'ko-easy' && <p className="muted">{t('posterOriginalOnly', { language })}</p>}
      <a className="poster-frame" href={src} target="_blank" rel="noopener noreferrer" aria-label={t('posterEnlarge')}>
        <img src={src} alt={t('posterTitle')} loading="lazy" onError={() => setFailed((list) => [...list, src])} />
      </a>
      {translated && originalOk && (
        <button type="button" className="btn btn--quiet" onClick={() => setShowOriginal((value) => !value)}>
          {showOriginal ? t('posterShowTranslated', { language }) : t('posterShowOriginal')}
        </button>
      )}
    </section>
  )
}

/**
 * 머리글 제목 옆의 포스터 썸네일. 내 언어 번역본이 있으면 그것(AI 표시), 없거나 못 불러오면 한국어 원본입니다.
 * 누르면 아래 포스터 구역으로 내려가고, 그 구역에서 원본 대조 결과와 담당자 확인 여부를 함께 봅니다.
 */
export function PosterThumb({ programId, posters }: { programId: string; posters: Posters | null }) {
  const { locale, t } = useI18n()
  const { shown, onError } = usePosterImage(programId, shownPoster(posters, locale), !!posters?.original, THUMB_SIZE)
  if (!shown) return null
  const translated = shown.variant !== 'original'

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
        <img src={shown.src} alt="" width={THUMB_SIZE} height={THUMB_SIZE} onError={onError} />
        {translated && <span className="poster-thumb-badge" aria-hidden="true">AI</span>}
      </span>
      <span className="poster-thumb-caption">
        {translated ? t('posterTranslated', { language: screenLanguageName(locale) }) : t('posterTitle')}
        <span className="visually-hidden"> · {t('posterJump')}</span>
      </span>
    </button>
  )
}
