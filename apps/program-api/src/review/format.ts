import { DISPLAY_LANGUAGES } from '../types'
import type { Audience, DisplayLanguage, ProgramRecord, SummaryStatus, TargetType } from '../types'
import { isApprovedSummary } from './hash'
import type { EffectiveReviewStatus } from './hash'

// 운영자 CLI(ingest·review)의 한국어 표기와 표 출력

export const REVIEW_LABELS: Record<EffectiveReviewStatus, string> = {
  pending: '검수 대기',
  approved: '승인·게시 중',
  rejected: '반려',
  stale: 'stale·재검수 필요',
}

export const AUDIENCE_LABELS: Record<Audience, string> = {
  child: '자녀',
  parent_child: '부모·자녀',
  parent_only: '보호자만',
  adult: '성인',
  unknown: '미상',
}

export const TARGET_LABELS: Record<TargetType, string> = {
  multicultural_family: '다문화가족',
  all: '누구나',
  parent_only: '보호자만',
  unknown: '미상',
}

const SUMMARY_LABELS: Record<SummaryStatus, string> = { machine_draft: '초안', machine_checked: '대조', approved: '승인' }
const LANGUAGE_SHORT: Record<DisplayLanguage, string> = { 'ko-easy': 'ko', vi: 'vi', zh: 'zh' }

/** 언어별 요약 상태. 승인 뒤 사실이나 문구가 바뀐 요약은 '승인 풀림' */
export function summaryStatusText(record: ProgramRecord): string {
  const parts = DISPLAY_LANGUAGES
    .filter((language) => record.summaries_by_language[language])
    .map((language) => {
      const summary = record.summaries_by_language[language]!
      const label = summary.status === 'approved' && !isApprovedSummary(record, language, summary) ? '승인 풀림' : SUMMARY_LABELS[summary.status] ?? '?'
      return `${LANGUAGE_SHORT[language]} ${label}`
    })
  return parts.length ? parts.join(' ') : '없음'
}

const shortDate = (date: string) => date.slice(5)
const shortStamp = (value: string | null) => (value ? value.slice(5).replace('T', ' ') : '?')

export function scheduleText(record: ProgramRecord): string {
  const dated = record.sessions.map((session) => session.date).filter((date): date is string => Boolean(date)).sort()
  const count = record.session_count ? `, 총 ${record.session_count}회` : ''
  if (dated.length) {
    const first = record.sessions[0]
    const time = first.start_time ? ` ${first.start_time}${first.end_time ? `~${first.end_time}` : ''}` : ' 시각 미상'
    const range = dated.length === 1 ? shortDate(dated[0]) : `${shortDate(dated[0])}~${shortDate(dated[dated.length - 1])}`
    return `${dated.length}회차 ${range}${time}${count}`
  }
  if (record.period_start || record.period_end) {
    return `기간 ${record.period_start ? shortDate(record.period_start) : '?'}~${record.period_end ? shortDate(record.period_end) : '?'}${count}`
  }
  return `일정 미상${count}`
}

export function costText(record: ProgramRecord): string {
  if (record.cost_krw === 0) return '무료'
  if (record.cost_krw !== null) return `${record.cost_krw.toLocaleString('ko-KR')}원`
  return record.cost_raw ?? '미상'
}

export function applicationText(record: ProgramRecord): string {
  if (!record.application_start && !record.application_end) return '미상'
  return `${shortStamp(record.application_start)}~${shortStamp(record.application_end)}`
}

// ---- 표 ----

/** 터미널 표시 폭: 한글·한자 등 넓은 글자는 2칸 */
export function displayWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    const wide = (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6)
    width += wide ? 2 : 1
  }
  return width
}

function fit(text: string, max: number): string {
  if (displayWidth(text) <= max) return text
  let result = ''
  for (const char of text) {
    if (displayWidth(`${result}${char}…`) > max) break
    result += char
  }
  return `${result}…`
}

const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - displayWidth(text)))

/** 칸 너비를 맞춘 표. 칸 하나는 maxWidth 폭을 넘으면 줄인다 */
export function formatTable(headers: string[], rows: string[][], maxWidth = 32): string {
  const cells = [headers, ...rows].map((row) => row.map((cell) => fit(cell.replace(/\s+/g, ' '), maxWidth)))
  const widths = headers.map((_, column) => Math.max(...cells.map((row) => displayWidth(row[column] ?? ''))))
  const line = (row: string[]) => row.map((cell, column) => pad(cell, widths[column])).join('  ').trimEnd()
  return [line(cells[0]), widths.map((width) => '-'.repeat(width)).join('  '), ...cells.slice(1).map(line)].join('\n')
}
