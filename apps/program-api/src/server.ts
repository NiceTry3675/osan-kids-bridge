import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addAddenda, adminDetail, adminRow, parseAddenda, parseReviewRequest, removeAddendum } from './admin/programs'
import type { AdminContext } from './admin/programs'
import { parseImproveRequest, runImprover } from './admin/improve'
import type { Improver } from './admin/improve'
import { parsePlanRequest, runPlanner } from './admin/planner'
import type { Planner } from './admin/planner'
import { runAgent } from './agent/agent'
import type { AgentReply, AgentRequest } from './agent/agent'
import { parseAgentRequest, parseQuestion, summarizeQuestions } from './agent/requests'
import type { StoredQuestion } from './agent/requests'
import type { ToolContext } from './agent/tools'
import { corsOrigins, dataDir, posterDir, serverPort } from './config'
import { evaluateProgram, parseSearchFilters, searchPrograms, seoulToday } from './match'
import { fileSha256, findSourcePoster, POSTER_LANGUAGES, posterSummary, readReport, servablePoster, translatedDir, translatedPosterPath, writeReport } from './poster/translate'
import { posterThumbnail, snapWidth } from './poster/thumbnail'
import type { PosterLanguage } from './poster/tokens'
import { translateAddenda } from './admin/translate-addenda'
import type { AddendumTranslator } from './admin/translate-addenda'
import { nowSource } from './review/clock'
import { unverifiedFacts } from './review/critical'
import { isPublished, publicSummaries } from './review/hash'
import { approveRecord, rejectRecord, resetReview } from './review/lifecycle'
import { isValidProgramId, recordWatcher, saveRecord } from './store'
import type { Warn } from './store'
import type { ProgramListing, ProgramPosters, ProgramRecord, ProgramResponse, SearchFilters, SearchResponse } from './types'

// 보호자 웹이 쓰는 프로그램 API (명세 6장, guardian-web/src/api.ts). 게시(승인 + 사실 해시 일치)된 공고만 보인다.

export const BODY_LIMIT_BYTES = 64 * 1024

export interface ServerOptions {
  /** 데이터 폴더 (기본: config의 dataDir) */
  dataDir?: string
  /** 요청 시점 (기본: PROGRAM_API_NOW 또는 실제 시각) */
  now?: () => Date
  /** 허용할 보호자 웹 주소. '*'는 모두 허용 */
  origins?: string[]
  /** 서버 쪽 기록 (요청 본문은 남기지 않는다) */
  log?: Warn
  /** 자동 대조를 통과한 미승인 요약·번역 포스터도 내보낼지 (기본: SHOW_MACHINE_CHECKED_SUMMARIES=1) */
  showMachineChecked?: boolean
  /** 포스터 원본·번역본 폴더 (기본: config의 posterDir) */
  posterDir?: string
  /** 상담 에이전트 (시험에서 바꿔 끼운다) */
  agent?: (request: AgentRequest, context: ToolContext) => Promise<AgentReply>
  /**
   * 기관 대시보드용 관리자 API(/admin/...)를 열지 (기본: ADMIN_API=1, npm run demo는 켬).
   * 로그인이 없으므로 시연이나 기관 내부망에서만 켠다
   */
  admin?: boolean
  /** 공고 보완 도우미 (시험에서 바꿔 끼운다) */
  improver?: Improver
  /** 프로그램 편성 도우미 (시험에서 바꿔 끼운다) */
  planner?: Planner
  /** 기관 추가 안내 번역 (시험에서 바꿔 끼운다. 기본: Gemini) */
  translator?: AddendumTranslator
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly details?: string[], readonly headers: Record<string, string> = {}) {
    super(message)
  }
}

const NOT_FOUND = '프로그램을 찾을 수 없습니다.'
const NOT_PUBLISHED = '이 프로그램은 지금 게시되어 있지 않습니다.'

