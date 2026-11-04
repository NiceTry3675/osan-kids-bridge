/** 상세 페이지를 위에서 아래로 이루는 부분들. 순서는 DetailScreen이 정합니다. */
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { translate, useI18n } from '../../i18n'
import type { CompanionRule, Locale, MatchStatus, Program, UncertainItem } from '../../data/types'
import { addendumText, classNames, costAddendum, groupSessions, itemsToCheck, nextByClass, placesDiffer, splitSessions } from '../../lib/content'
import type { Addendum, ProgramText } from '../../lib/content'
import { isSafeUrl, formatCost, formatDate, formatSessionPlace, formatSessionWhen, formatStatus, languageName, mapUrl, periodText, placeLang, topicLabel, weekdayLabel } from '../../lib/format'
import { Icon } from '../../components/Icon'
import { Marked, Notice, StatusTag } from '../../components/feedback'
import { ExternalLink } from '../../components/links'
import { SLOT, WithKorean } from '../../components/korean'

type Props = { program: Program }

/** 첫 화면의 핵심 사실: 대상 → 대표 회차 → 장소 → 비용 → 신청(명세 5.2) */
export function FactSheet({ program, text }: Props & { text: ProgramText }) {
  const { locale, t } = useI18n()
  const session = program.next_session
  // 대상 글에 이미 있으면 다시 적지 않습니다. 다문화가족 대상인 것만 글에 없을 때 알립니다.
  const showMulticultural = program.target_type === 'multicultural_family' && !/다문화|đa văn hóa|多文化|多元文化/i.test(text.target)
  return (
    <dl className="facts">
      <FactRow label={t('target')}>
        <span lang={text.lang}>{text.target}</span>
        {showMulticultural && <span className="fact-sub">{t('targetMulticultural')}</span>}
      </FactRow>
      <ScheduleRow program={program} />
      <FactRow label={t('place')}>
        <span lang={placeLang(session)}>{formatSessionPlace(session, locale)}</span>
        {program.outside_osan && <span className="tag-original tag-outside">{t('outsideOsan', { city: program.outside_osan })}</span>}
        {session?.address && <span className="fact-sub" lang="ko">{session.address}</span>}
        {session?.address && <span className="fact-link"><ExternalLink href={mapUrl(session.address)} demo={program.is_demo}>{t('mapLink')}</ExternalLink></span>}
        {placesDiffer(program) && <span className="fact-sub">{t('placesDiffer')}</span>}
      </FactRow>
      <CostRow program={program} />
      <FactRow label={t('application')}>
        <StatusTag status={program.application_status}>{formatStatus(program, locale)}</StatusTag>
        {program.application_status === 'open' && program.application_end && <span className="fact-sub">{t('applyUntil', { date: formatDate(program.application_end, locale) })}</span>}
      </FactRow>
      <FactRow label={t('institutionRow')}>
        <span lang={text.lang}>{text.institution}</span>
        {isSafeUrl(program.source_url) && <span className="fact-link"><ExternalLink href={program.source_url} demo={program.is_demo}>{t('sourceLink')}</ExternalLink></span>}
      </FactRow>
      {program.verified_at && <FactRow label={t('verifiedRow')}>{formatDate(program.verified_at, locale)}</FactRow>}
    </dl>
  )
}

/**
 * 일정 줄. 시간이 맞으면 그 회차, 맞을 수 있으면 그 회차, 반이 나뉘었으면 반마다, 지났으면 ‘지난 일정’.
 * 회차 날짜가 없으면 공고가 밝힌 일정 안내나 운영 기간을 보여 주고, 아무것도 없을 때만 ‘일정 확인 필요’라고 합니다.
 */
