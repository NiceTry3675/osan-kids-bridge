import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { dataDir } from '../config'
import { extractWithTranscripts } from '../extract/extract'
import { readInboxItem } from '../extract/inbox'
import { contentHash, withDemoFlag } from '../extract/normalize'
import { combineSourceText, sourceBlocks } from '../extract/prompt'
import { transcribePoster } from '../extract/transcribe'
import { nowSource } from '../review/clock'
import { AUDIENCE_LABELS, applicationText, costText, formatTable, REVIEW_LABELS, scheduleText, summaryStatusText, TARGET_LABELS } from '../review/format'
import { effectiveReviewStatus, factsHash } from '../review/hash'
import { carriedReview, reusableSummaries } from '../review/lifecycle'
import { isValidProgramId, loadRecord, loadTranscripts, saveRecord, saveTranscripts } from '../store'
import type { StoredTranscript } from '../store'
import { summarizeRecord } from '../summarize'
import type { ProgramRecord, SummariesByLanguage } from '../types'

// npm run ingest -- [ids...] [--force] [--no-summary] [--inbox <dir>]
// inbox 폴더 → 포스터 판독(캐시) → 추출·근거 대조 → 3개 언어 요약 → 검수 상태 정리 → 저장

const USAGE = `사용법: npm run ingest -- [프로그램ID ...] [--force] [--no-summary] [--inbox <폴더>]
  ID를 주지 않으면 inbox의 모든 폴더를 처리합니다 (기본 inbox: <데이터 폴더>/inbox).
  --force       원문이 바뀌지 않았어도 다시 추출하고 요약합니다
  --no-summary  언어별 요약을 만들지 않습니다 (사실이 같으면 이전 요약을 유지)
  --inbox       다른 inbox 폴더를 씁니다`

interface IngestArgs {
  ids: string[]
  force: boolean
  summary: boolean
  inbox: string
}

interface Outcome {
  id: string
  status: 'saved' | 'synced' | 'skipped' | 'failed'
  record: ProgramRecord | null
  errors: string[]
}

function parseArgs(argv: string[]): IngestArgs {
  const args: IngestArgs = { ids: [], force: false, summary: true, inbox: join(dataDir(), 'inbox') }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--force') args.force = true
    else if (arg === '--no-summary') args.summary = false
    else if (arg === '--inbox') {
      const value = argv[++index]
      if (!value) throw new Error('--inbox 뒤에 폴더를 적어 주세요.')
      args.inbox = resolve(value)
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else if (arg.startsWith('-')) throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    else args.ids.push(arg)
  }
  return args
}

