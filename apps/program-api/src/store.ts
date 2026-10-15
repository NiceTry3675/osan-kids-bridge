import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from './config'
import { ATTENDANCE_RULES, AUDIENCES, COMPANION_RULES, METHOD_TYPES, TARGET_TYPES } from './extract/schema'
import { PROGRAM_ID_PATTERN } from './extract/inbox'
import { INTERESTS } from './types'
import type { ProgramRecord } from './types'

// 구조화된 공고 저장소: <dataDir>/programs/<id>.json, 포스터 판독문은 <id>.transcripts.json

const TRANSCRIPTS_SUFFIX = '.transcripts.json'
/** API 경로와 겹치는 이름 */
const RESERVED_IDS = new Set(['search'])

export type Warn = (message: string) => void
const defaultWarn: Warn = (message) => console.warn(message)

export interface StoredTranscript {
  file: string
  /** 판독한 이미지 파일의 SHA-256. 같으면 다시 판독하지 않는다 */
  sha256: string
  text: string
}

export function isValidProgramId(id: unknown): id is string {
  return typeof id === 'string' && PROGRAM_ID_PATTERN.test(id) && !RESERVED_IDS.has(id)
}

function assertProgramId(id: unknown): asserts id is string {
  if (!isValidProgramId(id)) throw new Error(`프로그램 ID가 올바르지 않습니다: ${JSON.stringify(id)} (영문 소문자·숫자·하이픈, 2~64자)`)
}

export function programsDir(dir = dataDir()): string {
  return join(dir, 'programs')
}

export function recordPath(id: string, dir = dataDir()): string {
  assertProgramId(id)
  return join(programsDir(dir), `${id}.json`)
}

export function transcriptsPath(id: string, dir = dataDir()): string {
  assertProgramId(id)
  return join(programsDir(dir), `${id}${TRANSCRIPTS_SUFFIX}`)
}

// ---- 형식 검사 ----

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNullableString = (value: unknown) => value === null || isString(value)
const isNullableNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))
const isStringList = (value: unknown) => Array.isArray(value) && value.every(isString)
const isNullableStringList = (value: unknown) => value === null || isStringList(value)
const isRange = (value: unknown) => value === null
  || (Array.isArray(value) && value.length === 2 && value.every((item) => Number.isInteger(item)))
const oneOf = (values: readonly string[]) => (value: unknown) => isString(value) && values.includes(value)

const RECORD_FIELDS: Record<string, (value: unknown) => boolean> = {
  title: isString,
  institution: isString,
  category: oneOf(INTERESTS),
  audience: oneOf(AUDIENCES),
  target_type: oneOf(TARGET_TYPES),
  target_raw: isString,
  description: isString,
  grade_range: isRange,
  age_range: isRange,
  eligibility_requirements: isNullableStringList,
  guardian_companion: oneOf(COMPANION_RULES),
  sibling_companion: oneOf(COMPANION_RULES),
  korean_level_required: isNullableString,
  support_languages: isNullableStringList,
  application_languages: isNullableStringList,
  sessions: (value) => Array.isArray(value) && value.every((session) => isObject(session)
    && isString(session.id) && isNullableString(session.date) && isNullableString(session.start_time) && isNullableString(session.end_time)
    && isNullableString(session.place_name) && isNullableString(session.dong) && typeof session.online === 'boolean'
    && (session.address === undefined || isNullableString(session.address))),
  period_start: isNullableString,
  period_end: isNullableString,
  session_count: isNullableNumber,
  attendance_rule: oneOf(ATTENDANCE_RULES),
  mid_join_allowed: (value) => value === null || typeof value === 'boolean',
  cost_krw: isNullableNumber,
  cost_raw: isNullableString,
  capacity: isNullableNumber,
  application_start: isNullableString,
  application_end: isNullableString,
  application_methods: (value) => Array.isArray(value) && value.every((method) => isObject(method)
    && oneOf(METHOD_TYPES)(method.type) && isString(method.label)),
  uncertain_items: isStringList,
  evidence: (value) => Array.isArray(value) && value.every((entry) => isObject(entry)
    && isString(entry.field) && isString(entry.quote) && typeof entry.verified === 'boolean'),
  summaries_by_language: (value) => isObject(value) && Object.values(value).every((summary) => isObject(summary)
    && isStringList(summary.lines) && isString(summary.status) && isStringList(summary.issues)),
  source: (value) => isObject(value) && isNullableString(value.url) && isNullableString(value.retrieved_at)
    && isStringList(value.files) && isString(value.content_hash),
  extracted_at: isString,
  model: isString,
  warnings: isStringList,
  review: (value) => isObject(value) && oneOf(['pending', 'approved', 'rejected'])(value.status)
    && isNullableString(value.reviewed_at) && isNullableString(value.reviewer) && isNullableString(value.notes) && isNullableString(value.facts_hash),
}

