import type { MouseEvent, ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { Program } from '../data/types'
import { INTEREST_VISUAL, itemsToCheck, programText } from '../lib/content'
import { formatCost, formatSessionPlace, formatSessionWhen, formatStatus, topicLabel } from '../lib/format'
import { hrefFor, navigate, programPath } from '../lib/router'
import { Marked, StatusTag } from './feedback'

/** 목록 한 줄. 목록·상세에서 대상 → 일정 → 장소 → 비용 → 신청을 같은 이름으로 씁니다(명세 5.1). */
export function ProgramItem({ program }: { program: Program }) {
  const { locale, t } = useI18n()
  const text = programText(program, locale)
  const visual = INTEREST_VISUAL[program.category]
  const path = programPath(program.program_id)
  const checks = [...new Set(itemsToCheck(program).map((item) => topicLabel(locale, item.topic)))]
  const session = program.next_session

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    navigate(path, { fromList: true })
  }

  return (
    <li>
      <a className="item" href={hrefFor(path)} onClick={open} aria-label={t('openDetail', { title: text.title })}>
        <span className={`item-art tone-${visual.tone}`} aria-hidden="true">{visual.emoji}</span>
        <span className="item-body">
          <StatusTag status={program.application_status}>{formatStatus(program, locale)}</StatusTag>
          <span className="item-title" lang={text.lang}>{text.title}</span>
          <span className="item-org" lang={text.lang}>
            {text.institution}
            {text.missingTranslation && <span className="tag-original">{t('originalTag')}</span>}
          </span>
          <span className="item-facts">
            <Fact label={t('target')}><span lang={text.lang}>{text.target}</span></Fact>
            <Fact label={program.time_match_status === 'matched' ? t('matchedShort') : t('schedule')}>
              {session?.date ? formatSessionWhen(session, locale) : <Marked>{t('scheduleUnknown')}</Marked>}
            </Fact>
            <Fact label={t('place')}><span lang="ko">{formatSessionPlace(session, locale)}</span></Fact>
            <Fact label={t('cost')}>{program.cost_krw === null ? <Marked>{formatCost(program, locale)}</Marked> : formatCost(program, locale)}</Fact>
          </span>
          {(program.age_grade_match_status === 'matched' || program.time_match_status === 'matched') && (
            <span className="item-match">
              {program.age_grade_match_status === 'matched' && <span>{t('ageMatched')}</span>}
              {program.time_match_status === 'matched' && <span>{t('timeMatched')}</span>}
            </span>
          )}
          {checks.length > 0 && <span className="item-checks"><b>{t('toCheck')}</b> <Marked>{checks.join(', ')}</Marked></span>}
        </span>
      </a>
    </li>
  )
}

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <span className="item-fact"><b>{label}</b><span>{children}</span></span>
)
