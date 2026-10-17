import { createHash } from 'node:crypto'
import type { DisplayLanguage, LanguageSummary, ProgramRecord, ReviewStatus, SummariesByLanguage } from '../types'

// 검수 대상인 사실의 해시. 승인할 때 기록하고, 사실이 바뀌면 승인이 풀린 것(stale)으로 본다 (명세 6·7장).

/** 저장된 검수 상태 + 승인 뒤 사실이 바뀐 stale */
export type EffectiveReviewStatus = ReviewStatus | 'stale'

// 해시는 환경과 무관해야 하므로 로캘 비교 대신 코드 단위로 정렬한다
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * 해시에 넣는 사실: 검수 기록·언어별 요약·추출 시각·모델·경고·근거 확인 표시·시연 표시를 뺀 전부.
 * 기관 추가 안내(addenda)는 원문이 아니라 담당자가 이름을 걸고 확정한 문장이라 넣지 않는다 (덧붙여도 원문 검수가 풀리지 않는다)
 */
export function factFields(record: ProgramRecord): Record<string, unknown> {
  const { review, summaries_by_language, extracted_at, model, warnings, evidence, addenda, source: { demo, ...source }, ...facts } = record
  const quotes = evidence
    .map(({ field, quote }) => ({ field, quote }))
    .sort((a, b) => compareText(a.field, b.field) || compareText(a.quote, b.quote))
  return { ...facts, source, evidence: quotes }
}

/** 키 순서와 undefined 필드에 흔들리지 않는 JSON */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => compareText(a, b))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

export function factsHash(record: ProgramRecord): string {
  return sha256(canonicalJson(factFields(record)))
}

/**
 * 언어별 요약 승인의 해시: 지금 사실 + 언어 + 문구(3줄과 머리글). 사실을 고치거나 문구를 손대면 달라진다.
 * 머리글이 없는 요약은 머리글이 생기기 전과 같은 해시다
 */
export function summaryApprovalHash(record: ProgramRecord, language: DisplayLanguage, summary: Pick<LanguageSummary, 'lines' | 'heading'>): string {
  return sha256(canonicalJson({ facts: factsHash(record), language, lines: summary.lines, heading: summary.heading }))
}

/** 사람이 승인했고, 승인 뒤 공고 사실과 요약 문구가 바뀌지 않은 요약 */
export function isApprovedSummary(record: ProgramRecord, language: DisplayLanguage, summary: LanguageSummary | undefined): boolean {
  return summary?.status === 'approved' && summary.approved_hash === summaryApprovalHash(record, language, summary)
}

/**
 * 보호자에게 내보낼 언어별 요약: 승인이 지금 사실·문구와 맞는 것만 (명세 5.4, CONTENT_REVIEW).
 * 검수자 이름과 승인 해시는 내부 기록이라 빼고 승인 시각만 남긴다.
 */
/**
 * 보호자에게 내보낼 요약. 기본은 사람이 승인한 것만.
 * includeMachineChecked면 자동 대조를 통과한 요약도 status('machine_checked')를 그대로 붙여 내보낸다 (시연용, 화면에서 검수 전으로 표시)
 */
export function publicSummaries(record: ProgramRecord, includeMachineChecked = false): SummariesByLanguage {
  const result: SummariesByLanguage = {}
  for (const [language, summary] of Object.entries(record.summaries_by_language) as [DisplayLanguage, LanguageSummary][]) {
    const machineChecked = includeMachineChecked && summary.status === 'machine_checked' && summary.issues.length === 0
    if (!machineChecked && !isApprovedSummary(record, language, summary)) continue
    const { reviewer: _reviewer, approved_hash: _hash, ...shown } = summary
    result[language] = shown
  }
  return result
}

/** 보호자에게 보여도 되는가: 승인됐고 승인 뒤 사실이 바뀌지 않았다 */
export function isPublished(record: ProgramRecord): boolean {
  return record.review.status === 'approved' && record.review.facts_hash === factsHash(record)
}

export function effectiveReviewStatus(record: ProgramRecord): EffectiveReviewStatus {
  if (record.review.status === 'approved' && !isPublished(record)) return 'stale'
  return record.review.status
}
