import { dataDir } from '../config'
import { nowSource } from '../review/clock'
import { loadRecords, saveRecord } from '../store'
import { generateHeading, isHeadingIssue, needsHeading } from '../summarize/heading'
import { summaryFacts } from '../summarize/facts'
import type { DisplayLanguage, LanguageSummary, ProgramRecord } from '../types'

// npm run headings -- [ids...] [--force]
// 3줄 안내는 그대로 두고 베트남어·중국어 머리글(보호자 웹의 제목·기관·대상)만 만든다.
// 머리글이 생기기 전에 만든 요약을 보호자 웹에 내보낼 수 있게 채울 때 쓴다 (새로 ingest하면 요약과 함께 만들어진다).

const USAGE = `사용법: npm run headings -- [프로그램ID ...] [--force]
  ID를 주지 않으면 데이터 폴더의 모든 공고를 봅니다 (PROGRAM_DATA_DIR=demo 로 시연 데이터).
  머리글이 없는 베트남어·중국어 요약에만 만들고, 사람이 승인한 요약은 건너뜁니다.
  --force  머리글이 있어도, 승인된 요약이어도 다시 만듭니다 (승인된 요약은 다시 승인해야 내보냅니다)`

const messageOf = (error: unknown) => String((error as Error)?.message ?? error)

function parseArgs(argv: string[]): { ids: string[]; force: boolean } {
  const args = { ids: [] as string[], force: false }
  for (const arg of argv) {
    if (arg === '--force') args.force = true
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else if (arg.startsWith('-')) throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    else args.ids.push(arg)
  }
  return args
}

/** 머리글을 새로 만든 요약: 이전 머리글 문제는 지우고 새 문제를 더한다. 승인은 사람이 다시 한다 */
function withHeading(summary: LanguageSummary, heading: LanguageSummary['heading'], headingIssues: string[]): LanguageSummary {
  const issues = [...summary.issues.filter((issue) => !isHeadingIssue(issue)), ...headingIssues]
  const { reviewer: _reviewer, approved_at: _at, approved_hash: _hash, ...rest } = summary
  return { ...rest, heading, issues, status: issues.length ? 'machine_draft' : 'machine_checked' }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const now = nowSource()()
  const records = loadRecords().filter((record) => !args.ids.length || args.ids.includes(record.program_id))
  const missing = args.ids.filter((id) => !records.some((record) => record.program_id === id))
  if (missing.length) throw new Error(`없는 공고입니다: ${missing.join(', ')}`)
  console.log(`데이터 ${dataDir()} · 공고 ${records.length}건`)

  let made = 0
  let failed = 0
  for (const record of records) {
    let updated: ProgramRecord = record
    for (const [language, summary] of Object.entries(record.summaries_by_language) as [DisplayLanguage, LanguageSummary][]) {
      if (!needsHeading(language)) continue
      if (!args.force && (summary.heading || summary.status === 'approved')) continue
      try {
        const result = await generateHeading(summaryFacts(record, now), language, summary.lines[0] ?? null)
        const next = withHeading(summary, result.heading, result.issues)
        updated = { ...updated, summaries_by_language: { ...updated.summaries_by_language, [language]: next } }
        made += 1
        console.log(`${record.program_id} ${language}: ${next.status} · ${result.heading.title} / ${result.heading.institution} / ${result.heading.target}`)
        for (const issue of result.issues) console.log(`  ! ${issue}`)
      } catch (error) {
        failed += 1
        console.log(`${record.program_id} ${language}: 실패 ${messageOf(error)}`)
      }
    }
    if (updated !== record) saveRecord(updated)
  }
  console.log(`머리글 ${made}개 만듦${failed ? `, 실패 ${failed}개` : ''}`)
  if (failed) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(`오류: ${messageOf(error)}\n\n${USAGE}`)
  process.exitCode = 1
})