function inboxIds(inbox: string): string[] {
  return readdirSync(inbox, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort()
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const seconds = (started: number) => `${((Date.now() - started) / 1000).toFixed(1)}초`
const messageOf = (error: unknown) => String((error as Error)?.message ?? error)
const step = (text: string) => console.log(`  - ${text}`)

async function ingestOne(id: string, args: IngestArgs, now: Date): Promise<Outcome> {
  if (!isValidProgramId(id)) throw new Error('프로그램 ID는 영문 소문자·숫자·하이픈 2~64자여야 합니다.')
  const dir = join(args.inbox, id)
  if (!existsSync(dir)) throw new Error(`inbox에 폴더가 없습니다: ${dir}`)
  const item = await readInboxItem(dir)

  let previous: ProgramRecord | null = null
  try {
    previous = loadRecord(id)
  } catch (error) {
    step(`저장된 공고를 읽지 못해 새로 만듭니다 (${messageOf(error)})`)
  }

  // 같은 이미지는 다시 판독하지 않는다
  const cached = loadTranscripts(id, undefined, (message) => step(message))
  const transcripts: StoredTranscript[] = []
  let fresh = 0
  for (const image of item.images) {
    const hash = sha256(image.data)
    const hit = cached.find((transcript) => transcript.file === image.file && transcript.sha256 === hash)
    if (hit) {
      transcripts.push(hit)
      continue
    }
    const started = Date.now()
    transcripts.push({ file: image.file, sha256: hash, text: await transcribePoster(image) })
    fresh += 1
    step(`포스터 판독: ${image.file} (${seconds(started)})`)
  }
  step(`원문: 글 ${item.texts.length}개, 포스터 ${item.images.length}장${item.images.length ? ` (새로 판독 ${fresh}, 저장된 판독문 ${item.images.length - fresh})` : ''}`)

  const sourceHash = contentHash(combineSourceText(sourceBlocks(item.texts, transcripts)))
  if (previous?.source.content_hash === sourceHash && !args.force) {
    if (fresh) saveTranscripts(id, transcripts)
    // 원문은 그대로여도 source.json의 시연 표시는 바뀔 수 있다 (승인에는 영향이 없다)
    const synced = withDemoFlag(previous, item.source.demo)
    if (synced !== previous) {
      saveRecord(synced)
      step(`시연 표시를 source.json에 맞췄습니다 (demo: ${item.source.demo})`)
    }
    console.log('  = 원문이 바뀌지 않아 건너뜁니다 (다시 처리하려면 --force)')
    return { id, status: synced === previous ? 'skipped' : 'synced', record: synced, errors: [] }
  }

  let started = Date.now()
  const extracted = await extractWithTranscripts(item, transcripts.map(({ file, text }) => ({ file, text })), now)
  step(`추출·근거 대조 완료: 회차 ${extracted.sessions.length}개, 근거 ${extracted.evidence.length}개, 경고 ${extracted.warnings.length}개 (${seconds(started)})`)

  const errors: string[] = []
  const sameFacts = previous !== null && factsHash(previous) === factsHash(extracted)
  let summaries: SummariesByLanguage = sameFacts ? previous!.summaries_by_language : {}
  const reusable = args.force ? null : reusableSummaries(previous, extracted)
  if (!args.summary) {
    step(sameFacts ? '요약: 사실이 같아 이전 요약을 유지합니다 (--no-summary)' : '요약: 만들지 않았습니다 (--no-summary)')
  } else if (reusable) {
    summaries = reusable
    step('요약: 사실이 같아 이전 요약을 그대로 씁니다')
  } else {
    started = Date.now()
    try {
      summaries = await summarizeRecord(extracted, { now })
      step(`요약 완료: ${summaryStatusText({ ...extracted, summaries_by_language: summaries })} (${seconds(started)})`)
    } catch (error) {
      errors.push(`요약 실패: ${messageOf(error)}`)
      step(`요약 실패 (${messageOf(error)}). 추출 결과는 ${sameFacts ? '이전 요약과 함께' : '요약 없이'} 저장합니다`)
    }
  }

  const review = carriedReview(previous, extracted)
  // 기관 추가 안내는 원문에서 오지 않으므로 다시 추출해도 그대로 둔다 (원문이 바뀌었으면 담당자가 검수 화면에서 다시 본다)
  const addenda = previous?.addenda?.length ? { addenda: previous.addenda } : {}
  const record: ProgramRecord = { ...extracted, summaries_by_language: summaries, review, ...addenda }
  if (addenda.addenda) step(`기관 추가 안내 ${addenda.addenda.length}건을 그대로 둡니다`)
  if (previous?.review.status === 'approved') {
    step(review.status === 'approved' ? '검수: 사실이 같아 이전 승인을 유지합니다' : '검수: 사실이 바뀌어 검수 대기로 되돌렸습니다')
  } else {
    step(`검수: ${REVIEW_LABELS[effectiveReviewStatus(record)]}`)
  }

  saveRecord(record)
  saveTranscripts(id, transcripts)
  console.log(`  ✓ 저장: programs/${id}.json`)
  return { id, status: errors.length ? 'failed' : 'saved', record, errors }
}

function printTable(outcomes: Outcome[]): void {
  const STATUS = { saved: '저장', synced: '시연 표시만 바꿈', skipped: '변경 없음', failed: '오류' }
  const rows = outcomes.map(({ id, status, record }) => record
    ? [
        id,
        `${AUDIENCE_LABELS[record.audience]} (${TARGET_LABELS[record.target_type]})`,
        scheduleText(record),
        costText(record),
        applicationText(record),
        String(record.warnings.length),
        summaryStatusText(record),
        STATUS[status],
      ]
    : [id, '-', '-', '-', '-', '-', '-', STATUS[status]])
  console.log(`\n${formatTable(['ID', '대상', '회차·기간', '비용', '신청 기간', '경고', '요약', '처리'], rows)}`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.inbox)) throw new Error(`inbox 폴더가 없습니다: ${args.inbox}`)
  const ids = args.ids.length ? [...new Set(args.ids)] : inboxIds(args.inbox)
  if (!ids.length) {
    console.log('처리할 inbox 폴더가 없습니다.')
    return
  }
  const now = nowSource()()
  console.log(`공고 ${ids.length}건 처리 (기준 시각 ${now.toISOString()}${args.force ? ', --force' : ''}${args.summary ? '' : ', --no-summary'})`)

  const outcomes: Outcome[] = []
  for (const [index, id] of ids.entries()) {
    console.log(`\n[${index + 1}/${ids.length}] ${id}`)
    try {
      outcomes.push(await ingestOne(id, args, now))
    } catch (error) {
      console.log(`  ✗ 실패: ${messageOf(error)}`)
      outcomes.push({ id, status: 'failed', record: null, errors: [messageOf(error)] })
    }
  }

  printTable(outcomes)
  const failed = outcomes.filter((outcome) => outcome.errors.length)
  if (failed.length) {
    console.log(`\n오류 ${failed.length}건:`)
    for (const outcome of failed) console.log(`  - ${outcome.id}: ${outcome.errors.join(' / ')}`)
    process.exitCode = 1
  }
  console.log('\n검수: npm run review -- show <ID> 로 근거를 확인한 뒤 approve 하세요.')
}

main().catch((error: unknown) => {
  console.error(`오류: ${messageOf(error)}\n\n${USAGE}`)
  process.exitCode = 1
})
