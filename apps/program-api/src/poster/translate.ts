import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import sharp from 'sharp'
import { posterDir } from '../config'
import { modelName } from '../llm/gemini'
import { editImage } from '../llm/openai'
import type { EditImageInput } from '../llm/openai'
import { transcribePoster } from '../extract/transcribe'
import { isValidProgramId } from '../store'
import type { ProgramPosters } from '../types'
import { transplantQr } from './qr'
import { buildTable, LANGUAGE_NAMES } from './table'
import type { TableIssue, TableSegment } from './table'
import type { PosterLanguage } from './tokens'
import { checkHangul, checkSegments, checkTokens, readBack } from './verify'
import type { VerifyIssue } from './verify'

// 포스터 통번역 루프: 판독 → 번역표(코드 검사) → 이미지 편집(원본 디자인 유지) → QR 원본 이식
// → 다른 모델이 다시 읽어 검증 → 틀린 곳만 짚어 다시 편집 (최대 N회) → 통과 못 하면 내보내지 않음

export const POSTER_LANGUAGES: PosterLanguage[] = ['vi', 'zh']

export type PosterStatus = 'machine_checked' | 'approved' | 'failed'

export interface PosterAttempt {
  n: number
  file: string
  issues: VerifyIssue[]
  readback: string
  duration_ms: number
}

export interface PosterReport {
  program_id: string
  language: PosterLanguage
  source_file: string
  source_sha256: string
  status: PosterStatus
  created_at: string
  models: { image: string; check: string }
  table: TableSegment[]
  table_repairs: number
  table_issues: TableIssue[]
  qr: { source: string; output: string | null; matches: boolean } | null
  attempts: PosterAttempt[]
  /** 내보내는 번역본 (attempts의 n). 통과한 시도가 없으면 null */
  chosen_attempt: number | null
  /** 시연용으로 1회차 지시에 일부러 넣은 오류 (검증 루프가 잡아내는 장면을 보여 주기 위함) */
  injected_fault?: string | null
  reviewer?: string | null
  approved_at?: string | null
}

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

export const translatedDir = (dir = posterDir()) => join(dir, 'translated')
export const reportPath = (id: string, language: PosterLanguage, dir = posterDir()) => join(translatedDir(dir), `${id}.${language}.json`)
export const translatedPosterPath = (id: string, language: PosterLanguage, dir = posterDir()) => join(translatedDir(dir), `${id}.${language}.png`)

export interface SourcePoster {
  file: string
  path: string
  mimeType: string
  sha256: string
}

/**
 * 파일(경로·크기·수정 시각)이 그대로면 앞서 읽은 값을 다시 쓴다.
 * 목록·상세 요청마다 포스터 파일을 다시 읽거나 해시하지 않게 한다. 읽지 못하면 예외
 */
function memoByFile<T>(read: (path: string) => T): (path: string) => T {
  const memo = new Map<string, { size: number; mtimeMs: number; value: T }>()
  return (path) => {
    const { size, mtimeMs } = statSync(path)
    const known = memo.get(path)
    if (known && known.size === size && known.mtimeMs === mtimeMs) return known.value
    const value = read(path)
    memo.set(path, { size, mtimeMs, value })
    return value
  }
}

/** 파일 내용의 SHA-256 (같은 파일이면 다시 해시하지 않는다) */
export const fileSha256 = memoByFile((path) => createHash('sha256').update(readFileSync(path)).digest('hex'))
const parseReport = memoByFile((path) => JSON.parse(readFileSync(path, 'utf8')) as PosterReport)

/**
 * inbox/<id>/의 첫 포스터 이미지.
 * 깨진 링크, 폴더 자리에 놓인 파일, 읽기 오류는 포스터가 없는 것으로 본다 (포스터 하나 때문에 목록·상세가 멈추지 않게)
 */