function ScheduleRow({ program }: Props) {
  const { locale, t } = useI18n()
  const session = program.next_session
  const possible = program.sessions.find((item) => item.id === program.possible_sessions?.[0])
  const classes = program.time_match_status === 'matched' || possible ? null : nextByClass(program)
  const period = periodText(program, locale)
  const today = program.as_of
  const label = program.time_match_status === 'matched' ? t('matchedSession')
    : possible ? t('possibleShort')
      : session?.date && today && session.date < today ? t('pastSchedule') : t('schedule')
  if (classes) {
    return (
      <FactRow label={label}>
        {classes.map((item) => <span key={item.name} className="fact-line"><span lang="ko">{item.name}</span> {formatSessionWhen(item.session, locale)}</span>)}
      </FactRow>
    )
  }
  const shown = possible ?? session
  if (shown?.date) return <FactRow label={label}>{formatSessionWhen(shown, locale)}</FactRow>
  // 날짜가 없으면 ‘다음’이라고 할 수 없습니다.
  const general = t('scheduleGeneral')
  if (program.schedule_note) return <FactRow label={general}><span lang="ko">{program.schedule_note}</span></FactRow>
  if (period) return <FactRow label={general}>{period}<span className="fact-sub">{t('periodDatesUnknown')}</span></FactRow>
  return <FactRow label={general}><Marked>{t('scheduleUnknown')}</Marked></FactRow>
}

const FactRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="fact-row"><dt>{label}</dt><dd>{children}</dd></div>
)

/**
 * 비용 줄. 기관이 덧붙인 안내가 비용에 답했으면 그 문장을 보여 주고(화면 언어로 옮긴 것이 있으면 그것과 한국어 원문),
 * 공고에도 안내에도 비용이 없을 때만 ‘비용 확인 필요’ 형광펜을 칠합니다.
 */
function CostRow({ program }: Props) {
  const { locale, t } = useI18n()
  const addendum = costAddendum(program)
  if (!addendum) {
    return <FactRow label={t('cost')}>{program.cost_krw === null ? <Marked>{formatCost(program, locale)}</Marked> : formatCost(program, locale)}</FactRow>
  }
  const shown = addendumText(addendum, locale)
  return (
    <FactRow label={t('cost')}>
      {program.cost_krw !== null && <span>{formatCost(program, locale)}</span>}
      <span lang={shown.lang}>{shown.text}</span>
      <span className="fact-sub">
        {t('costFromAddendum')}
        {shown.original && <> · <WithKorean template={t('addendumOriginal', { text: SLOT })} text={shown.original} /></>}
      </span>
    </FactRow>
  )
}

/** 신청 중이 아닐 때 다음 행동을 글로 알려 줍니다. */
export function StatusNote({ program }: Props) {
  const { locale, t } = useI18n()
  const { application_status: status, application_start: start } = program
  if (status === 'closed') return <Notice title={t('closedAction')} />
  if (status === 'open') return null
  if (status === 'upcoming' && start) return <Notice title={t('upcomingAction', { date: formatDate(start, locale) })} />
  // 기간 미상, 또는 시작일을 모르는 신청 예정
  return <Notice tone="mark" title={`${t('unknownAction')} ${t(isSafeUrl(program.source_url) ? 'checkSourceOrAsk' : 'askInstitution')}`} />
}

/** 신청 기간을 그대로 믿기 어려울 때: 상태 글자만 보고 믿지 않도록 이유와 할 일을 함께 알립니다. */
export function ApplicationIssueNotice({ program }: Props) {
  const { locale, t } = useI18n()
  const issue = program.application_issue
  if (!issue || program.application_status === 'closed') return null
  if (issue.kind === 'conflict') {
    return (
      <Notice tone="warn" title={t('issueConflictTitle')}>
        <p>{t('issueConflictBody')}</p>
        {issue.note_ko && <p><WithKorean template={t('sourceSays', { text: SLOT })} text={issue.note_ko} /></p>}
      </Notice>
    )
  }
  if (!program.application_end || !issue.event_date) return null
  return (
    <Notice tone="warn" title={t('issueAfterEventTitle', { end: formatDate(program.application_end, locale), event: formatDate(issue.event_date, locale) })}>
      <p>{t('issueAfterEventBody')}</p>
    </Notice>
  )
}

