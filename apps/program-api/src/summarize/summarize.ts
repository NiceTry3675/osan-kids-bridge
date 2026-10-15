import { DISPLAY_LANGUAGES } from '../types'
import type { DisplayLanguage, LanguageSummary, ProgramRecord, SummariesByLanguage } from '../types'
import { generateJson } from '../llm/gemini'
import { checkSummary, verifyWithModel } from './check'
import { summaryFacts } from './facts'
import type { SummaryFacts } from './facts'
import { buildSummaryPrompt, SUMMARY_SCHEMA, summarySystemPrompt } from './prompt'
import type { PreviousAttempt } from './prompt'

// 언어마다 따로 부른다. 세 언어 모두 한국어 초안의 번역이 아니라 같은 사실에서 바로 만들어
// 한 언어의 실수가 다른 언어로 옮지 않게 하고, 검사에 걸린 언어만 다시 쓰게 한다. 세 언어는 동시에 부른다.

/** 첫 초안 + 검사 결과를 알려 주고 다시 쓰는 1회 */
const MAX_ATTEMPTS = 2

export interface SummarizeOptions {
  languages?: DisplayLanguage[]
  now?: Date
}

const cleanLine = (line: unknown) => String(line ?? '')
  .replace(/\s+/g, ' ')
  .replace(/^(?:[-•*·]|[1-3][.)])\s+/, '')
  .trim()

async function draftLines(facts: SummaryFacts, language: DisplayLanguage, previous: PreviousAttempt | null): Promise<string[]> {
  const response = await generateJson<Partial<Record<'line1' | 'line2' | 'line3', string>>>({
    system: summarySystemPrompt(language),
    parts: [{ text: buildSummaryPrompt(facts, language, previous) }],
    schema: SUMMARY_SCHEMA,
  })
  return [response.line1, response.line2, response.line3].map(cleanLine)
}

/** 모델 대조가 실패하면 통과로 보지 않고 실패 사유를 문제로 남긴다 */
async function modelIssues(lines: string[], facts: SummaryFacts, language: DisplayLanguage): Promise<{ issues: string[]; failed: boolean }> {
  try {
    return { issues: await verifyWithModel(lines, facts, language), failed: false }
  } catch (error) {
    return { issues: [`모델 대조 실패: ${String((error as Error)?.message ?? error).slice(0, 160)}`], failed: true }
  }
}

async function summarizeLanguage(facts: SummaryFacts, language: DisplayLanguage, now: Date): Promise<LanguageSummary> {
  let previous: PreviousAttempt | null = null
  let lines: string[] = []
  let issues: string[] = []
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    lines = await draftLines(facts, language, previous)
    issues = checkSummary(lines, facts, language)
    // 결정적 검사를 통과했거나 마지막 시도면 모델 대조까지 해서 검수자가 볼 문제를 모두 남긴다
    if (!issues.length || attempt === MAX_ATTEMPTS) {
      const model = await modelIssues(lines, facts, language)
      issues = [...issues, ...model.issues]
      if (model.failed) break
    }
    if (!issues.length) break
    previous = { lines, issues }
  }
  // approved는 사람 검수자만 기록한다
  return { lines, status: issues.length ? 'machine_draft' : 'machine_checked', generated_at: now.toISOString(), issues }
}

/**
 * 구조화된 사실에서 언어별 3줄 안내를 만든다 (원문은 쓰지 않는다).
 * 검사를 모두 통과하면 machine_checked, 아니면 machine_draft와 문제 목록. 생성 호출이 실패하면 예외를 던진다.
 */
export async function summarizeRecord(
  record: ProgramRecord,
  options: SummarizeOptions = {},
): Promise<SummariesByLanguage> {
  const now = options.now ?? new Date()
  const facts = summaryFacts(record, now)
  const languages = [...new Set(options.languages ?? DISPLAY_LANGUAGES)]
  const summaries = await Promise.all(languages.map((language) => summarizeLanguage(facts, language, now)))
  return Object.fromEntries(languages.map((language, index) => [language, summaries[index]])) as SummariesByLanguage
}