export function findSourcePoster(id: string, dir = posterDir()): SourcePoster | null {
  if (!isValidProgramId(id)) return null
  const folder = join(dir, 'inbox', id)
  try {
    if (!existsSync(folder)) return null
    const file = readdirSync(folder).filter((name) => !name.startsWith('.') && !name.startsWith('_') && IMAGE_TYPES[extname(name).toLowerCase()]).sort()[0]
    if (!file) return null
    const path = join(folder, file)
    return { file, path, mimeType: IMAGE_TYPES[extname(file).toLowerCase()], sha256: fileSha256(path) }
  } catch {
    return null
  }
}

/** 번역할 원본 포스터와 그 내용. 해시는 읽은 내용으로 다시 계산한다 */
export function readSourcePoster(id: string, dir = posterDir()): (SourcePoster & { data: Buffer }) | null {
  const source = findSourcePoster(id, dir)
  if (!source) return null
  const data = readFileSync(source.path)
  return { ...source, data, sha256: createHash('sha256').update(data).digest('hex') }
}

/** 번역 검증 기록. 없거나 읽을 수 없으면 null (같은 파일이면 다시 읽지 않으므로 받은 값을 고치지 않는다) */
export function readReport(id: string, language: PosterLanguage, dir = posterDir()): PosterReport | null {
  try {
    return parseReport(reportPath(id, language, dir))
  } catch {
    return null
  }
}

export function writeReport(report: PosterReport, dir = posterDir()): void {
  mkdirSync(translatedDir(dir), { recursive: true })
  writeFileSync(reportPath(report.program_id, report.language, dir), `${JSON.stringify(report, null, 2)}\n`)
}

/** 원본 비율에 가장 가까운 출력 크기 */
export async function outputSize(image: Buffer): Promise<EditImageInput['size']> {
  const { width = 1, height = 1 } = await sharp(image).metadata()
  const ratio = width / height
  if (ratio < 0.85) return '1024x1536'
  if (ratio > 1.18) return '1536x1024'
  return '1024x1024'
}

export function editPrompt(segments: TableSegment[], language: PosterLanguage): string {
  const name = LANGUAGE_NAMES[language].en
  const keep = segments.filter((segment) => segment.action === 'keep').map((segment) => `"${segment.ko}"`)
  const lines = segments.filter((segment) => segment.action === 'translate').map((segment) => `- "${segment.ko}" -> "${segment.target}"`)
  return `Edit this Korean program poster into a ${name} version for ${name}-speaking parents.

KEEP EXACTLY: the overall layout, colors, illustrations, photos, icons, boxes, background and the QR code (do not redraw or alter it). ${keep.length ? `Keep these logo/brand texts exactly as they are: ${keep.join(', ')}.` : ''}

REPLACE every other Korean text with the ${name} text below, in the same position and visual style (same color, weight, size hierarchy, box). Write ${name} with correct ${language === 'vi' ? 'diacritics' : 'simplified Chinese characters'}. Copy every number, date, time and phone number exactly as given.

${lines.join('\n')}

No Korean text may remain except the logo/brand texts listed above. Do not add any text that is not listed.`
}

export function fixPrompt(segments: TableSegment[], language: PosterLanguage, issues: VerifyIssue[]): string {
  const name = LANGUAGE_NAMES[language].en
  return `Image 1 is a ${name} translation of the original Korean poster (image 2). An automatic proofreader found these problems in image 1:
${issues.map((issue) => `- ${issue.message}`).join('\n')}

Fix ONLY these problems in image 1. Keep everything else in image 1 identical (layout, illustrations, colors, QR code, all other texts).
The full expected text list is:
${segments.map((segment) => `- "${segment.ko}" -> "${segment.target}"`).join('\n')}`
}

/**
 * 시연용 오류 주입: 1회차 편집 지시의 전화번호(없으면 첫 날짜)를 일부러 틀리게 바꾼다.
 * 검증은 원래 번역표로 하므로 루프가 이 오류를 잡아 2회차에서 고치는지 보여 줄 수 있다
 */
