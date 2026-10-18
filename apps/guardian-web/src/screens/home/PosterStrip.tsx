import { useId } from 'react'
import type { MouseEvent } from 'react'
import { useI18n } from '../../i18n'
import type { Locale, Program } from '../../data/types'
import type { PosterLanguage } from '../../data/agent'
import { INTEREST_VISUAL, programText } from '../../lib/content'
import { languageName } from '../../lib/format'
import { usePosterImage } from '../../lib/poster'
import { hrefFor, navigate, programPath } from '../../lib/router'
import { ValueIcon } from '../intro/art'

const POSTER_LANGUAGES: PosterLanguage[] = ['vi', 'zh']

/** 띠의 포스터 한 장이 그려지는 가장 넓은 폭(CSS px): 480px 틀에서 세 장이 한 줄일 때. 썸네일은 이 폭의 두 배로 받습니다. */
const STRIP_POSTER_WIDTH = 142

export interface PosterPick {
  program: Program
  variant: PosterLanguage | 'original'
}

/**
 * 홈 포스터 띠에 올릴 공고(서버가 붙인 program.posters 기준).
 * 베트남어·중국어 화면은 그 언어 번역본이 있는 공고만 고르고, 번역본이 하나도 없을 때만 한국어 원본을 씁니다.
 * 쉬운 한국어 화면은 원본을 씁니다. 고를 공고가 없으면 빈 목록이라 띠를 그리지 않습니다.
 */
export function posterPicks(programs: Program[], locale: Locale): PosterPick[] {
  const withPoster = programs.filter((program) => program.posters)
  if (locale === 'vi' || locale === 'zh') {
    const translated = withPoster.filter((program) => program.posters!.languages.includes(locale))
    if (translated.length) return translated.map((program) => ({ program, variant: locale }))
  }
  return withPoster.filter((program) => program.posters!.original).map((program) => ({ program, variant: 'original' }))
}

/** 02 홈: '내 언어로 바꾼 포스터'. 누르면 그 공고의 상세로 갑니다. */
export function PosterStrip({ programs }: { programs: Program[] }) {
  const { locale, t } = useI18n()
  const titleId = useId()
  const picks = posterPicks(programs, locale)
  if (!picks.length) return null
  const translated = picks[0].variant !== 'original'
  // 원본을 보여 줄 때는 AI가 옮겨 둔 다른 언어가 있다는 것만 알립니다.
  const others = POSTER_LANGUAGES.filter((code) => code !== locale && picks.some(({ program }) => program.posters!.languages.includes(code)))

  return (
    <section className="home-posters" aria-labelledby={titleId}>
      <h2 className="home-posters-title" id={titleId}>{translated ? t('homePostersMine') : t('homePostersOriginal')}</h2>
      {(translated || others.length > 0) && (
        <p className="home-posters-note">
          <ValueIcon name="spark" />
          {translated ? t('homePostersChecked') : t('homePostersAlso', { languages: others.map((code) => languageName(locale, code)).join('·') })}
        </p>
      )}
      <ul className="home-poster-list">
        {picks.map((pick, index) => <PosterCard key={`${pick.program.program_id}-${pick.variant}`} {...pick} eager={index < 3} />)}
      </ul>
    </section>
  )
}

function PosterCard({ program, variant, eager }: PosterPick & { eager: boolean }) {
  const { locale, t } = useI18n()
  // 번역본을 못 불러오면 한국어 원본으로, 원본도 안 되면 포스터 그림으로 바꿉니다.
  const { shown, onError } = usePosterImage(program.program_id, variant, !!program.posters?.original, STRIP_POSTER_WIDTH)
  const text = programText(program, locale)
  const path = programPath(program.program_id)

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    navigate(path, { fromList: true })
  }

  return (
    <li>
      <a className="home-poster" href={hrefFor(path)} onClick={open}>
        <span className={`home-poster-thumb tone-${INTEREST_VISUAL[program.category].tone}`}>
          {shown
            ? <img src={shown.src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" onError={onError} />
            : <span className="home-poster-fallback"><ValueIcon name="poster" /></span>}
          {(shown?.variant ?? variant) !== 'original'
            ? <span className="home-poster-badge"><ValueIcon name="spark" />{t('homePosterAi')}</span>
            : locale !== 'ko-easy' && <span className="home-poster-badge home-poster-badge--original">{t('originalTag')}</span>}
        </span>
        <span className="home-poster-title" lang={text.lang}>{text.title}</span>
      </a>
    </li>
  )
}
