import type {
  ApplicationMethod, DisplayLanguage, GuardianSummary, InquiryMethod, ProgramRecord, ProgramSession, SummariesByLanguage, UncertainItem, UncertainTopic,
} from '../types'
import { methodPurpose } from '../summarize/facts'
import { isValidDate } from './dates'
import { compareSessions, hasOperationEnded, hasStarted } from './sessions'
import type { Clock, TimeJudgement } from './sessions'

// 저장된 사실을 보호자 웹의 데이터 계약(apps/guardian-web/src/data/types.ts)에 맞춰 옮기는 규칙.
// 판정은 evaluate.ts가 하고, 여기서는 보여주는 모양만 바꾼다.

/** 보호자 웹이 다른 자리에 이미 보여주는 미상 항목 (비용 행·신청 상태·신청 버튼) */
const SHOWN_ELSEWHERE = /^(?:참가비|신청 기간|신청 시작일|신청 마감일|신청 방법)$/
const OUTSIDE_OSAN = /^오산시 밖 장소\((.+)\)$/

const TOPIC_RULES: [UncertainTopic, RegExp][] = [
  ['age_grade', /^자녀가 참여하는 프로그램인지/],
  ['family_eligibility', /^참여 자격 확인 필요/],
  ['companion', /동반|형제|자매|(?:함께|같이)\s*(?:와|오|가|참여|들어)/],
  ['korean_level', /한국어/],
  ['materials', /준비물|재료|지참|복장|추가\s*비용|간식/],
  ['age_grade', /학년|나이|연령|\d\s*세|살/],
  ['schedule', /일정|일시|날짜|시간|요일|회차|기간|운영|중도|개강|시작|마감/],
  ['family_eligibility', /자격|대상|거주|다문화|가족|가정|소득/],
]

/** 한국어 확인 항목 하나의 주제. 보호자 웹이 다른 자리에 보여주는 항목은 null */
export function uncertainTopic(item: string): UncertainTopic | null {
  if (SHOWN_ELSEWHERE.test(item)) return null
  if (OUTSIDE_OSAN.test(item)) return 'other'
  return TOPIC_RULES.find(([, pattern]) => pattern.test(item))?.[0] ?? 'other'
}

/** 주제마다 원문 표현을 찾아볼 근거 필드 */
const NOTE_FIELDS: Partial<Record<UncertainTopic, string[]>> = {
  family_eligibility: ['eligibility_requirements', 'target_raw'],
  companion: ['guardian_companion', 'sibling_companion'],
  korean_level: ['korean_level_required'],
  age_grade: ['grade_range', 'age_range', 'target_raw'],
  schedule: ['schedule_note', 'period'],
}
const MAX_NOTE = 80

function sourceNote(record: ProgramRecord, topic: UncertainTopic, item: string): string | null {
  const outside = item.match(OUTSIDE_OSAN)
  if (outside) return outside[1]
  for (const field of NOTE_FIELDS[topic] ?? []) {
    const quote = record.evidence.find((entry) => entry.verified && entry.field === field && entry.quote.trim().length <= MAX_NOTE)?.quote.trim()
    if (quote) return quote
  }
  return null
}

/** 한국어 확인 항목을 보호자 웹의 주제로 묶는다. 같은 주제는 한 번만, 원문 표현은 처음 찾은 것 */
export function guardianUncertainItems(record: ProgramRecord, items: string[]): UncertainItem[] {
  const byTopic = new Map<UncertainTopic, UncertainItem>()
  for (const item of items) {
    const topic = uncertainTopic(item)
    if (!topic) continue
    const existing = byTopic.get(topic)
    if (existing) existing.note_ko ??= sourceNote(record, topic, item)
    else byTopic.set(topic, { topic, note_ko: sourceNote(record, topic, item) })
  }
  return [...byTopic.values()]
}

