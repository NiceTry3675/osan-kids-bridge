import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { getPosterInfo, posterUrl } from '../../data/agent'
import type { PosterInfo, PosterLanguage } from '../../data/agent'
import { screenLanguageName } from '../../lib/format'
import { Icon } from '../../components/Icon'
import { Marked } from '../../components/feedback'

/**
 * 기관 포스터. 화면 언어의 번역 포스터가 있으면 그것을 먼저 보여 주고, 한국어 원본으로 바꿔 볼 수 있습니다.
 * 번역 포스터는 원본 디자인을 그대로 두고 글만 옮긴 것이며, 숫자·날짜·전화번호·QR을 원본과 대조한 것만 서버가 내보냅니다.
 */
export function PosterSection({ programId }: { programId: string }) {
  const { locale, t } = useI18n()
  const [info, setInfo] = useState<PosterInfo | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getPosterInfo(programId, controller.signal).then(setInfo).catch(() => setInfo(null))
    return () => controller.abort()
  }, [programId])

  if (!info || (!info.original && !Object.keys(info.languages).length)) return null
  const language = screenLanguageName(locale)
  const translated = locale === 'vi' || locale === 'zh' ? info.languages[locale as PosterLanguage] : undefined
  const variant = translated && !showOriginal ? (locale as PosterLanguage) : 'original'
  const src = posterUrl(programId, variant)

  return (
    <section className="block poster" aria-label={t('posterTitle')}>
      <h2 className="block-title">{translated && !showOriginal ? t('posterTranslated', { language }) : t('posterTitle')}</h2>
      {translated && !showOriginal && (
        <div className="poster-check">
          <p><Icon name="check" />{t('posterChecked')}</p>
          {translated.status === 'approved' ? <p>{t('posterApproved', { language })}</p> : <p><Marked>{t('posterMachine')}</Marked></p>}
        </div>
      )}
      {!translated && locale !== 'ko-easy' && <p className="muted">{t('posterOriginalOnly', { language })}</p>}
      <a className="poster-frame" href={src} target="_blank" rel="noopener noreferrer" aria-label={t('posterEnlarge')}>
        <img src={src} alt={t('posterTitle')} lang={variant === 'original' ? 'ko' : undefined} loading="lazy" />
      </a>
      {translated && info.original && (
        <button type="button" className="btn btn--quiet" onClick={() => setShowOriginal((value) => !value)}>
          {showOriginal ? t('posterShowTranslated', { language }) : t('posterShowOriginal')}
        </button>
      )}
    </section>
  )
}
