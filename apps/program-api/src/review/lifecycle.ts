import { DISPLAY_LANGUAGES } from '../types'
import type { DisplayLanguage, LanguageSummary, ProgramRecord, ReviewState, SummariesByLanguage } from '../types'
import { checkSummary } from '../summarize/check'
import { summaryFacts } from '../summarize/facts'
import { factsHash, isApprovedSummary, summaryApprovalHash } from './hash'

// 검수 상태 변경. 모두 새 객체를 돌려주는 순수 함수다 (저장은 CLI가 한다).

export const PENDING_REVIEW: ReviewState = { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null }

/** 베트남어·중국어 요약은 그 언어의 최종 검수자가 승인해야 한다 (CONTENT_REVIEW, 명세 9장 6) */
export const LANGUAGES_NEEDING_REVIEWER: DisplayLanguage[] = ['vi', 'zh']

/**
 * 다시 추출한 공고의 검수 상태.
 * 이전 승인이 지금 사실과 같은 해시에 대한 것이면 유지하고, 아니면 검수 대기로 되돌린다.
 */
export function carriedReview(previous: ProgramRecord | null, record: ProgramRecord): ReviewState {
  const review = previous?.review
  if (review?.status === 'approved' && review.facts_hash === factsHash(record)) return { ...review }
  return { ...PENDING_REVIEW }
}

/**
 * 다시 추출한 공고에 이전 요약을 그대로 쓸 수 있는가.
 * 사실이 같고(검수 기록과 무관하게 해시 비교) 세 언어가 모두 있을 때만. 아니면 null.
 */
export function reusableSummaries(previous: ProgramRecord | null, record: ProgramRecord): SummariesByLanguage | null {
  if (!previous || factsHash(previous) !== factsHash(record)) return null
  const summaries = previous.summaries_by_language
  return DISPLAY_LANGUAGES.every((language) => summaries[language]) ? structuredClone(summaries) : null
}

type SummaryChange = (summary: LanguageSummary, language: DisplayLanguage) => LanguageSummary

function mapSummaries(summaries: SummariesByLanguage, change: SummaryChange): SummariesByLanguage {
  return Object.fromEntries(Object.entries(summaries)
    .map(([language, summary]) => [language, change(summary, language as DisplayLanguage)])) as SummariesByLanguage
}

/** 사람의 승인을 거둔다. 승인 기록(검수자·시각·해시)도 지운다 */
function withdrawn(summary: LanguageSummary): LanguageSummary {
  const { reviewer: _reviewer, approved_at: _at, approved_hash: _hash, ...rest } = summary
  return summary.status === 'approved' ? { ...rest, status: 'machine_checked' } : rest
}

export interface ApproveOptions {
  /** 원문 사실 대조자 (필수) */
  reviewer: string
  now: Date
  notes?: string | null
  /** 함께 승인할 요약의 언어. 자동 대조를 통과했고 지금 사실로 다시 검사해도 문제가 없는 요약만 승인한다 */
  summaries?: DisplayLanguage[]
  /** 요약 언어의 최종 검수자. 베트남어·중국어를 승인하려면 필요하다 (쉬운 한국어는 없으면 reviewer) */
  languageReviewer?: string | null
}

/**
 * 공고를 승인한다. 요약은 다음처럼 정리한다.
 * - options.summaries의 언어: machine_checked(또는 approved)이고 지금 사실로 다시 검사해 문제가 없으면 승인하고,
 *   검수자·시각·승인 해시(사실 + 언어 + 문구)를 남긴다. 검사에 걸리면 machine_draft로 내린다.
 * - 그 밖의 언어: 이전 승인이 지금 사실·문구와 맞으면 유지하고, 아니면 승인을 거둔다 (사실을 고친 뒤 재승인한 경우 등).
 */
export function approveRecord(record: ProgramRecord, options: ApproveOptions): ProgramRecord {
  const reviewer = options.reviewer?.trim()
  if (!reviewer) throw new Error('검수자 이름이 필요합니다.')
  const languages = options.summaries ?? []
  const languageReviewer = options.languageReviewer?.trim() || null
  const missing = languages.filter((language) => LANGUAGES_NEEDING_REVIEWER.includes(language))
  if (missing.length && !languageReviewer) throw new Error(`${missing.join(', ')} 요약을 승인하려면 그 언어의 최종 검수자가 필요합니다.`)

  const approvedAt = options.now.toISOString()
  let facts: ReturnType<typeof summaryFacts> | null = null
  const summaries = mapSummaries(record.summaries_by_language, (summary, language) => {
    if (!languages.includes(language)) return isApprovedSummary(record, language, summary) ? summary : withdrawn(summary)
    if (summary.status === 'machine_draft') return withdrawn(summary)
    facts ??= summaryFacts(record, options.now)
    const issues = checkSummary(summary.lines, facts, language)
    if (issues.length) return { ...withdrawn(summary), status: 'machine_draft', issues }
    return {
      ...summary,
      status: 'approved',
      issues: [],
      reviewer: languageReviewer ?? reviewer,
      approved_at: approvedAt,
      approved_hash: summaryApprovalHash(record, language, summary.lines),
    }
  })
  return {
    ...record,
    summaries_by_language: summaries,
    review: { status: 'approved', reviewed_at: approvedAt, reviewer, notes: options.notes ?? null, facts_hash: factsHash(record) },
  }
}

/** 반려하면 언어별 요약의 승인도 거둔다 */
export function rejectRecord(record: ProgramRecord, options: { reviewer: string; now: Date; notes: string }): ProgramRecord {
  const reviewer = options.reviewer?.trim()
  if (!reviewer) throw new Error('검수자 이름이 필요합니다.')
  return {
    ...record,
    summaries_by_language: mapSummaries(record.summaries_by_language, withdrawn),
    review: { status: 'rejected', reviewed_at: options.now.toISOString(), reviewer, notes: options.notes, facts_hash: factsHash(record) },
  }
}

/** 검수 대기로 되돌린다. 사람이 승인한 요약도 자동 대조 통과 상태로 되돌린다 */
export function resetReview(record: ProgramRecord): ProgramRecord {
  return {
    ...record,
    summaries_by_language: mapSummaries(record.summaries_by_language, withdrawn),
    review: { ...PENDING_REVIEW },
  }
}
