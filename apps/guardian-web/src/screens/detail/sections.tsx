/** 상세 페이지를 위에서 아래로 이루는 부분들. 순서는 DetailScreen이 정합니다. */
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'
import type { CompanionRule, MatchStatus, Program } from '../../data/types'
import { itemsToCheck, placesDiffer } from '../../lib/content'
import type { ProgramText } from '../../lib/content'
import { formatCost, formatDate, formatSessionPlace, formatSessionWhen, formatStatus, languageName, screenLanguageName, topicLabel } from '../../lib/format'
import { Icon } from '../../components/Icon'
import { Marked, Notice, StatusTag } from '../../components/feedback'

type Props = { program: Program }

/** 첫 화면의 핵심 사실: 대상 → 대표 회차 → 장소 → 비용 → 신청(명세 5.2) */
export function FactSheet({ program, text }: Props & { text: ProgramText }) {
  const { locale, t } = useI18n()
  const session = program.next_session
  const targetType = { multicultural_family: t('targetMulticultural'), all: t('targetAll'), parent_only: t('targetParent'), unknown: t('targetUnknown') }[program.target_type]
  return (
    <dl className="facts">
      <FactRow label={t('target')}>
        <span lang={text.lang}>{text.target}</span>
        <span className="fact-sub">{program.target_type === 'unknown' ? <Marked>{targetType}</Marked> : targetType}</span>
      </FactRow>
      <FactRow label={program.time_match_status === 'matched' ? t('matchedSession') : t('representative')}>
        {session?.date ? formatSessionWhen(session, locale) : <Marked>{t('scheduleUnknown')}</Marked>}
      </FactRow>
      <FactRow label={t('place')}>
        <span lang="ko">{formatSessionPlace(session, locale)}</span>
        {placesDiffer(program) && <span className="fact-sub">{t('placesDiffer')}</span>}
      </FactRow>
      <FactRow label={t('cost')}>{program.cost_krw === null ? <Marked>{formatCost(program, locale)}</Marked> : formatCost(program, locale)}</FactRow>
      <FactRow label={t('application')}>
        <StatusTag status={program.application_status}>{formatStatus(program, locale)}</StatusTag>
        {program.application_status === 'open' && program.application_end && <span className="fact-sub">{t('applyUntil', { date: formatDate(program.application_end, locale) })}</span>}
      </FactRow>
    </dl>
  )
}

const FactRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="fact-row"><dt>{label}</dt><dd>{children}</dd></div>
)

/** 신청 중이 아닐 때 다음 행동을 글로 알려 줍니다. */
export function StatusNote({ program }: Props) {
  const { locale, t } = useI18n()
  const { application_status: status, application_start: start } = program
  if (status === 'open') return null
  if (status === 'closed') return <Notice title={t('closedAction')} />
  if (status === 'upcoming' && start) return <Notice title={t('upcomingAction', { date: formatDate(start, locale) })} />
  // 기간 미상, 또는 시작일을 모르는 신청 예정
  return <Notice tone="mark" title={t('unknownAction')} />
}

