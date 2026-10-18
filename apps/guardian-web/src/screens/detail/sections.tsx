/** 상세 페이지를 위에서 아래로 이루는 부분들. 순서는 DetailScreen이 정합니다. */
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'
import type { CompanionRule, MatchStatus, Program, UncertainItem } from '../../data/types'
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

/** 화면 언어 문구가 있는 주제. 서버가 모르는 주제를 보내면 주제 줄을 감춥니다. */
const TOPICS: UncertainItem['topic'][] = ['family_eligibility', 'companion', 'korean_level', 'schedule', 'age_grade', 'materials', 'other']

/**
 * 기관이 확인해 덧붙인 안내: 공고가 나온 뒤 담당자가 이름을 걸고 확정한 한국어 문장.
 * 공고 원문이 아니라는 것을 함께 적고, 화면 언어로는 무엇에 관한 안내인지(주제)와 덧붙인 날만 옮깁니다.
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
        {addenda.map((addendum, index) => (
          <li key={`${addendum.topic}-${index}`}>
            <span className="addendum-meta">
              {[
                addendum.topic !== 'other' && TOPICS.includes(addendum.topic) ? topicLabel(locale, addendum.topic) : null,
                addendum.added_at ? t('addendumDate', { date: formatDate(addendum.added_at, locale) }) : null,
              ].filter(Boolean).join(' · ')}
            </span>
            <p className="addendum-text" lang="ko">{addendum.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * 기관에 확인할 점: 미확인 항목과 원문에 적힌 관련 표현.
 * 노란 카드 하나가 ‘아직 확인되지 않음’ 신호라서 항목마다 형광펜을 다시 칠하지 않고, 원문 표현을 그대로 둡니다.
 */
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
            <QuestionMark />
            <span className="check-text">
              <span className="check-topic">{topicLabel(locale, item.topic)}</span>
              {item.note_ko && <span className="check-quote"><WithKorean template={t('sourceSays', { text: SLOT })} text={item.note_ko} /></span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

type Comparison = { key: 'age' | 'time' | 'eligibility'; label: string; status: MatchStatus }

/**
 * 우리 아이 조건과 비교. 맞는 것은 초록 알약으로, 공고만으로 모르는 것은 형광펜으로 보이고 넣지 않은 조건은 감춥니다.
 * 조건을 넣고 들어오면 DetailScreen이 머리글 바로 아래에 둡니다. 공유 링크로 바로 열면 비교하지 않았다고 알립니다.
 */
/** compared: 조건을 넣고 왔음(머리글 아래 요약) / noConditions: 목록에서 조건 없이 왔음 / direct: 공유 링크로 바로 열었음 */
export type CompareMode = 'compared' | 'noConditions' | 'direct'

export function CompareSection({ program, mode }: Props & { mode: CompareMode }) {
  const { t } = useI18n()
  const rows: Comparison[] = [
    { key: 'age', label: t('rowAgeGrade'), status: program.age_grade_match_status },
    { key: 'time', label: t('rowTime'), status: program.time_match_status },
    { key: 'eligibility', label: t('rowEligibility'), status: program.eligibility_status },
  ]
  const shown = rows.filter((row) => row.status !== 'not_applied')
  const matched = shown.filter((row) => row.status === 'matched')
  const rest = shown.filter((row) => row.status !== 'matched')
  if (mode === 'noConditions') {
    // 조건을 넣지 않았으면 학년·시간은 '조건을 넣지 않았어요'로 그대로 보이고, 자격만 공고 기준으로 말한다
    return (
      <Block title={t('compareTitle')} className="compare">
        <ul className="compare-rest">
          {rows.map((row) => (
            <li key={row.key} className={`compare-line compare-line--${row.status}`}>
              {row.status === 'matched' ? <Icon name="check" /> : row.status === 'not_matched' ? <Icon name="x" /> : row.status === 'unknown' ? <QuestionMark /> : <span className="compare-none" aria-hidden="true" />}
              <span><span className="compare-label">{row.label}</span> {row.key === 'eligibility' && row.status === 'matched' ? <span className="judge judge--matched">{t('eligibilityConfirmed')}</span> : <Judge status={row.status} />}</span>
            </li>
          ))}
        </ul>
        <p className="muted">{t('noConditionsNote')}</p>
      </Block>
    )
  }
  return (
    <Block title={t('compareTitle')} className="compare">
      {mode === 'compared' ? (
        <>
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
                  <span><span className="compare-label">{row.label}</span> <Judge status={row.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </>
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
      <p>{program.attendance_rule === 'unknown' ? <Unknown>{rule}</Unknown> : rule}</p>
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
        <Row label={t('rowKoreanLevel')}>{program.korean_level_required ? <span lang="ko">{program.korean_level_required}</span> : <Unknown>{t('notInNotice')}</Unknown>}</Row>
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

function Block({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return <section className={className ? `block ${className}` : 'block'}><h2 className="block-title">{title}</h2>{children}</section>
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
  if (rule === null) return <Unknown>{t('notInNotice')}</Unknown>
  return <>{{ required: t('companionRequired'), allowed: t('companionAllowed'), not_allowed: t('companionNotAllowed') }[rule]}</>
}

/** null = 확인되지 않음, 빈 배열 = 확인 결과 지원 언어 없음(명세 6장) */
function LanguageList({ codes }: { codes: string[] | null }) {
  const { locale, t } = useI18n()
  if (codes === null) return <Unknown>{t('languageUnknown')}</Unknown>
  if (!codes.length) return <>{t('languageNone')}</>
  return <>{codes.map((code) => languageName(locale, code)).join(', ')}</>
}

/** ? 글머리. 뜻은 늘 옆 글자가 전하므로 읽기 프로그램에는 숨깁니다. */
const QuestionMark = () => <span className="q-mark" aria-hidden="true">?</span>

/**
 * 아래쪽 구역에서 다시 나오는 미확인 값(동반·한국어 수준·언어·참석 방식).
 * ‘기관에 확인할 점’ 카드가 이미 노란색으로 알리므로 형광펜을 또 칠하지 않고 ? 표시와 흐린 글자로 둡니다.
 */
function Unknown({ children }: { children: ReactNode }) {
  return <span className="unknown"><QuestionMark />{children}</span>
}

/** 화면 언어 문장 틀에 끼워 넣을 자리 표시 */
const SLOT = '\u0000'

/** 화면 언어 문장 속 한국어 원문에만 lang="ko"를 붙입니다(‘원문 표현: “…”’). */
function WithKorean({ template, text }: { template: string; text: string }) {
  const [before, after = ''] = template.split(SLOT)
  return <>{before}<span lang="ko">{text}</span>{after}</>
}
