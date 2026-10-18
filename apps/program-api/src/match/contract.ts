import type {
  Addendum, AddendumCover, ApplicationMethod, DisplayLanguage, GuardianSummary, InquiryMethod, ProgramRecord, ProgramSession, SummariesByLanguage,
  UncertainItem, UncertainTopic,
} from '../types'
import { methodPurpose } from '../summarize/facts'
import { isValidDate } from './dates'
import { compareSessions, hasOperationEnded, hasStarted, MID_JOIN_MENTION } from './sessions'
import type { Clock, TimeJudgement } from './sessions'

// 저장된 사실을 보호자 웹의 데이터 계약(apps/guardian-web/src/data/types.ts)에 맞춰 옮기는 규칙.
// 판정은 evaluate.ts가 하고, 여기서는 보여주는 모양만 바꾼다.

/** 보호자 웹이 다른 자리에 이미 보여주는 미상 항목 (비용 행·신청 상태·신청 버튼) */
const SHOWN_ELSEWHERE = /^(?:참가비|신청 기간|신청 시작일|신청 마감일|신청 방법)$/
const OUTSIDE_OSAN = /^오산시 밖 장소\((.+)\)$/

const TOPIC_RULES: [UncertainTopic, RegExp][] = [
  ['age_grade', /^자녀가 참여하는 프로그램인지/],
  ['family_eligibility', /^참여 자격 확인 필요/],
  // '공동생활가정', '아동생활시설'의 '동생'은 아니다
  ['companion', /동반|형제|자매|동생(?!활)|(?:함께|같이)\s*(?:와|오|가|참여|들어)/],
  ['korean_level', /한국어/],
  ['materials', /준비물|재료|지참|복장|추가\s*비용|간식/],
  // '세 살', '몇 살', '5세대상'도 나이다 ('살고', '살지 않는', '한살림', '몇 세션', '3세대'는 아니다)
  ['age_grade', /학년|나이|연령|(?:\d|몇)\s*세(?![트션]|대(?!상))|\d\s*살|(?<![가-힣])(?:열\s*)?(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|몇)\s*살(?![고지던면았기림]|아(?![이동기]))/],
  // 가족 배경의 자격·조건을 묻는 항목 ('중도입국 후 체류 기간 조건', '입국 날짜 기준')
  ['family_eligibility', /^(?=.*(?:중도\s*입국|결혼\s*이민|이주\s*배경))(?=.*(?:자격|조건|요건|기준))/],
  ['schedule', MID_JOIN_MENTION],
  // 가족 배경을 대상으로 묻는 항목 ('결혼이민자 대상으로만 운영하는지'). 그 반의 시간·요일을 묻는 항목은 일정이다
  ['family_eligibility', /^(?=.*(?:중도\s*입국|결혼\s*이민|이주\s*배경))(?=.*대상)(?!.*(?:일정|일시|날짜|시간|요일|회차|개강|시작|마감))/],
  ['schedule', /일정|일시|날짜|시간|요일|회차|기간|운영|개강|시작|마감/],
  // 가족 배경과 거주 지역 (그 자녀의 나이·일정을 묻는 항목은 위에서 나이·일정으로 간다. '관외 체험', '타시는 곳'은 아니다)
  ['family_eligibility', /자격|대상|거주|다문화|가족|가정|소득|중도\s*입국|결혼\s*이민|이주\s*배경|살(?:지|고\s*있지)\s*않|관외(?:자|\s*(?:주민|지역|학교|학생|아동))|타\s*(?:지역|시\s*(?:[·,]\s*)?(?:도|군|주민|민|아동|학생))/],
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
/**
 * 신청(접수·모집) 기간·마감을 묻는 항목은 주제(일정)의 운영 기간이 아니라 원문의 신청 기간 표현을 붙인다.
 * 운영 기간과 견주는 항목('신청 마감이 운영 종료일보다 늦은 점')은 운영 기간 표현을 그대로 둔다
 */
const APPLICATION_ITEM = /^(?!.*(?:운영|행사|종료))(?=.*(?:신청|접수|모집)\s*(?:기간|일정|날짜|시작|마감|일시))/
const APPLICATION_FIELD = /^application_(?:period|start|end)$/
/** 목록과 본문처럼 신청 기간이 두 곳에 적혔으면 두 표현을 함께 보인다 (서로 다르게 적힌 공고) */
const MAX_APPLICATION_NOTES = 2

function sourceNote(record: ProgramRecord, topic: UncertainTopic, item: string): string | null {
  const outside = item.match(OUTSIDE_OSAN)
  if (outside) return outside[1]
  if (APPLICATION_ITEM.test(item)) {
    const quotes = [...new Set(record.evidence
      .filter((entry) => entry.verified && APPLICATION_FIELD.test(entry.field) && entry.quote.trim().length <= MAX_NOTE)
      .map((entry) => entry.quote.trim()))]
    if (quotes.length) return quotes.slice(0, MAX_APPLICATION_NOTES).join(' / ')
  }
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

/**
 * 참가비를 말하는 안내 ('참가비: 무료', '수강료는 5,000원', '1만 원', '무료로 참여해요').
 * 그냥 '무료'·'비용'은 주차·간식·셔틀이나 형제 동반 추가 비용일 수 있어 보지 않고,
 * 금액은 숫자 바로 뒤의 '원'만 본다 ('1:1 원어민', '031-372-1234 원장'은 아니다)
 */
const FEE_TEXT = /참가비|참여비|참가료|수강료|교육비|재료비|회비|(?:참가|참여|수강|교육|프로그램)\s*비용|(?<![\d-])\d[\d,]*(?:\s*[만천]\s*)?원|무료\s*(?:로\s*)?(?:참여|참가|수강|운영|진행)|(?:참여|참가|수강)(?:은|는|가|이)?\s*무료/
/** 참가비를 묻던 '기관에 확인할 점' (normalize.ts가 비용이 없을 때 넣는 '참가비') */
const FEE_ITEM = /^(?:참가비|참여비|수강료|재료비|회비)/

/**
 * 기관 추가 안내가 답한 주제. 안내의 주제와 푼 '기관에 확인할 점'의 주제(guardianUncertainItems와 같은 분류, 기타 제외)를 모으고,
 * 안내가 참가비를 말하거나 참가비 항목을 풀었으면 'cost'를 붙인다 (보호자 웹이 비용 행의 '확인 필요'를 이 안내로 바꿔 보여 준다).
 * openTopics를 주면 아직 남은 확인할 점의 주제는 빼서, 같은 주제의 다른 질문이 숨지 않게 한다
 */
export function addendumCovers(addendum: Pick<Addendum, 'topic' | 'text' | 'resolves_items'>, openTopics: ReadonlySet<UncertainTopic> = new Set()): AddendumCover[] {
  const covers = new Set<AddendumCover>()
  if (addendum.topic !== 'other') covers.add(addendum.topic)
  for (const item of addendum.resolves_items) {
    const topic = uncertainTopic(item)
    if (topic && topic !== 'other') covers.add(topic)
  }
  for (const topic of openTopics) covers.delete(topic)
  if (FEE_TEXT.test(addendum.text) || addendum.resolves_items.some((item) => FEE_ITEM.test(item.trim()))) covers.add('cost')
  return [...covers]
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