/** 기관에 확인할 점: 미확인 항목과 원문에 적힌 관련 표현 */
export function ToCheck({ program }: Props) {
  const { locale, t } = useI18n()
  const items = itemsToCheck(program)
  if (!items.length) return null
  return (
    <section className="to-check">
      <h2 className="block-title">{t('toCheck')}</h2>
      <ul className="checks">
        {items.map((item, index) => (
          <li key={`${item.topic}-${index}`}>
            <Marked>{topicLabel(locale, item.topic)}</Marked>
            {item.note_ko && <span className="check-quote">{t('sourceSays', { text: item.note_ko })}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 우리 아이 조건과 비교. 공유 링크로 바로 열면 비교하지 않았다고 알립니다. */
export function CompareSection({ program, compared }: Props & { compared: boolean }) {
  const { t } = useI18n()
  return (
    <Block title={t('compareTitle')}>
      {compared ? (
        <dl className="rows">
          <Row label={t('rowAgeGrade')}><Judge status={program.age_grade_match_status} /></Row>
          <Row label={t('rowEligibility')}>{program.eligibility_status === 'matched' ? t('eligibilityConfirmed') : <Judge status={program.eligibility_status} />}</Row>
          <Row label={t('rowTime')}><Judge status={program.time_match_status} /></Row>
        </dl>
      ) : <p className="muted">{t('directLinkNote')}</p>}
    </Block>
  )
}

/** 소개. 내 언어 검수본이 없으면 한국어 원문을 접어 둡니다(명세 5.4). */
export function DescriptionSection({ program, text }: Props & { text: ProgramText }) {
  const { t } = useI18n()
  return (
    <Block title={t('description')}>
      {text.missingTranslation ? (
        <details className="original">
          <summary>{t('showOriginal')}</summary>
          <p lang="ko">{program.description}</p>
        </details>
      ) : <p className="prose" lang={text.lang}>{text.description}</p>}
    </Block>
  )
}

export function SessionsSection({ program }: Props) {
  const { locale, t } = useI18n()
  const rule = { all_sessions: t('attendAll'), choose_one: t('chooseOne'), unknown: t('attendanceUnknown') }[program.attendance_rule]
  return (
    <Block title={t('sessionsTitle')}>
      <p>{program.attendance_rule === 'unknown' ? <Marked>{rule}</Marked> : rule}</p>
      <ol className="sessions">
        {program.sessions.map((session) => {
          const matched = program.matched_sessions.includes(session.id)
          return (
            <li key={session.id} className={matched ? 'session is-matched' : 'session'}>
              <span className="session-when">{formatSessionWhen(session, locale)}</span>
              <span className="session-where" lang="ko">{formatSessionPlace(session, locale)}</span>
              {matched && <span className="session-flag"><Icon name="check" />{t('sessionMatched')}</span>}
            </li>
          )
        })}
      </ol>
    </Block>
  )
}

/** 동반 규칙과 필요한 한국어 수준. 공고에 없으면 추정하지 않습니다(명세 3장). */
export function ParticipationSection({ program }: Props) {
  const { t } = useI18n()
  return (
    <Block title={t('participationTitle')}>
      <dl className="rows">
        <Row label={t('rowGuardian')}><Companion rule={program.guardian_companion} /></Row>
        <Row label={t('rowSibling')}><Companion rule={program.sibling_companion} /></Row>
        <Row label={t('rowKoreanLevel')}>{program.korean_level_required ? <span lang="ko">{program.korean_level_required}</span> : <Marked>{t('notInNotice')}</Marked>}</Row>
      </dl>
    </Block>
  )
}

/** 화면 언어 · 기관 상담 언어 · 신청 페이지 언어를 따로 보여 줍니다(명세 5.4). */
export function LanguageSection({ program }: Props) {
  const { locale, t } = useI18n()
  return (
    <Block title={t('languageTitle')}>
      <dl className="rows">
        <Row label={t('rowScreenLanguage')}>{t('screenLanguageValue', { language: screenLanguageName(locale) })}</Row>
        <Row label={t('rowSupportLanguage')}><LanguageList codes={program.support_languages} /></Row>
        <Row label={t('rowApplicationLanguage')}><LanguageList codes={program.application_languages} /></Row>
      </dl>
      <p className="muted">{t('languageSeparateNote')}</p>
    </Block>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="block"><h2 className="block-title">{title}</h2>{children}</section>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="row"><dt>{label}</dt><dd>{children}</dd></div>
}

function Judge({ status }: { status: MatchStatus }) {
  const { t } = useI18n()
  const label = { matched: t('judgeMatched'), not_matched: t('judgeNotMatched'), unknown: t('judgeUnknown'), not_applied: t('judgeNotApplied') }[status]
  return status === 'unknown' ? <Marked>{label}</Marked> : <span className={`judge judge--${status}`}>{label}</span>
}

function Companion({ rule }: { rule: CompanionRule }) {
  const { t } = useI18n()
  if (rule === null) return <Marked>{t('notInNotice')}</Marked>
  return <>{{ required: t('companionRequired'), allowed: t('companionAllowed'), not_allowed: t('companionNotAllowed') }[rule]}</>
}

/** null = 확인되지 않음, 빈 배열 = 확인 결과 지원 언어 없음(명세 6장) */
function LanguageList({ codes }: { codes: string[] | null }) {
  const { locale, t } = useI18n()
  if (codes === null) return <Marked>{t('languageUnknown')}</Marked>
  if (!codes.length) return <>{t('languageNone')}</>
  return <>{codes.map((code) => languageName(locale, code)).join(', ')}</>
}
