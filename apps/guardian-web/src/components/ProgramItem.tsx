import { useId, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { useI18n } from '../i18n'
import { posterUrl } from '../data/agent'
import type { PosterLanguage } from '../data/agent'
import type { Locale, Program } from '../data/types'
import { INTEREST_VISUAL, itemsToCheck, programText } from '../lib/content'
import { InterestIcon } from '../screens/intro/art'
import { formatCost, formatSessionPlace, formatSessionWhen, formatStatus, topicLabel } from '../lib/format'
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
            <Fact label={t('place')}><span lang="ko">{formatSessionPlace(session, locale)}</span></Fact>
            <Fact label={t('cost')}>{program.cost_krw === null ? <Marked>{formatCost(program, locale)}</Marked> : formatCost(program, locale)}</Fact>
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

/** 그림 칸: 포스터가 있으면 64×88 썸네일(번역본에는 ‘AI 번역’ 표시), 없거나 못 불러오면 분야 그림. 제목이 이미 공고를 말하므로 읽기 프로그램에는 숨깁니다. */
function ItemArt({ program, locale }: { program: Program; locale: Locale }) {
  const { t } = useI18n()
  const variant = listPoster(program, locale)
  const src = variant ? posterUrl(program.program_id, variant) : null
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) {
    const visual = INTEREST_VISUAL[program.category]
    // 홈 분야 타일과 같은 선 아이콘
    return <span className={`item-art tone-${visual.tone}`} aria-hidden="true"><InterestIcon interest={program.category} /></span>
  }
  return (
    <span className="item-poster" aria-hidden="true">
      <img src={src} alt="" width={64} height={88} loading="lazy" decoding="async" onError={() => setFailed(src)} />
      {variant !== 'original' && <span className="item-poster-ai">{t('itemPosterAi')}</span>}
    </span>
  )
}

const Fact = ({ label, clamp, children }: { label: string; clamp?: boolean; children: ReactNode }) => (
  <span className="item-fact"><b>{label}</b><span className={clamp ? 'item-clamp' : undefined}>{children}</span></span>
)
