import type { MouseEvent } from 'react'
import { useI18n } from '../i18n'
import type { Program } from '../data/types'
import { formatCost, formatSessionPlace, formatSessionWhen, formatStatus, programText, topicLabel } from '../lib/format'
import { navigate, programPath } from '../lib/router'
import { INTEREST_VISUAL } from '../lib/visual'
import { Marked, StatusTag } from './bits'

/** 목록 한 줄. 목록·상세에서 대상 → 일정 → 장소 → 비용 → 신청을 같은 이름으로 씁니다(명세 5.1). */
export function ProgramItem({ program }: { program: Program }) {
  const { locale, t } = useI18n()
  const text = programText(program, locale)
  const href = programPath(program.program_id)
  const visual = INTEREST_VISUAL[program.category]
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    navigate(href, { fromList: true })
  }
  const checks = [
    program.time_match_status === 'unknown' && t('topicSchedule'),
    program.age_grade_match_status === 'unknown' && t('topicAgeGrade'),
    ...program.uncertain_items.map((item) => topicLabel(locale, item.topic)),
  ].filter((value, index, list): value is string => !!value && list.indexOf(value) === index)
  const lang = text.reviewed ? undefined : 'ko'

  return (
    <li>
      <a className="item" href={href} onClick={open} aria-label={t('openDetail', { title: text.title })}>
        <span className={`item-art tone-${visual.tone}`} aria-hidden="true">{visual.emoji}</span>
        <span className="item-body">
          <StatusTag status={program.application_status}>{formatStatus(program, locale)}</StatusTag>
          <span className="item-title" lang={lang}>{text.title}</span>
          <span className="item-org" lang={lang}>{text.institution}{text.missingTranslation && <span className="tag-original">{t('originalTag')}</span>}</span>
          <span className="item-facts">
            <span><b>{t('target')}</b> <span lang={lang}>{text.target}</span></span>
            <span><b>{program.time_match_status === 'matched' ? t('matchedShort') : t('schedule')}</b> <span>{program.next_session?.date ? formatSessionWhen(program.next_session, locale) : <Marked>{t('scheduleUnknown')}</Marked>}</span></span>
            <span><b>{t('place')}</b> <span lang="ko">{formatSessionPlace(program.next_session, locale)}</span></span>
            <span><b>{t('cost')}</b> <span>{program.cost_krw === null ? <Marked>{formatCost(program, locale)}</Marked> : formatCost(program, locale)}</span></span>
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