export const isSafeUrl = (value: string | null | undefined): value is string => {
  if (!value) return false
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** 주소가 없는 온라인 신청·문의는 원문 페이지로 연결한다 (원문에 신청 안내가 있으므로) */
function withSourceUrl<T extends { type: string; url?: string }>(method: T, sourceUrl: string | null): T {
  if (method.type !== 'online' || isSafeUrl(method.url) || !isSafeUrl(sourceUrl)) return method
  return { ...method, url: sourceUrl }
}

/** 신청 방법과 문의만 받는 연락처를 나눈다 (요약의 기준과 같은 methodPurpose) */
export function guardianMethods(record: ProgramRecord, verifiedAt: string): { apply: ApplicationMethod[]; inquiry: InquiryMethod[] } {
  const apply: ApplicationMethod[] = []
  const inquiry: InquiryMethod[] = []
  for (const method of record.application_methods) {
    if (methodPurpose(method) === 'apply') {
      apply.push(withSourceUrl(method, record.source.url))
      continue
    }
    const { type, phone, address, url } = withSourceUrl(method, record.source.url)
    inquiry.push({
      type,
      ...(phone ? { phone } : {}),
      ...(address ? { address } : {}),
      ...(url ? { url } : {}),
      hours: null,
      languages: null,
      verified_at: verifiedAt,
    })
  }
  return { apply, inquiry }
}

/**
 * 대표 회차. 시간이 맞으면 가장 빠른 일치 회차, 아니면 앞으로 시작할 가장 빠른 회차.
 * 그런 회차가 없으면 끝난 공고는 마지막 회차를, 날짜를 모르면 장소가 있는 회차나 원문의 공통 장소를 날짜 없이 보낸다
 * (보호자 웹은 날짜가 없으면 '일정 확인 필요'로, 장소는 그대로 보여준다).
 */
export function representativeSession(record: ProgramRecord, time: TimeJudgement, clock: Clock): ProgramSession | null {
  if (time.status === 'matched' && time.matched[0]) return time.matched[0]
  const dated = record.sessions.filter((session) => isValidDate(session.date)).sort(compareSessions)
  const upcoming = dated.find((session) => !hasStarted(session, clock))
  if (upcoming) return upcoming
  if (dated.length && hasOperationEnded(record, clock)) return dated[dated.length - 1]
  const placed = record.sessions.find((session) => !isValidDate(session.date) && (session.place_name || session.online))
  if (placed) return placed
  const venue = record.venue
  if (!venue || (!venue.place_name && !venue.online)) return null
  return { id: 'venue', date: null, start_time: null, end_time: null, place_name: venue.place_name, dong: venue.dong, online: venue.online, address: venue.address }
}

/**
 * 보호자 웹이 받는 언어별 안내. 쉬운 한국어는 원문 제목·기관·대상을, 베트남어·중국어는 그 언어로 만든 머리글을 쓴다.
 * 머리글이 없는 언어와 승인·자동 대조를 통과하지 못한 요약은 넣지 않는다 (보호자 웹이 '안내 없음'으로 보여준다).
 */
export function guardianSummaries(record: ProgramRecord, summaries: SummariesByLanguage): Partial<Record<DisplayLanguage, GuardianSummary>> {
  const result: Partial<Record<DisplayLanguage, GuardianSummary>> = {}
  for (const [language, summary] of Object.entries(summaries) as [DisplayLanguage, NonNullable<SummariesByLanguage[DisplayLanguage]>][]) {
    if (summary.status !== 'approved' && summary.status !== 'machine_checked') continue
    const heading = language === 'ko-easy'
      ? { title: record.title, institution: record.institution, target: record.target_raw }
      : summary.heading
    if (!heading) continue
    result[language] = {
      title: heading.title,
      institution: heading.institution,
      target: heading.target,
      description: summary.lines.join(' '),
      reviewed_at: summary.approved_at ?? summary.generated_at,
      status: summary.status,
      lines: summary.lines,
    }
  }
  return result
}