/** 화면 언어 문구가 있는 주제. 서버가 모르는 주제를 보내면 주제 줄을 감춥니다. */
const TOPICS: UncertainItem['topic'][] = ['family_eligibility', 'companion', 'korean_level', 'schedule', 'age_grade', 'materials', 'other']

/** 안내 주제의 화면 언어 이름. ‘그 밖의 내용’이라도 비용에 답한 안내면 ‘비용’이라고 적고, 그 밖에는 주제 줄을 감춥니다. */
function addendumTopic(addendum: Addendum, locale: Locale): string | null {
  if (addendum.topic === 'other') return addendum.covers?.includes('cost') ? translate(locale, 'cost') : null
  return TOPICS.includes(addendum.topic) ? topicLabel(locale, addendum.topic) : null
}

/**
 * 기관이 확인해 덧붙인 안내: 공고가 나온 뒤 담당자가 이름을 걸고 확정한 한국어 문장.
 * 공고 원문이 아니라는 것을 함께 적고, 주제와 덧붙인 날은 화면 언어로 적습니다.
 * 베트남어·중국어로 옮긴 문장이 있으면 그것을 ‘AI 번역’ 표시와 함께 보이고, 기관이 쓴 한국어 원문을 그 아래에 둡니다.
 */
export function AddendaSection({ program }: Props) {
  const { locale, t } = useI18n()
  const addenda = program.addenda ?? []
  if (!addenda.length) return null
  return (
    <section className="addenda">
      <h2 className="addenda-title"><Icon name="check" />{t('addendaTitle')}</h2>
      <p className="addenda-note">{t('chatAddendum')}</p>
      <ul className="addenda-list">
        {addenda.map((addendum, index) => {
          const shown = addendumText(addendum, locale)
          const meta = [
            addendumTopic(addendum, locale),
            addendum.added_at ? t('addendumDate', { date: formatDate(addendum.added_at, locale) }) : null,
          ].filter((part): part is string => !!part)
          const last = meta.pop()
          return (
            <li key={`${addendum.topic}-${index}`}>
              {/* ‘AI 번역’ 표시는 머리줄 끝에, 마지막 마디(덧붙인 날)와 함께 줄바꿈합니다: 표시만 따로 다음 줄로 떨어지지 않게 */}
              <span className="addendum-meta">
                {meta.map((part) => `${part} · `).join('')}
                {(last || shown.original) && (
                  <span className="addendum-when">{last}{shown.original && <span className="addendum-ai">{t('addendumAi')}</span>}</span>
                )}
              </span>
              <p className="addendum-text" lang={shown.lang}>{shown.text}</p>
              {shown.original && <p className="addendum-original"><WithKorean template={t('addendumOriginal', { text: SLOT })} text={shown.original} /></p>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * 기관에 확인할 점: 미확인 항목과 원문에 적힌 관련 표현.
 * 노란 카드 하나가 ‘아직 확인되지 않음’ 신호라서 항목마다 형광펜을 다시 칠하지 않고, 원문 표현을 그대로 둡니다.
 */
export function ToCheck({ program, onAsk }: Props & { onAsk: () => void }) {
  const { locale, t } = useI18n()
  const items = itemsToCheck(program)
  if (!items.length) return null
  return (
    <section className="to-check">
      <h2 className="block-title">{t('toCheck')}</h2>
      <ul className="checks">
        {items.map((item, index) => (
          <li key={`${item.topic}-${index}`}>
            <QuestionMark />
            <span className="check-text">
              <span className="check-topic">{topicLabel(locale, item.topic)}</span>
              {item.note_ko && <span className="check-quote"><WithKorean template={t('sourceSays', { text: SLOT })} text={item.note_ko} /></span>}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--secondary to-check-ask" onClick={onAsk}>{t('askAgency')}</button>
    </section>
  )
}

type Comparison = { key: 'age' | 'time' | 'eligibility'; label: string; status: MatchStatus }

/**
 * 우리 아이 조건과 비교. 조건을 넣고 왔을 때만 보입니다. 맞는 것은 초록 표시로, 공고만으로 모르는 것은 형광펜으로 보이고 넣지 않은 조건은 감춥니다.
 */
export function CompareSection({ program }: Props) {
  const { t } = useI18n()
  const rows: Comparison[] = [
    { key: 'age', label: t('rowAgeGrade'), status: program.age_grade_match_status },
    { key: 'time', label: t('rowTime'), status: program.time_match_status },
    { key: 'eligibility', label: t('rowEligibility'), status: program.eligibility_status },
  ]
  const shown = rows.filter((row) => row.status !== 'not_applied')
  const matched = shown.filter((row) => row.status === 'matched')
  const rest = shown.filter((row) => row.status !== 'matched')
  return (
    <Block title={t('compareTitle')} className="compare">
      {matched.length > 0 && (
        <ul className="compare-pills">
          {matched.map((row) => (
            <li key={row.key} className="compare-pill">
              <Icon name="check" />
              {row.key === 'eligibility'
                ? <span>{t('eligibilityConfirmed')}</span>
                : <><span className="compare-label">{row.label}</span><span className="judge judge--matched">{t('judgeMatched')}</span></>}
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <ul className="compare-rest">
          {rest.map((row) => (
            <li key={row.key} className={`compare-line compare-line--${row.status}`}>
              {row.status === 'unknown' ? <QuestionMark /> : <Icon name="x" />}
              <span>
                <span className="compare-label">{row.label}</span> {row.key === 'eligibility' && row.status === 'unknown' ? <Marked>{t('judgeFamily')}</Marked> : <Judge status={row.status} />}
                {row.key === 'age' && row.status === 'unknown' && program.age_range && !program.grade_range && <span className="fact-sub">{t('ageBasisNote')}</span>}
                {row.key === 'age' && row.status === 'unknown' && program.grade_range && !program.age_range && <span className="fact-sub">{t('gradeBasisNote')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  )
}

/** 소개. 내 언어 검수본이 없으면 한국어 원문을 접어 둡니다(명세 5.4). */
export function DescriptionSection({ program, text }: Props & { text: ProgramText }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [clipped, setClipped] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  // 3줄을 넘을 때만 ‘더 보기’를 둡니다.
  useLayoutEffect(() => {
    const element = ref.current
    if (element && !expanded) setClipped(element.scrollHeight > element.clientHeight + 1)
  }, [expanded, text.description])
  return (
    <Block title={t('description')}>
      {text.missingTranslation ? (
        <details className="original">
          <summary>{t('showOriginal')}</summary>
          <p lang="ko">{program.description}</p>
        </details>
      ) : (
        <>
          <p ref={ref} className={expanded ? 'prose' : 'prose prose--clamp'} lang={text.lang}>{text.description}</p>
          {(clipped || expanded) && <button type="button" className="link-btn" onClick={() => setExpanded(!expanded)}>{expanded ? t('showLess') : t('showMore')}</button>}
        </>
      )}
    </Block>
  )
}

/**
 * 전체 회차: 앞으로의 회차를 먼저, 지난 회차는 접어 둡니다.
 * 회차가 하나뿐이면 위 일정 줄이 전부 말하므로 이 구역을 두지 않습니다. 장소가 모두 같으면 회차마다 되풀이하지 않습니다.
 */
export function SessionsSection({ program }: Props) {
  const { t } = useI18n()
  const { past, upcoming } = splitSessions(program)
  const total = program.session_count ?? program.sessions.length
  if (!program.sessions.length || (program.sessions.length === 1 && total <= 1)) return null
  // 운영이 끝난 공고는 지난 회차뿐이니 그대로 보여 줍니다.
  const main = upcoming.length ? upcoming : past
  const folded = upcoming.length ? past : []
  const groups = groupSessions(program, main)
  const showPlace = placesDiffer(program)
  return (
    <Block title={t('sessionsTitle')}>
      {upcoming.length > 0 && <AttendanceRule program={program} started={past.length > 0} />}
      {folded.length > 0 && <p>{t('sessionsRemaining', { remaining: upcoming.length, total: program.sessions.length })}</p>}
      {groups
        ? <ul className="sessions">{groups.map((group) => <SessionGroupRow key={group.key} program={program} group={group} showPlace={showPlace} />)}</ul>
        : <ol className="sessions">{main.map((session) => <SessionRow key={session.id} program={program} session={session} showPlace={showPlace} />)}</ol>}
      {folded.length > 0 && (
        <details className="sessions-past">
          <summary>{t('pastSessions', { count: folded.length })}</summary>
          <ol className="sessions">{folded.map((session) => <SessionRow key={session.id} program={program} session={session} showPlace={showPlace} />)}</ol>
        </details>
      )}
    </Block>
  )
}

/** 참석 방식. 이미 시작한 과정에 ‘모든 회차에 참여해야 해요’라고 하지 않습니다. */
function AttendanceRule({ program, started }: Props & { started: boolean }) {
  const { t } = useI18n()
  const classes = classNames(program)
  if (program.attendance_rule !== 'choose_one' && started) {
    return <p>{program.mid_join_allowed ? t('attendRemaining') : <Unknown>{t('attendStarted')}</Unknown>}</p>
  }
  if (program.attendance_rule === 'unknown' && classes.length > 1) {
    return <p><Unknown>{t('attendClasses', { classes: classes.map((item) => item.name).join('·') })}</Unknown></p>
  }
  if (program.attendance_rule === 'unknown') return <p><Unknown>{t('attendanceUnknown')}</Unknown></p>
  return <p>{program.attendance_rule === 'all_sessions' ? t('attendAll') : t('chooseOne')}</p>
}

/** 넣은 시간과 맞는지 표시. 시간 판정이 미상이면 ‘맞음’이라 하지 않고 시간 안에 든다고만 합니다. */
function SessionFlag({ matched, possible }: { matched: boolean; possible: boolean }) {
  const { t } = useI18n()
  if (matched) return <span className="session-flag"><Icon name="check" />{t('sessionMatched')}</span>
  return possible ? <span className="session-flag"><Icon name="check" />{t('sessionPossible')}</span> : null
}

function SessionRow({ program, session, showPlace }: Props & { session: Program['sessions'][number]; showPlace: boolean }) {
  const { locale } = useI18n()
  const matched = program.matched_sessions.includes(session.id)
  const possible = !!program.possible_sessions?.includes(session.id)
  return (
    <li className={matched || possible ? 'session is-matched' : 'session'}>
      <span className="session-when">{formatSessionWhen(session, locale)}</span>
      {showPlace && <span className="session-where" lang={placeLang(session)}>{formatSessionPlace(session, locale)}</span>}
      <SessionFlag matched={matched} possible={possible} />
    </li>
  )
}

function SessionGroupRow({ program, group, showPlace }: Props & { group: NonNullable<ReturnType<typeof groupSessions>>[number]; showPlace: boolean }) {
  const { locale, t } = useI18n()
  const first = group.sessions[0]
  const last = group.sessions[group.sessions.length - 1]
  const matched = group.sessions.some((session) => program.matched_sessions.includes(session.id))
  const possible = group.sessions.some((session) => program.possible_sessions?.includes(session.id))
  const day = weekdayLabel(locale, group.day)
  return (
    <li className={matched || possible ? 'session is-matched' : 'session'}>
      <span className="session-when">
        {group.className && <span lang="ko">{group.className} · </span>}
        {group.weekly ? t('sessionWeekly', { day, time: group.time }) : t('sessionDayTime', { day, time: group.time })}
      </span>
      <span className="session-where">{t('sessionRange', { from: formatDate(first.date!, locale), to: formatDate(last.date!, locale), count: group.sessions.length })}</span>
      {showPlace && <span className="session-where" lang={placeLang(first)}>{formatSessionPlace(first, locale)}</span>}
      <SessionFlag matched={matched} possible={possible} />
      <details className="session-dates">
        <summary>{t('sessionDates')}</summary>
        <ul>{group.sessions.map((session) => <li key={session.id}>{formatSessionWhen(session, locale)}</li>)}</ul>
      </details>
    </li>
  )
}

/**
 * 참여 정보: 공고로 확인된 동반 규칙·한국어 수준·기관과 신청 페이지의 언어(명세 3·5.2장).
 * 모르는 항목은 추정하지 않고 한 줄로 모아 적습니다. 하나씩 ‘공고에 없어요’를 되풀이하면 확인된 내용이 묻힙니다.
 */
export function ParticipationSection({ program }: Props) {
  const { locale, t } = useI18n()
  const languages = (codes: string[]) => (codes.length ? codes.map((code) => languageName(locale, code)).join(', ') : t('languageNone'))
  const rows: { label: string; value: ReactNode | null }[] = [
    { label: t('rowGuardian'), value: program.guardian_companion == null ? null : <Companion rule={program.guardian_companion} /> },
    { label: t('rowSibling'), value: program.sibling_companion == null ? null : <Companion rule={program.sibling_companion} /> },
    { label: t('rowKoreanLevel'), value: program.korean_level_required ? <span lang="ko">{program.korean_level_required}</span> : null },
    { label: t('rowSupportLanguage'), value: program.support_languages ? languages(program.support_languages) : null },
    { label: t('rowApplicationLanguage'), value: program.application_languages ? languages(program.application_languages) : null },
  ]
  const known = rows.filter((row) => row.value !== null)
  const unknown = rows.filter((row) => row.value === null)
  return (
    <Block title={t('participationTitle')}>
      {known.length > 0 && <dl className="rows">{known.map((row) => <Row key={row.label} label={row.label}>{row.value}</Row>)}</dl>}
      {unknown.length > 0 && <p className="participation-unknown"><Unknown>{t('notInNoticeList', { items: unknown.map((row) => row.label).join(', ') })}</Unknown></p>}
    </Block>
  )
}

function Block({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return <section className={className ? `block ${className}` : 'block'}><h2 className="block-title">{title}</h2>{children}</section>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="row"><dt>{label}</dt><dd>{children}</dd></div>
}

function Judge({ status }: { status: MatchStatus }) {
  const { t } = useI18n()
  const label = { matched: t('judgeMatched'), not_matched: t('judgeNotMatched'), unknown: t('judgeUnknown'), not_applied: '' }[status]
  return status === 'unknown' ? <Marked>{label}</Marked> : <span className={`judge judge--${status}`}>{label}</span>
}

function Companion({ rule }: { rule: NonNullable<CompanionRule> }) {
  const { t } = useI18n()
  return <>{{ required: t('companionRequired'), allowed: t('companionAllowed'), not_allowed: t('companionNotAllowed') }[rule]}</>
}

/** ? 글머리. 뜻은 늘 옆 글자가 전하므로 읽기 프로그램에는 숨깁니다. */
const QuestionMark = () => <span className="q-mark" aria-hidden="true">?</span>

/**
 * 아래쪽 구역에서 다시 나오는 미확인 값(동반·한국어 수준·언어·참석 방식).
 * ‘기관에 확인할 점’ 칸이 이미 노란색으로 알리므로 형광펜을 또 칠하지 않고 ? 표시만 둡니다.
 */
function Unknown({ children }: { children: ReactNode }) {
  return <span className="unknown"><QuestionMark />{children}</span>
}
