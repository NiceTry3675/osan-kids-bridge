import { realpathSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { corsOrigins, dataDir, serverPort } from './config'
import { evaluateProgram, parseSearchFilters, searchPrograms } from './match'
import { nowSource } from './review/clock'
import { isPublished, publicSummaries } from './review/hash'
import { isValidProgramId, recordWatcher } from './store'
import type { Warn } from './store'
import type { ProgramRecord, SearchFilters } from './types'

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
  /** 자동 대조를 통과한 미승인 요약도 내보낼지 (기본: SHOW_MACHINE_CHECKED_SUMMARIES=1) */
  showMachineChecked?: boolean
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly details?: string[], readonly headers: Record<string, string> = {}) {
    super(message)
  }
}

const NOT_FOUND = '프로그램을 찾을 수 없습니다.'
const NOT_PUBLISHED = '이 프로그램은 지금 게시되어 있지 않습니다.'

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

/** 요청 주소의 경로. 'http://a:b/x'·'//'처럼 해석할 수 없는 주소는 400 */
function requestPath(url: string | undefined): string {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/'
  } catch {
    throw new HttpError(400, '요청 주소가 올바르지 않습니다.')
  }
}

export function createServer(options: ServerOptions = {}): Server {
  const log = options.log ?? ((message: string) => console.error(message))
  const now = options.now ?? nowSource()
  const origins = options.origins ?? corsOrigins()
  const records = recordWatcher(options.dataDir ?? dataDir(), log)
  const showMachineChecked = options.showMachineChecked ?? process.env.SHOW_MACHINE_CHECKED_SUMMARIES === '1'

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
    const path = requestPath(request.url)
    const method = request.method ?? 'GET'

    if (path === '/health') {
      if (method !== 'GET') throw methodNotAllowed('GET')
      const { source, published } = current()
      return send(response, 200, { status: 'ok', now: now().toISOString(), records: source.length, published: published.length })
    }

    if (path === '/programs/search') {
      if (method !== 'POST') throw methodNotAllowed('POST')
      const filters = parseFilters(await readBody(request))
      return send(response, 200, searchPrograms(current().published, filters, now()))
    }

    const detail = path.match(/^\/programs\/([^/]+)$/)
    if (detail) {
      if (method !== 'GET') throw methodNotAllowed('GET')
      // 공유 링크 단독 진입: 입력하지 않은 조건은 판정하지 않는다
      return send(response, 200, evaluateProgram(publishedRecord(detail[1]), null, now()))
    }

    const evaluate = path.match(/^\/programs\/([^/]+)\/evaluate$/)
    if (evaluate) {
      if (method !== 'POST') throw methodNotAllowed('POST')
      // 본문을 다 받은 뒤 공고(404·410)를 먼저 확인하고 조건(400)을 검사한다
      const text = await readBody(request)
      const record = publishedRecord(evaluate[1])
      return send(response, 200, evaluateProgram(record, parseFilters(text), now()))
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