export function injectFault(segments: TableSegment[]): { segments: TableSegment[]; fault: string } | null {
  const swap = (digits: string) => digits.slice(0, -2) + digits.slice(-1) + digits.slice(-2, -1)
  for (const [pattern, describe] of [
    [/0\d{1,2}-\d{3,4}-\d{4}/, (from: string, to: string) => `전화번호 ${from} → ${to}`],
    [/\d{1,2}\/\d{1,2}/, (from: string, to: string) => `날짜 ${from} → ${to}`],
  ] as const) {
    const index = segments.findIndex((segment) => segment.action === 'translate' && pattern.test(segment.target))
    if (index === -1) continue
    const from = segments[index].target.match(pattern)![0]
    const to = from.includes('/') ? from.split('/').reverse().join('/') : swap(from)
    if (to === from) continue
    const changed = segments.map((segment, i) => (i === index ? { ...segment, target: segment.target.replace(from, to) } : segment))
    return { segments: changed, fault: describe(from, to) }
  }
  return null
}

export interface TranslateOptions {
  /** 시연용 오류 주입 (injectFault) */
  demoFault?: boolean
  maxAttempts?: number
  dir?: string
  log?: (message: string) => void
  now?: () => Date
}

const tally = (issues: VerifyIssue[]) => issues.filter((issue) => issue.kind !== 'segment').length * 100 + issues.length

/** 포스터 한 장을 한 언어로 옮긴다. 결과와 시도별 이미지·검증 기록을 translated/에 남긴다 */
export async function translatePoster(id: string, language: PosterLanguage, options: TranslateOptions = {}): Promise<PosterReport> {
  const dir = options.dir ?? posterDir()
  const log = options.log ?? (() => {})
  const maxAttempts = options.maxAttempts ?? 3
  const now = options.now ?? (() => new Date())
  const source = readSourcePoster(id, dir)
  if (!source) throw new Error(`${id}: inbox/${id}/에 포스터 이미지가 없습니다.`)
  mkdirSync(translatedDir(dir), { recursive: true })

  log(`① 원본 판독 (${modelName()})`)
  const transcriptCache = join(translatedDir(dir), `${id}.ko.transcript.json`)
  let transcript: string | null = null
  if (existsSync(transcriptCache)) {
    const cached = JSON.parse(readFileSync(transcriptCache, 'utf8')) as { sha256: string; text: string }
    if (cached.sha256 === source.sha256) transcript = cached.text
  }
  if (transcript === null) {
    transcript = await transcribePoster({ file: source.file, mimeType: source.mimeType, data: source.data })
    writeFileSync(transcriptCache, `${JSON.stringify({ sha256: source.sha256, text: transcript }, null, 2)}\n`)
  }
  log(`   ${transcript.split('\n').length}줄`)

  log(`② ${LANGUAGE_NAMES[language].ko} 번역표 + 숫자·날짜·전화번호 코드 검사`)
  const table = await buildTable({ poster: source.data, mimeType: source.mimeType, transcript, language })
  log(`   문구 ${table.segments.length}개 (그대로 둘 로고 ${table.segments.filter((segment) => segment.action === 'keep').length}개), 고쳐 쓴 횟수 ${table.repairs}`)
  const report: PosterReport = {
    program_id: id,
    language,
    source_file: source.file,
    source_sha256: source.sha256,
    status: 'failed',
    created_at: now().toISOString(),
    models: { image: '', check: modelName() },
    table: table.segments,
    table_repairs: table.repairs,
    table_issues: table.issues,
    qr: null,
    attempts: [],
    chosen_attempt: null,
  }
  if (table.issues.length) {
    for (const issue of table.issues) log(`   ✗ "${issue.ko}" → "${issue.target}": ${issue.message}`)
    log('   번역표가 코드 검사를 통과하지 못해 이미지를 만들지 않습니다.')
    writeReport(report, dir)
    return report
  }

  const fault = options.demoFault ? injectFault(table.segments) : null
  if (fault) {
    report.injected_fault = fault.fault
    log(`   ⚠ 시연용 오류 주입: 1회차 편집 지시에 ${fault.fault} (검증은 원래 번역표로 한다)`)
  }

  const size = await outputSize(source.data)
  const original = { data: source.data, mimeType: source.mimeType, name: source.file }
  let previous: Buffer | null = null
  let issues: VerifyIssue[] = []
  for (let n = 1; n <= maxAttempts; n += 1) {
    const started = Date.now()
    log(`③ 이미지 편집 ${n}회차 (${n === 1 ? '원본 + 번역표' : `직전 결과 + 원본 + 지적 ${issues.length}건`})`)
    const edited = await editImage({
      images: previous ? [{ data: previous, mimeType: 'image/png', name: `attempt-${n - 1}.png` }, original] : [original],
      prompt: previous ? fixPrompt(table.segments, language, issues) : editPrompt(fault?.segments ?? table.segments, language),
      size,
    })
    report.models.image = edited.model
    let png = edited.png

    const qr = await transplantQr(source.data, png)
    if (qr) {
      png = qr.png
      report.qr = { source: qr.source, output: qr.output, matches: qr.matches }
      log(`④ QR 원본 이식 → 다시 스캔 ${qr.matches ? '✓ 같은 주소' : `✗ ${qr.output ?? '읽히지 않음'}`}`)
    }

    log(`⑤ 검증 (${modelName()}가 결과를 처음부터 다시 읽고 대조)`)
    const readback = await readBack(png)
    issues = [
      ...checkTokens(table.segments, readback, language),
      ...checkHangul(table.segments, readback),
      ...(qr && !qr.matches ? [{ kind: 'qr' as const, message: `QR 주소가 원본(${qr.source})과 다름: ${qr.output ?? '읽히지 않음'}` }] : []),
      ...await checkSegments(png, table.segments, language),
    ]
    const file = `${id}.${language}.attempt-${n}.png`
    writeFileSync(join(translatedDir(dir), file), png)
    report.attempts.push({ n, file, issues, readback, duration_ms: Date.now() - started })
    if (!issues.length) {
      log('   ✓ 모든 검사 통과')
      break
    }
    for (const issue of issues) log(`   ✗ ${issue.message}`)
    previous = png
  }

  const passed = report.attempts.find((attempt) => !attempt.issues.length)
  const best = passed ?? [...report.attempts].sort((a, b) => tally(a.issues) - tally(b.issues))[0]
  report.chosen_attempt = passed ? passed.n : null
  report.status = passed ? 'machine_checked' : 'failed'
  if (best) writeFileSync(translatedPosterPath(id, language, dir), readFileSync(join(translatedDir(dir), best.file)))
  writeReport(report, dir)
  log(passed
    ? `⑥ 통과: ${passed.n}회차 결과를 내보냅니다 (사람 검수 전 machine_checked)`
    : `⑥ ${maxAttempts}회 안에 통과하지 못해 내보내지 않습니다. 보호자 화면은 원본 포스터와 검수된 다국어 안내를 보여 줍니다.`)
  return report
}