/** 저장된 공고의 형식 문제 목록. 비어 있으면 ProgramRecord로 쓸 수 있다 */
export function recordProblems(value: unknown, expectedId?: string): string[] {
  if (!isObject(value)) return ['JSON 객체가 아닙니다']
  const problems: string[] = []
  if (!isValidProgramId(value.program_id)) problems.push('program_id가 올바르지 않습니다')
  else if (expectedId !== undefined && value.program_id !== expectedId) problems.push(`program_id(${value.program_id})가 파일 이름(${expectedId})과 다릅니다`)
  for (const [field, valid] of Object.entries(RECORD_FIELDS)) {
    if (!valid(value[field])) problems.push(`${field} 형식이 올바르지 않습니다`)
  }
  return problems
}

function parseRecordFile(path: string, id: string): ProgramRecord {
  let data: unknown
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${id}: JSON을 읽지 못했습니다 (${(error as Error).message})`)
  }
  const problems = recordProblems(data, id)
  if (problems.length) throw new Error(`${id}: ${problems.join(', ')}`)
  return data as ProgramRecord
}

/** 저장된 공고 파일 이름들 (판독문·임시 파일 제외) */
export function recordFileNames(dir = dataDir()): string[] {
  const folder = programsDir(dir)
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json') && !name.endsWith(TRANSCRIPTS_SUFFIX) && !name.startsWith('.'))
    .sort()
}

/** 모든 공고를 읽는다. 형식이 틀린 파일은 경고하고 건너뛴다 */
export function loadRecords(dir = dataDir(), warn: Warn = defaultWarn): ProgramRecord[] {
  const records: ProgramRecord[] = []
  for (const name of recordFileNames(dir)) {
    const id = name.slice(0, -'.json'.length)
    if (!isValidProgramId(id)) {
      warn(`공고 파일 이름을 프로그램 ID로 쓸 수 없어 건너뜁니다: ${name}`)
      continue
    }
    try {
      records.push(parseRecordFile(join(programsDir(dir), name), id))
    } catch (error) {
      warn(`공고 파일을 건너뜁니다: ${(error as Error).message}`)
    }
  }
  return records
}

/** 공고 한 건. 없으면 null, 형식이 틀리면 예외 */
export function loadRecord(id: string, dir = dataDir()): ProgramRecord | null {
  const path = recordPath(id, dir)
  return existsSync(path) ? parseRecordFile(path, id) : null
}

/** 임시 파일에 쓴 뒤 이름을 바꿔, 읽는 쪽이 반쯤 쓴 파일을 보지 않게 한다 */
function writeJsonAtomic(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
}

export function saveRecord(record: ProgramRecord, dir = dataDir()): string {
  const path = recordPath(record.program_id, dir)
  const problems = recordProblems(record, record.program_id)
  if (problems.length) throw new Error(`${record.program_id}: 저장하지 않았습니다 (${problems.join(', ')})`)
  mkdirSync(programsDir(dir), { recursive: true })
  writeJsonAtomic(path, record)
  return path
}

export function loadTranscripts(id: string, dir = dataDir(), warn: Warn = defaultWarn): StoredTranscript[] {
  const path = transcriptsPath(id, dir)
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { transcripts?: unknown }
    const list = Array.isArray(data?.transcripts) ? data.transcripts : null
    if (!list || !list.every((item) => isObject(item) && isString(item.file) && isString(item.sha256) && isString(item.text))) {
      throw new Error('형식이 올바르지 않습니다')
    }
    return list as StoredTranscript[]
  } catch (error) {
    warn(`${id}: 저장된 판독문을 쓰지 않습니다 (${(error as Error).message})`)
    return []
  }
}

export function saveTranscripts(id: string, transcripts: StoredTranscript[], dir = dataDir()): string {
  const path = transcriptsPath(id, dir)
  mkdirSync(programsDir(dir), { recursive: true })
  writeJsonAtomic(path, { program_id: id, transcripts })
  return path
}

/**
 * 파일이 바뀌었을 때만 다시 읽는 공고 목록 (서버용).
 * 요청마다 파일 이름·수정 시각·크기만 확인한다.
 */
export function recordWatcher(dir = dataDir(), warn: Warn = defaultWarn): () => ProgramRecord[] {
  let signature: string | null = null
  let records: ProgramRecord[] = []
  return () => {
    const folder = programsDir(dir)
    const current = recordFileNames(dir).map((name) => {
      try {
        const info = statSync(join(folder, name))
        return `${name}:${info.mtimeMs}:${info.size}`
      } catch {
        return `${name}:gone`
      }
    }).join('|')
    if (current !== signature) {
      records = loadRecords(dir, warn)
      signature = current
    }
    return records
  }
}