/** 브라우저가 가진 판(If-None-Match)이 지금 판(ETag)과 같은가 */
function notModified(request: IncomingMessage, etag: string): boolean {
  const header = request.headers['if-none-match']
  if (!header) return false
  return header.split(',').map((tag) => tag.trim().replace(/^W\//, '')).some((tag) => tag === etag || tag === '*')
}

/**
 * 포스터 이미지. 파일 내용의 해시로 ETag를 붙이고, 브라우저가 같은 판을 갖고 있으면 본문 없이 304로 답한다.
 * 승인이 풀리거나 원본이 바뀌면 바로 반영되도록 늘 다시 확인하게(no-cache) 둔다
 */
async function sendImage(request: IncomingMessage, response: ServerResponse, image: { etag: string; contentType: string; body: () => Buffer | Promise<Buffer> }): Promise<void> {
  const headers = { ETag: image.etag, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }
  if (notModified(request, image.etag)) {
    response.writeHead(304, headers)
    return void response.end()
  }
  const body = await image.body()
  response.writeHead(200, { ...headers, 'Content-Type': image.contentType, 'Content-Length': body.length })
  response.end(body)
}

/** 파일 이미지를 그대로 보낸다 (ETag: 내용 해시 + 구분) */
function sendFile(request: IncomingMessage, response: ServerResponse, path: string, contentType: string, tag: string): Promise<void> {
  return sendImage(request, response, { etag: `"${fileSha256(path).slice(0, 32)}-${tag}"`, contentType, body: () => readFileSync(path) })
}

function parseJson(text: string): unknown {
  try {
    return text.trim() ? JSON.parse(text) : undefined
  } catch {
    throw new HttpError(400, '요청 본문이 올바른 JSON이 아닙니다.')
  }
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const json = JSON.stringify(body)
  response.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(json)
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    const tooLarge = () => new HttpError(413, `요청 본문은 ${BODY_LIMIT_BYTES / 1024}KB까지 보낼 수 있습니다.`)
    if (Number(request.headers['content-length'] ?? 0) > BODY_LIMIT_BYTES) {
      request.resume()
      fail(tooLarge())
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    let failed = false
    request.on('data', (chunk: Buffer) => {
      if (failed) return
      size += chunk.length
      if (size > BODY_LIMIT_BYTES) {
        failed = true
        fail(tooLarge())
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => { if (!failed) done(Buffer.concat(chunks).toString('utf8')) })
    request.on('error', (error) => { if (!failed) fail(error) })
  })
}

function parseFilters(text: string): SearchFilters {
  let body: unknown
  try {
    body = text.trim() ? JSON.parse(text) : undefined
  } catch {
    throw new HttpError(400, '요청 본문이 올바른 JSON이 아닙니다.')
  }
  const parsed = parseSearchFilters(body)
  if (!parsed.ok) throw new HttpError(400, '검색 조건을 확인해 주세요.', parsed.errors)
  return parsed.filters
}

/**
 * 보호자에게 내보낼 공고: 언어별 요약은 사람이 승인했고 승인 뒤 사실·문구가 바뀌지 않은 것만 남긴다
 * (미검수 번역을 검수본처럼 보이지 않게, 명세 5.4·9장)
 */
function publicRecord(record: ProgramRecord, showMachineChecked: boolean): ProgramRecord {
  return { ...record, summaries_by_language: publicSummaries(record, showMachineChecked) }
}

/** 요청 주소의 경로와 검색어. 'http://a:b/x'·'//'처럼 해석할 수 없는 주소는 400 */
function requestTarget(url: string | undefined): { path: string; query: URLSearchParams } {
  try {
    const parsed = new URL(url ?? '/', 'http://localhost')
    return { path: parsed.pathname.replace(/\/+$/, '') || '/', query: parsed.searchParams }
  } catch {
    throw new HttpError(400, '요청 주소가 올바르지 않습니다.')
  }
}

/** 썸네일 너비(?w=N). 없으면 null(원본 크기), 있으면 128·256·384·512 중 같거나 큰 가장 가까운 값 */
function thumbnailWidth(query: URLSearchParams): number | null {
  const text = query.get('w')
  if (text === null) return null
  if (!/^\d{1,5}$/.test(text) || Number(text) < 1) throw new HttpError(400, '썸네일 너비(w)는 1 이상의 정수여야 합니다.')
  return snapWidth(Number(text))
}

export function createServer(options: ServerOptions = {}): Server {
  const log = options.log ?? ((message: string) => console.error(message))
  const now = options.now ?? nowSource()
  const origins = options.origins ?? corsOrigins()
  const records = recordWatcher(options.dataDir ?? dataDir(), log)
  const showMachineChecked = options.showMachineChecked ?? process.env.SHOW_MACHINE_CHECKED_SUMMARIES === '1'
  const posters = options.posterDir ?? posterDir()
  const agent = options.agent ?? runAgent
  const dataFolder = options.dataDir ?? dataDir()
  const questionsFile = join(dataFolder, 'questions', 'questions.jsonl')
  const adminEnabled = options.admin ?? process.env.ADMIN_API === '1'
  const improver = options.improver ?? runImprover
  const planner = options.planner ?? runPlanner
  const translator = options.translator ?? ((texts: string[]) => translateAddenda(texts, log))
  const adminContext = (): AdminContext => ({ now: now(), dataDir: dataFolder, posterDir: posters, showMachineChecked })
  // 포스터는 덧붙는 정보라, 읽다 실패해도 공고 목록·상세는 포스터 없이 그대로 보낸다 (공고마다 한 번만 기록)
  const posterFailures = new Set<string>()
  const posterInfo = (id: string): ProgramPosters => {
    try {
      return posterSummary(id, showMachineChecked, posters)
    } catch (error) {
      if (!posterFailures.has(id)) {
        posterFailures.add(id)
        log(`[program-api] ${id} 포스터 정보를 읽지 못해 포스터 없이 보냅니다: ${(error as Error)?.message ?? String(error)}`)
      }
      return { original: false, languages: [] }
    }
  }
  const posterLanguages = (id: string): PosterLanguage[] => posterInfo(id).languages
  /** 보호자 웹 목록·상세가 포스터 썸네일을 고르도록 공고마다 붙인다. 번역본은 내보낼 수 있는 것만(번역본이 있으면 원본도 있다) */
  const withPosters = (program: ProgramResponse): ProgramListing => ({ ...program, posters: posterInfo(program.program_id) })

  // 파일이 바뀌어 다시 읽었을 때만 게시 여부(해시)와 내보낼 요약을 다시 계산한다
  interface Cache {
    source: ProgramRecord[]
    byId: Map<string, ProgramRecord>
    /** 게시된 공고 (내보낼 요약만 남긴 것) */
    published: ProgramRecord[]
    publishedById: Map<string, ProgramRecord>
  }
  let cache: Cache | null = null
  const current = (): Cache => {
    const source = records()
    if (cache?.source !== source) {
      const published = source.filter(isPublished).map((record) => publicRecord(record, showMachineChecked))
      cache = {
        source,
        byId: new Map(source.map((record) => [record.program_id, record])),
        published,
        publishedById: new Map(published.map((record) => [record.program_id, record])),
      }
    }
    return cache
  }

  /** 게시된 공고. 없으면 404, 있지만 게시 전·반려·승인 뒤 변경이면 410 */
  const publishedRecord = (rawId: string): ProgramRecord => {
    let id: string
    try {
      id = decodeURIComponent(rawId)
    } catch {
      throw new HttpError(404, NOT_FOUND)
    }
    const { byId, publishedById } = current()
    const record = isValidProgramId(id) ? byId.get(id) : undefined
    if (!record) throw new HttpError(404, NOT_FOUND)
    const published = publishedById.get(id)
    if (!published) throw new HttpError(410, NOT_PUBLISHED)
    return published
  }

  const methodNotAllowed = (allow: string) => new HttpError(405, '지원하지 않는 요청 방식입니다.', undefined, { Allow: `${allow}, OPTIONS` })

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const { path, query } = requestTarget(request.url)
    const method = request.method ?? 'GET'

    if (path === '/health') {
      if (method !== 'GET') throw methodNotAllowed('GET')
      const { source, published } = current()
      return send(response, 200, { status: 'ok', now: now().toISOString(), records: source.length, published: published.length })
    }

    if (path === '/programs/search') {
      if (method !== 'POST') throw methodNotAllowed('POST')
      const filters = parseFilters(await readBody(request))
      const found = searchPrograms(current().published, filters, now())
      const listed: SearchResponse = { ...found, results: found.results.map(withPosters), needs_confirmation: found.needs_confirmation.map(withPosters) }
      return send(response, 200, listed)
    }

    const detail = path.match(/^\/programs\/([^/]+)$/)
    if (detail) {
      if (method !== 'GET') throw methodNotAllowed('GET')
      // 공유 링크 단독 진입: 입력하지 않은 조건은 판정하지 않는다
      const program: ProgramListing = withPosters(evaluateProgram(publishedRecord(detail[1]), null, now()))
      return send(response, 200, program)
    }

    const evaluate = path.match(/^\/programs\/([^/]+)\/evaluate$/)
    if (evaluate) {
      if (method !== 'POST') throw methodNotAllowed('POST')
      // 본문을 다 받은 뒤 공고(404·410)를 먼저 확인하고 조건(400)을 검사한다
      const text = await readBody(request)
      const record = publishedRecord(evaluate[1])
      const program: ProgramListing = withPosters(evaluateProgram(record, parseFilters(text), now()))
      return send(response, 200, program)
    }

    if (path === '/agent/chat') {
      if (method !== 'POST') throw methodNotAllowed('POST')
      const parsed = parseAgentRequest(parseJson(await readBody(request)))
      if (!parsed.ok) throw new HttpError(400, '상담 요청을 확인해 주세요.', parsed.errors)
      const { published } = current()
      if (parsed.request.program_id) publishedRecord(parsed.request.program_id)
      let reply: AgentReply
      try {
        reply = await agent(parsed.request, { records: published, now: now(), posterLanguages })
      } catch (error) {
        log(`[program-api] 상담 에이전트 실패: ${(error as Error)?.stack ?? String(error)}`)
        throw new HttpError(503, '상담 도우미가 지금 답할 수 없습니다. 잠시 후 다시 시도해 주세요.')
      }
      return send(response, 200, reply)
    }

    if (path === '/agent/questions') {
      if (method === 'POST') {
        // 보호자가 '기관에 알리기'를 눌렀을 때만 저장한다 (이름·연락처·대화 내용 없이 공고·주제·일반화한 질문·날짜만)
        const parsed = parseQuestion(parseJson(await readBody(request)))
        if (!parsed.ok) throw new HttpError(400, '질문을 확인해 주세요.', parsed.errors)
        publishedRecord(parsed.question.program_id)
        const stored: StoredQuestion = { ...parsed.question, date: seoulToday(now()) }
        mkdirSync(join(questionsFile, '..'), { recursive: true })
        appendFileSync(questionsFile, `${JSON.stringify(stored)}\n`)
        return send(response, 201, { ok: true })
      }
      if (method !== 'GET') throw methodNotAllowed('GET, POST')
      const lines = existsSync(questionsFile) ? readFileSync(questionsFile, 'utf8').split('\n').filter(Boolean) : []
      const stored = lines.flatMap((line) => { try { return [JSON.parse(line) as StoredQuestion] } catch { return [] } })
      return send(response, 200, summarizeQuestions(stored, current().byId))
    }

    const poster = path.match(/^\/posters\/([^/]+)(?:\/(original|vi|zh))?$/)
    if (poster) {
      if (method !== 'GET') throw methodNotAllowed('GET')
      const record = publishedRecord(poster[1])
      const source = findSourcePoster(record.program_id, posters)
      const variant = poster[2]
      if (!variant) {
        const languages = Object.fromEntries(POSTER_LANGUAGES.flatMap((language) => {
          const servable = servablePoster(record.program_id, language, showMachineChecked, posters, source)
          if (!servable) return []
          const { report } = servable
          const attempt = report.attempts.find((item) => item.n === report.chosen_attempt)
          return [[language, {
            status: report.status,
            attempts: report.attempts.length,
            chosen_attempt: report.chosen_attempt,
            checked: { segments: report.table.length, qr: report.qr ? report.qr.matches : null, issues: attempt?.issues.length ?? 0 },
            created_at: report.created_at,
          }]]
        }))
        return send(response, 200, { program_id: record.program_id, original: source !== null, languages })
      }
      // 썸네일(?w=N)도 원본 크기와 같은 확인(게시된 공고, 원본 유무, 내보낼 수 있는 번역본)을 거친다
      const width = thumbnailWidth(query)
      let file: { path: string; contentType: string }
      if (variant === 'original') {
        if (!source) throw new HttpError(404, '원본 포스터가 없습니다.')
        file = { path: source.path, contentType: source.mimeType }
      } else {
        const servable = servablePoster(record.program_id, variant as PosterLanguage, showMachineChecked, posters, source)
        if (!servable) throw new HttpError(404, '이 언어의 번역 포스터가 없습니다.')
        file = { path: servable.path, contentType: 'image/png' }
      }
      if (width === null) return sendFile(request, response, file.path, file.contentType, variant)
      const sha256 = fileSha256(file.path)
      return sendImage(request, response, {
        etag: `"${sha256.slice(0, 32)}-${variant}-w${width}"`,
        contentType: 'image/webp',
        body: async () => {
          try {
            return await posterThumbnail(file.path, `${variant}:${sha256}`, width)
          } catch (error) {
            log(`[program-api] ${record.program_id} ${variant} 썸네일을 만들지 못했습니다: ${(error as Error)?.message ?? String(error)}`)
            throw new HttpError(404, '포스터 이미지를 읽을 수 없습니다.')
          }
        },
      })
    }

    if (path === '/admin' || path.startsWith('/admin/')) {
      if (!adminEnabled) throw new HttpError(404, '요청한 주소를 찾을 수 없습니다.')
      return adminRoute(request, response, path, method)
    }

    throw new HttpError(404, '요청한 주소를 찾을 수 없습니다.')
  }

  /** 기관 대시보드의 관리자 API. 게시 여부와 상관없이 모든 공고를 보고, 검수·추가 안내를 저장한다 */
  async function adminRoute(request: IncomingMessage, response: ServerResponse, path: string, method: string): Promise<void> {
    // 로그인이 없으므로 다른 사이트의 페이지가 보낸 요청(미리 묻지 않는 text/plain POST 등)을 막는다:
    // 허용하지 않은 출처는 거절하고, 본문이 있는 요청은 JSON만 받는다(JSON은 브라우저가 출처를 미리 묻는다)
    const origin = request.headers.origin
    if (origin !== undefined && !origins.includes('*') && !origins.includes(origin)) throw new HttpError(403, '허용되지 않은 출처입니다.')
    if (method === 'POST' && !/^application\/json\b/i.test(String(request.headers['content-type'] ?? ''))) {
      request.resume()
      throw new HttpError(415, '요청 본문은 application/json이어야 합니다.')
    }
    const anyRecord = (rawId: string): ProgramRecord => {
      let id: string
      try {
        id = decodeURIComponent(rawId)
      } catch {
        throw new HttpError(404, NOT_FOUND)
      }
      const record = isValidProgramId(id) ? current().byId.get(id) : undefined
      if (!record) throw new HttpError(404, NOT_FOUND)
      return record
    }
    const save = (record: ProgramRecord) => {
      saveRecord(record, dataFolder)
      return send(response, 200, adminDetail(record, adminContext()))
    }

    if (path === '/admin/programs') {
      if (method !== 'GET') throw methodNotAllowed('GET')
      const context = adminContext()
      return send(response, 200, { now: context.now.toISOString(), programs: current().source.map((record) => adminRow(record, context)) })
    }

    const detail = path.match(/^\/admin\/programs\/([^/]+)$/)
    if (detail) {
      if (method !== 'GET') throw methodNotAllowed('GET')
      return send(response, 200, adminDetail(anyRecord(detail[1]), adminContext()))
    }

    const review = path.match(/^\/admin\/programs\/([^/]+)\/review$/)
    if (review) {
      if (method !== 'POST') throw methodNotAllowed('POST')
      const parsed = parseReviewRequest(parseJson(await readBody(request)))
      if (!parsed.ok) throw new HttpError(400, '검수 요청을 확인해 주세요.', parsed.errors)
      const record = anyRecord(review[1])
      const { action, reviewer, language_reviewer: languageReviewer, summaries, note, force } = parsed.request
      if (action === 'reset') return save(resetReview(record))
      if (action === 'reject') return save(rejectRecord(record, { reviewer: reviewer!, now: now(), notes: note! }))
      const missing = unverifiedFacts(record)
      if (missing.length && !force) throw new HttpError(409, '원문 근거로 확인되지 않은 핵심 사실이 있습니다. 원문과 대조한 뒤 확인을 표시하고 승인해 주세요.', missing)
      try {
        return save(approveRecord(record, { reviewer: reviewer!, now: now(), notes: note, summaries, languageReviewer }))
      } catch (error) {
        throw new HttpError(400, (error as Error).message)
      }
    }

    const addenda = path.match(/^\/admin\/programs\/([^/]+)\/addenda(?:\/([^/]+))?$/)
    if (addenda) {
      if (addenda[2]) {
        if (method !== 'DELETE') throw methodNotAllowed('DELETE')
        let addendumId: string
        try {
          addendumId = decodeURIComponent(addenda[2])
        } catch {
          throw new HttpError(404, '추가 안내를 찾을 수 없습니다.')
        }
        const next = removeAddendum(anyRecord(addenda[1]), addendumId)
        if (!next) throw new HttpError(404, '추가 안내를 찾을 수 없습니다.')
        return save(next)
      }
      if (method !== 'POST') throw methodNotAllowed('POST')
      const body = parseJson(await readBody(request))
      const parse = (record: ProgramRecord) => {
        const parsed = parseAddenda(body, evaluateProgram(record, null, now()).uncertain_items_ko)
        if (!parsed.ok) throw new HttpError(400, '추가 안내를 확인해 주세요.', parsed.errors)
        return parsed.input
      }
      const texts = parse(anyRecord(addenda[1])).items.map((item) => item.text)
      // 보호자 언어로 옮겨 함께 저장한다. 숫자·날짜·시각·전화번호가 달라진 번역이나 실패한 번역은 빼고 한국어만 저장한다
      let translations: Awaited<ReturnType<AddendumTranslator>> = []
      try {
        translations = await translator(texts)
      } catch (error) {
        log(`[program-api] 추가 안내 번역 실패 (한국어만 저장): ${(error as Error)?.message ?? String(error)}`)
      }
      // 번역하는 동안 들어온 다른 저장을 덮어쓰지 않게 공고를 다시 읽는다
      const record = anyRecord(addenda[1])
      const input = parse(record)
      const items = input.items.map((item, index) => {
        const translated = translations[index]
        return translated ? { ...item, translations: translated } : item
      })
      try {
        return save(addAddenda(record, { ...input, items }, now()))
      } catch (error) {
        throw new HttpError(400, (error as Error).message)
      }
    }

    const improve = path.match(/^\/admin\/programs\/([^/]+)\/improve$/)
    if (improve) {
      if (method !== 'POST') throw methodNotAllowed('POST')
      const text = await readBody(request)
      const record = anyRecord(improve[1])
      const parsed = parseImproveRequest(parseJson(text))
      if (!parsed.ok) throw new HttpError(400, '질문 목록을 확인해 주세요.', parsed.errors)
      try {
        return send(response, 200, await improver({ record, questions: parsed.questions, now: now() }))
      } catch (error) {
        log(`[program-api] 공고 보완 도우미 실패: ${(error as Error)?.stack ?? String(error)}`)
        throw new HttpError(503, '공고 보완 도우미가 지금 답할 수 없습니다. 잠시 후 다시 시도해 주세요.')
      }
    }

    if (path === '/admin/planning/propose') {
      if (method !== 'POST') throw methodNotAllowed('POST')
      const parsed = parsePlanRequest(parseJson(await readBody(request)))
      if (!parsed.ok) throw new HttpError(400, '질문 목록을 확인해 주세요.', parsed.errors)
      try {
        return send(response, 200, await planner({ records: current().source, questions: parsed.questions, now: now() }))
      } catch (error) {
        log(`[program-api] 편성 도우미 실패: ${(error as Error)?.stack ?? String(error)}`)
        throw new HttpError(503, '편성 도우미가 지금 답할 수 없습니다. 잠시 후 다시 시도해 주세요.')
      }
    }

    const posterApprove = path.match(/^\/admin\/posters\/([^/]+)\/(vi|zh)\/approve$/)
    if (posterApprove) {
      if (method !== 'POST') throw methodNotAllowed('POST')
      const body = parseJson(await readBody(request)) as { reviewer?: unknown } | undefined
      const reviewer = typeof body?.reviewer === 'string' ? body.reviewer.trim() : ''
      if (!reviewer || reviewer.length > 40) throw new HttpError(400, '검수자 이름(1~40자)이 필요합니다.')
      const record = anyRecord(posterApprove[1])
      const language = posterApprove[2] as PosterLanguage
      const report = readReport(record.program_id, language, posters)
      const source = findSourcePoster(record.program_id, posters)
      if (!report || report.chosen_attempt === null) throw new HttpError(409, '자동 검증을 통과한 번역 포스터가 없어 승인할 수 없습니다.')
      if (!source || source.sha256 !== report.source_sha256) throw new HttpError(409, '번역한 뒤 원본 포스터가 바뀌었습니다. 다시 번역한 뒤 승인해 주세요.')
      writeReport({ ...report, status: 'approved', reviewer, approved_at: now().toISOString() }, posters)
      return send(response, 200, adminDetail(record, adminContext()))
    }

    const posterImage = path.match(/^\/admin\/posters\/([^/]+)\/(original|vi|zh)(?:-(\d{1,2}))?$/)
    if (posterImage) {
      if (method !== 'GET') throw methodNotAllowed('GET')
      const record = anyRecord(posterImage[1])
      const [, , variant, attemptText] = posterImage
      if (variant === 'original') {
        const source = attemptText ? null : findSourcePoster(record.program_id, posters)
        if (!source) throw new HttpError(404, '원본 포스터가 없습니다.')
        return sendFile(request, response, source.path, source.mimeType, 'original')
      }
      const report = readReport(record.program_id, variant as PosterLanguage, posters)
      if (!report) throw new HttpError(404, '이 언어의 번역 포스터가 없습니다.')
      const attempt = attemptText ? report.attempts.find((item) => item.n === Number(attemptText)) : undefined
      if (attemptText && !attempt) throw new HttpError(404, '그 회차의 번역 포스터가 없습니다.')
      // 회차 파일 이름은 번역 기록에 적힌 것이지만 폴더 밖을 가리키지 못하게 이름만 쓴다
      const file = attempt ? join(translatedDir(posters), basename(attempt.file)) : translatedPosterPath(record.program_id, variant as PosterLanguage, posters)
      if (!existsSync(file)) throw new HttpError(404, '번역 포스터 파일이 없습니다.')
      return sendFile(request, response, file, 'image/png', attempt ? `${variant}-${attempt.n}` : variant)
    }

    throw new HttpError(404, '요청한 주소를 찾을 수 없습니다.')
  }

  return createHttpServer((request, response) => {
    const origin = request.headers.origin
    const allowed = typeof origin === 'string' && (origins.includes('*') || origins.includes(origin))
    if (origin !== undefined) response.setHeader('Vary', 'Origin')
    if (allowed) response.setHeader('Access-Control-Allow-Origin', origin)

    if (request.method === 'OPTIONS') {
      request.resume()
      if (origin !== undefined && !allowed) return send(response, 403, { error: '허용되지 않은 출처입니다.' })
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      })
      return response.end()
    }

    route(request, response).catch((error: unknown) => {
      if (response.headersSent) return response.destroy()
      if (error instanceof HttpError) {
        const headers = error.status === 413 ? { ...error.headers, Connection: 'close' } : error.headers
        return send(response, error.status, error.details ? { error: error.message, errors: error.details } : { error: error.message }, headers)
      }
      // 내부 오류 내용은 응답에 싣지 않는다
      log(`[program-api] ${request.method} ${request.url?.split('?')[0]} 처리 실패: ${(error as Error)?.stack ?? String(error)}`)
      send(response, 500, { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' })
    })
  })
}

/** 이 파일을 직접 실행했는가. 심볼릭 링크 경로로 실행해도 실제 경로끼리 비교한다 */
export function isEntryPoint(script: string | undefined = process.argv[1], moduleUrl: string = import.meta.url): boolean {
  if (script === undefined) return false
  try {
    return realpathSync(resolve(script)) === realpathSync(fileURLToPath(moduleUrl))
  } catch {
    return false
  }
}

/** 환경 변수 설정대로 서버를 띄운다 (npm start, npm run demo) */
export function startServer(): Server {
  const now = nowSource()
  const host = process.env.HOST ?? '127.0.0.1'
  const port = serverPort()
  const server = createServer({ now })
  server.listen(port, host, () => {
    const fixed = process.env.PROGRAM_API_NOW ? ` · 기준 시각 고정 ${now().toISOString()}` : ''
    console.log(`프로그램 API: http://${host}:${port} (데이터 ${dataDir()}${fixed})`)
  })
  const stop = () => server.close(() => process.exit(0))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  return server
}

if (isEntryPoint()) startServer()