/**
 * 보호자에게 내보낼 수 있는 번역 포스터 (승인됨, 또는 시연 설정에서 자동 검증 통과).
 * 원본을 이미 찾았으면 source로 넘겨 다시 찾지 않는다
 */
export function servablePoster(
  id: string, language: PosterLanguage, showMachineChecked: boolean, dir = posterDir(), source?: SourcePoster | null,
): { report: PosterReport; path: string } | null {
  const report = readReport(id, language, dir)
  if (!report || report.chosen_attempt === null) return null
  if (report.status !== 'approved' && !(showMachineChecked && report.status === 'machine_checked')) return null
  const original = source === undefined ? findSourcePoster(id, dir) : source
  // 원본 포스터가 바뀌면 번역본을 내린다
  if (!original || original.sha256 !== report.source_sha256) return null
  const path = translatedPosterPath(id, language, dir)
  return existsSync(path) ? { report, path } : null
}

/** 보호자 목록·상세에 붙일 포스터 정보: 원본이 있는지, 내보낼 수 있는 번역본 언어 (원본은 한 번만 찾는다) */
export function posterSummary(id: string, showMachineChecked: boolean, dir = posterDir()): ProgramPosters {
  const source = findSourcePoster(id, dir)
  if (!source) return { original: false, languages: [] }
  return { original: true, languages: POSTER_LANGUAGES.filter((language) => servablePoster(id, language, showMachineChecked, dir, source) !== null) }
}
