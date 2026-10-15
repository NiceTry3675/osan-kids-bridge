import type { ProgramRecord } from '../types'
import {
  normalizeForMatch, supportsAgeRange, supportsAttendance, supportsAudience, supportsCompanion, supportsCost, supportsDate, supportsEligibility,
  supportsGradeRange, supportsLanguage, supportsNumber, supportsPhone, supportsTargetType, supportsTime,
} from '../extract/evidence'

// 승인 전 확인: 값이 있는데 원문에서 찾은(verified) 근거 인용이 없거나, 지금 값이 그 인용과 맞지 않는 핵심 사실.
// 근거 필드 이름은 extract/normalize.ts가 evidence에 남기는 이름과 같다.
// 추출 뒤 사람이 값을 고쳤을 수 있으므로 verified 표시만 믿지 않고 지금 값을 인용과 다시 대조한다.

export interface FactCheck {
  /** 화면에 보일 이름 */
  label: string
  /** 값이 있는가 (미상이면 근거가 없어도 된다) */
  present: boolean
  /** 이 필드들의 verified 근거를 모아 대조한다 */
  fields: string[]
  /** 지금 값이 근거 인용(이어 붙인 글)과 맞는가. 없으면 근거가 있기만 하면 된다 */
  supports?: (text: string) => boolean
}

const contains = (value: string) => (text: string) => normalizeForMatch(text).includes(normalizeForMatch(value))

/** 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM'의 날짜와 시각이 인용에 있는지 */
const supportsDateTime = (value: string | null, text: string) => {
  if (!value) return true
  const [date, time] = value.split('T')
  return supportsDate(date, text) && (!time || supportsTime(time, text))
}

/** 회차가 하나뿐이어서 근거 없이 all_sessions로 둔 경우 */
const singleSession = (record: ProgramRecord) =>
  record.sessions.length === 1 && (record.session_count === null || record.session_count === 1) && record.attendance_rule === 'all_sessions'

export function factChecks(record: ProgramRecord): FactCheck[] {
  const { target_type: targetType, audience, grade_range: grade, age_range: age } = record
  const checks: FactCheck[] = [
    { label: '제목', present: true, fields: ['title'] },
    {
      label: '대상 구분', present: targetType !== 'unknown', fields: ['target_type'],
      supports: (text) => targetType !== 'unknown' && supportsTargetType(targetType, text),
    },
    { label: '대상 원문 표현', present: record.target_raw.trim() !== '', fields: ['target_raw'], supports: contains(record.target_raw) },
    // 참여하는 사람은 audience 근거로만 확인한다 (대상 문구가 있다고 자녀 대상이 되지 않는다)
    { label: '참여하는 사람(audience)', present: audience !== 'unknown', fields: ['audience'], supports: (text) => supportsAudience(audience, text) },
    { label: '학년 범위', present: grade !== null, fields: ['grade_range'], supports: (text) => grade !== null && supportsGradeRange(grade, text) },
    { label: '나이 범위', present: age !== null, fields: ['age_range'], supports: (text) => age !== null && supportsAgeRange(age, text) },
    {
      label: '참여 자격', present: record.eligibility_requirements !== null, fields: ['eligibility_requirements', 'target_type'],
      supports: (text) => supportsEligibility(record.eligibility_requirements ?? [], text),
    },
    {
      label: '보호자 동반', present: record.guardian_companion !== 'unknown', fields: ['guardian_companion'],
      supports: (text) => supportsCompanion(record.guardian_companion, text, 'guardian'),
    },
    {
      label: '형제자매 동반', present: record.sibling_companion !== 'unknown', fields: ['sibling_companion'],
      supports: (text) => supportsCompanion(record.sibling_companion, text, 'sibling'),
    },
    { label: '필요 한국어 수준', present: record.korean_level_required !== null, fields: ['korean_level_required'] },
    {
      label: '기관 지원 언어', present: record.support_languages !== null, fields: ['support_languages'],
      supports: (text) => (record.support_languages ?? []).every((code) => supportsLanguage(code, text)),
    },
    {
      label: '신청 페이지 언어', present: record.application_languages !== null, fields: ['application_languages'],
      supports: (text) => (record.application_languages ?? []).every((code) => supportsLanguage(code, text)),
    },
  ]
  for (const session of record.sessions) {
    const name = `회차 ${session.date ?? session.id}`
    const key = `sessions[${session.id}]`
    checks.push(
      { label: `${name} 날짜`, present: session.date !== null, fields: [`${key}.date`], supports: (text) => supportsDateTime(session.date, text) },
      {
        label: `${name} 시각`, present: session.start_time !== null || session.end_time !== null, fields: [`${key}.time`],
        supports: (text) => [session.start_time, session.end_time].every((time) => time === null || supportsTime(time, text)),
      },
      { label: `${name} 장소`, present: Boolean(session.place_name || session.address), fields: [`${key}.place`, 'venue'] },
    )
  }
  checks.push(
    {
      label: '운영 기간', present: record.period_start !== null || record.period_end !== null, fields: ['period'],
      supports: (text) => supportsDateTime(record.period_start, text) && supportsDateTime(record.period_end, text),
    },
    {
      label: '총 회차 수', present: record.session_count !== null, fields: ['session_count'],
      supports: (text) => record.session_count !== null && supportsNumber(record.session_count, text),
    },
    {
      label: '참석 방식', present: record.attendance_rule !== 'unknown' && !singleSession(record), fields: ['attendance_rule'],
      supports: (text) => supportsAttendance(record.attendance_rule, text, record.title),
    },
    { label: '중도 참여', present: record.mid_join_allowed !== null, fields: ['mid_join_allowed'] },
    {
      label: '비용', present: record.cost_krw !== null || record.cost_raw !== null, fields: ['cost'],
      supports: (text) => record.cost_krw === null || supportsCost(record.cost_krw, text),
    },
    {
      label: '정원', present: record.capacity !== null, fields: ['capacity'],
      supports: (text) => record.capacity !== null && supportsNumber(record.capacity, text),
    },
    {
      label: '신청 기간', present: record.application_start !== null || record.application_end !== null, fields: ['application_period'],
      supports: (text) => supportsDateTime(record.application_start, text) && supportsDateTime(record.application_end, text),
    },
  )
  for (const method of record.application_methods) {
    checks.push({
      label: `신청 방법(${method.label})`, present: true, fields: [`application_methods.${method.type}`],
      supports: (text) => !method.phone || supportsPhone(method.phone, text),
    })
  }
  return checks
}

/** 원문 근거로 확인되지 않은 핵심 사실 이름들. 근거가 없거나 지금 값이 근거와 맞지 않으면 넣는다. 비어 있어야 --force 없이 승인할 수 있다 */
export function unverifiedFacts(record: ProgramRecord): string[] {
  return factChecks(record)
    .filter((check) => {
      if (!check.present) return false
      const quotes = record.evidence.filter((entry) => entry.verified && check.fields.includes(entry.field)).map((entry) => entry.quote)
      return !quotes.length || (check.supports !== undefined && !check.supports(quotes.join('\n')))
    })
    .map((check) => check.label)
}
