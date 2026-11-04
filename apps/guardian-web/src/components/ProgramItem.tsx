import { useId } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { PosterLanguage } from '../data/agent'
import type { Locale, Program } from '../data/types'
import { addendumText, costAddendum, INTEREST_VISUAL, itemsToCheck, programText } from '../lib/content'
import { InterestIcon } from '../screens/intro/art'
import { formatCost, formatSessionPlace, formatSessionWhen, formatStatus, placeLang, topicLabel } from '../lib/format'
import { usePosterImage } from '../lib/poster'
import { hrefFor, navigate, programPath } from '../lib/router'
import { Marked, StatusTag } from './feedback'
import { Icon } from './Icon'

/** 목록 썸네일로 쓸 포스터: 베트남어·중국어 화면은 그 언어 번역본, 번역본이 없거나 쉬운 한국어면 원본. 포스터가 없으면 null */
export function listPoster(program: Program, locale: Locale): PosterLanguage | 'original' | null {
  const posters = program.posters
  if (!posters) return null
  if (locale !== 'ko-easy' && posters.languages.includes(locale)) return locale
  return posters.original ? 'original' : null
}

/**
 * 목록 한 줄. 목록·상세에서 대상 → 일정 → 장소 → 비용 → 신청을 같은 이름으로 씁니다(명세 5.1).
 * 맞는 이유는 위쪽 초록 알약, 기관에 확인할 점은 개수 칩 하나로 줄이고 전체 항목은 읽기 프로그램과 상세에 남깁니다.
 */
export function ProgramItem({ program }: { program: Program }) {
  const { locale, t } = useI18n()
  const text = programText(program, locale)
  const path = programPath(program.program_id)
  const checks = [...new Set(itemsToCheck(program).map((item) => topicLabel(locale, item.topic)))]
  const session = program.next_session
  const ageMatched = program.age_grade_match_status === 'matched'
  const timeMatched = program.time_match_status === 'matched'
  const bodyId = useId()

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    navigate(path, { fromList: true })
  }

  return (
    <li>
      <a className="item" href={hrefFor(path)} onClick={open} aria-label={t('openDetail', { title: text.title })} aria-describedby={bodyId}>
        <ItemArt program={program} locale={locale} />
        <span className="item-body" id={bodyId}>
          {(ageMatched || timeMatched) && (
            <span className="item-match">
              {ageMatched && <span><Icon name="check" />{t('ageMatched')}</span>}
              {timeMatched && <span><Icon name="check" />{t('timeMatched')}</span>}
            </span>
          )}
          <StatusTag status={program.application_status}>{formatStatus(program, locale)}</StatusTag>
          <span className="item-title" lang={text.lang}>{text.title}</span>
          <span className="item-org">
            <span lang={text.lang}>{text.institution}</span>
            {text.missingTranslation && <span className="tag-original">{t('originalTag')}</span>}
            {program.is_demo && <span className="tag-original tag-demo">{t('demoTag')}</span>}
          </span>
          <span className="item-facts">
            <Fact label={t('target')} clamp><span lang={text.lang}>{text.target}</span></Fact>
            <Fact label={timeMatched ? t('matchedShort') : t('schedule')}>
              {session?.date ? formatSessionWhen(session, locale) : <Marked>{t('scheduleUnknown')}</Marked>}
            </Fact>
            <Fact label={t('place')}><span lang={placeLang(session)}>{formatSessionPlace(session, locale)}</span></Fact>
            <Fact label={t('cost')} clamp><Cost program={program} locale={locale} /></Fact>
          </span>
          {checks.length > 0 && (
            <span className="item-checks">
              <span className="item-check-chip" aria-hidden="true">{t('toCheck')}<span className="item-check-count">{checks.length}</span></span>
              <span className="visually-hidden">{t('toCheck')}: {checks.join(', ')}</span>
            </span>
          )}
        </span>
      </a>
    </li>
  )
}

/**
 * 비용 칸. 공고에 비용이 없어도 기관이 덧붙인 안내가 비용에 답했으면 그 문장(화면 언어로 옮긴 것이 있으면 그것)을 보여 주고,
 * 둘 다 없을 때만 ‘비용 확인 필요’ 형광펜을 칠합니다. 한국어 원문은 상세의 비용 칸과 안내 카드에 있습니다.
 */
function Cost({ program, locale }: { program: Program; locale: Locale }) {
  if (program.cost_krw !== null) return <>{formatCost(program, locale)}</>
  const addendum = costAddendum(program)
  if (!addendum) return <Marked>{formatCost(program, locale)}</Marked>
  const shown = addendumText(addendum, locale)
  return <span lang={shown.lang}>{shown.text}</span>
}

/** 목록 썸네일의 화면 폭(CSS px). 포스터가 정사각형이라 정사각형으로 그립니다(styles/home.css .item-poster). */
const ITEM_POSTER_SIZE = 64

/**
 * 그림 칸: 포스터가 있으면 정사각형 썸네일(번역본에는 ‘AI 번역’ 표시), 번역본을 못 불러오면 한국어 원본, 그것도 안 되면 분야 그림.
 * 제목이 이미 공고를 말하므로 읽기 프로그램에는 숨깁니다.
 */
function ItemArt({ program, locale }: { program: Program; locale: Locale }) {
  const { t } = useI18n()
  const { shown, onError } = usePosterImage(program.program_id, listPoster(program, locale), !!program.posters?.original, ITEM_POSTER_SIZE)
  if (!shown) {
    const visual = INTEREST_VISUAL[program.category]
    // 홈 분야 타일과 같은 선 아이콘
    return <span className={`item-art tone-${visual.tone}`} aria-hidden="true"><InterestIcon interest={program.category} /></span>
  }
  return (
    <span className="item-poster" aria-hidden="true">
      <img src={shown.src} alt="" width={ITEM_POSTER_SIZE} height={ITEM_POSTER_SIZE} loading="lazy" decoding="async" onError={onError} />
      {shown.variant !== 'original' && <span className="item-poster-ai">{t('itemPosterAi')}</span>}
    </span>
  )
}

const Fact = ({ label, clamp, children }: { label: string; clamp?: boolean; children: ReactNode }) => (
  <span className="item-fact"><b>{label}</b><span className={clamp ? 'item-clamp' : undefined}>{children}</span></span>
)
