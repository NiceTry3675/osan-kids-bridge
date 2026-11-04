import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders, Server } from 'node:http'
import { connect } from 'node:net'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approveRecord, rejectRecord } from '../src/review/lifecycle'
import { createServer, isEntryPoint } from '../src/server'
import type { ServerOptions } from '../src/server'
import { saveRecord } from '../src/store'
import type { LanguageSummary, ProgramListing, ProgramRecord, ProgramResponse, ProgramSession } from '../src/types'

// 2026-10-15(목) 12:00, Asia/Seoul
const NOW = new Date('2026-10-15T03:00:00Z')
const WEB = 'http://127.0.0.1:5173'
const SAT = { day_of_week: 'sat', start_time: '10:05', end_time: '12:10' }

function session(id: string, date: string, start: string | null, end: string | null): ProgramSession {
  return { id: `${id}-s1`, date, start_time: start, end_time: end, place_name: '오산시가족센터', dong: '남촌동', online: false }
}

/** record(id)의 사실과 맞는 쉬운 한국어 요약 */
const koLines = (id: string) => [
  `'${id} 프로그램'은 오산시가족센터에서 해요. 초등 1~3학년이 대상이에요.`,
  '10월 17일(토) 10:10~12:00에 해요. 장소는 오산시가족센터예요.',
  '무료예요. 10월 1일(목) 09:00부터 10월 20일(화) 18:00까지 전화(031-000-0000)로 신청해요.',
]

function summary(status: LanguageSummary['status'], lines = ['한 줄', '두 줄', '세 줄']): LanguageSummary {
  return { lines, status, generated_at: '2026-10-15T00:00:00.000Z', issues: [] }
}

function record(id: string, overrides: Partial<ProgramRecord> = {}): ProgramRecord {
  return {
    program_id: id,
    title: `${id} 프로그램`,
    institution: '오산시가족센터',
    category: 'experience_culture',
    audience: 'child',
    target_type: 'all',
    target_raw: '초등 1~3학년',
    description: '시험용 가상 공고',
    grade_range: [1, 3],
    age_range: null,
    eligibility_requirements: [],
    guardian_companion: 'unknown',
    sibling_companion: 'unknown',
    korean_level_required: null,
    support_languages: null,
    application_languages: null,
    sessions: [session(id, '2026-10-17', '10:10', '12:00')],
    period_start: null,
    period_end: null,
    session_count: null,
    attendance_rule: 'choose_one',
    mid_join_allowed: null,
    cost_krw: 0,
    cost_raw: '무료',
    capacity: null,
    application_start: '2026-10-01T09:00',
    application_end: '2026-10-20T18:00',
    application_methods: [{ type: 'phone', label: '전화 신청', phone: '031-000-0000' }],
    uncertain_items: [],
    evidence: [],
    summaries_by_language: {},
    source: { url: `https://example.com/${id}`, retrieved_at: '2026-10-14', files: ['page.txt'], content_hash: id },
    extracted_at: '2026-10-14T00:00:00Z',
    model: 'test',
    warnings: [],
    review: { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null },
    ...overrides,
  }
}

const approve = (item: ProgramRecord) => approveRecord(item, { reviewer: '검수자', now: NOW })

/** 쉬운 한국어 요약을 사람이 승인한 공고. 베트남어는 자동 대조만 통과, 중국어는 상태만 approved로 적은 것 */
const withSummaries = (id: string, overrides: Partial<ProgramRecord> = {}) => approveRecord(record(id, {
  summaries_by_language: { 'ko-easy': summary('machine_checked', koLines(id)), vi: summary('machine_checked'), zh: summary('machine_checked') },
  evidence: [{ field: 'cost', quote: '참가비 무료', verified: true }, { field: 'capacity', quote: '정원 20명', verified: false }],
  ...overrides,
}), { reviewer: '검수자', now: NOW, summaries: ['ko-easy'] })

/** 시험용 공고: 게시 4건(그중 마감 1·보호자 대상 1), 학년 불일치 1, 대기·stale·반려 각 1 */
function fixtures(): ProgramRecord[] {
  return [
    (() => {
      const item = withSummaries('pub-saturday')
      // 승인 해시 없이 상태만 approved로 적은 요약은 내보내지 않는다
      return { ...item, summaries_by_language: { ...item.summaries_by_language, zh: summary('approved') } }
    })(),
    approve(record('pub-untimed', {
      target_type: 'multicultural_family', target_raw: '다문화가족 초등 1~6학년', grade_range: [1, 6], eligibility_requirements: ['다문화가족'],
      sessions: [session('pub-untimed', '2026-10-24', null, null)], attendance_rule: 'all_sessions', cost_krw: null, cost_raw: null,
    })),
    approve(record('pub-middle', { grade_range: [7, 9], target_raw: '중학생', sessions: [session('pub-middle', '2026-10-18', '14:00', '16:00')] })),
    approve(record('closed-app', { application_start: '2026-09-20T09:00', application_end: '2026-10-10T18:00' })),
    approve(record('parent-talk', { audience: 'parent_only', target_type: 'parent_only', target_raw: '학부모', grade_range: null })),
    record('pending-draft'),
    { ...approve(record('stale-edit')), cost_krw: 30000, cost_raw: '30,000원' },
    rejectRecord(record('rejected-one'), { reviewer: '검수자', now: NOW, notes: '날짜가 원문과 다름' }),
  ]
}

interface Reply {
  status: number
  headers: IncomingHttpHeaders
  text: string
  body: any
}

function call(port: number, method: string, path: string, options: { body?: string; headers?: Record<string, string>; chunks?: string[] } = {}): Promise<Reply> {
  return new Promise((done, fail) => {
    const headers = { ...options.headers }
    if (options.body !== undefined) Object.assign(headers, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(options.body)) })
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        done({ status: res.statusCode ?? 0, headers: res.headers, text, body: text ? JSON.parse(text) : null })
      })
    })
    req.on('error', fail)
    if (options.body !== undefined) req.write(options.body)
    for (const chunk of options.chunks ?? []) req.write(chunk)
    req.end()
  })
}

async function start(options: ServerOptions): Promise<{ server: Server; port: number }> {
  const server = createServer(options)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return { server, port: (server.address() as AddressInfo).port }
}

const ids = (programs: ProgramResponse[]) => programs.map((program) => program.program_id)

describe('프로그램 API', () => {
  let dir = ''
  let server: Server
  let port = 0
  const logs: string[] = []
  const get = (path: string, headers?: Record<string, string>) => call(port, 'GET', path, { headers })
  const post = (path: string, body: unknown, headers?: Record<string, string>) => call(port, 'POST', path, { body: typeof body === 'string' ? body : JSON.stringify(body), headers })

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'program-api-'))
    for (const item of fixtures()) saveRecord(item, dir)
    writeFileSync(join(dir, 'programs', 'broken.json'), '{ "program_id": ')
    ;({ server, port } = await start({ dataDir: dir, now: () => NOW, origins: [WEB], log: (message) => logs.push(message) }))
  })

  afterAll(async () => {
    await new Promise((done) => server.close(done))
    rmSync(dir, { recursive: true, force: true })
  })

  it('GET /health는 저장된 공고 수와 게시 수를 알려 주고, 깨진 파일은 경고하고 건너뛴다', async () => {
    const reply = await get('/health')
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual({ status: 'ok', now: NOW.toISOString(), records: 8, published: 5 })
    expect(logs.some((line) => line.includes('broken'))).toBe(true)
  })

  describe('POST /programs/search', () => {
    it('빈 조건 {}: 게시된 자녀 프로그램 중 신청 마감·보호자 대상을 빼고 다음 회차 순으로 보여 준다', async () => {
      const reply = await post('/programs/search', {})
      expect(reply.status).toBe(200)
      expect(ids(reply.body.results)).toEqual(['pub-saturday', 'pub-middle', 'pub-untimed'])
      expect(reply.body.needs_confirmation).toEqual([])
      expect(reply.body.results[0].time_match_status).toBe('not_applied')
    })

    it('본문이 없어도 빈 조건으로 본다', async () => {
      const reply = await call(port, 'POST', '/programs/search')
      expect(reply.status).toBe(200)
      expect(ids(reply.body.results)).toEqual(['pub-saturday', 'pub-middle', 'pub-untimed'])
    })

    it('학년·시간 조건: 불일치는 빼고, 시간 미상은 needs_confirmation으로 보낸다', async () => {
      const reply = await post('/programs/search', { child_grade: 2, available_windows: [SAT], display_language: 'vi' })
      expect(reply.status).toBe(200)
      expect(ids(reply.body.results)).toEqual(['pub-saturday'])
      expect(reply.body.results[0]).toMatchObject({ age_grade_match_status: 'matched', time_match_status: 'matched', matched_sessions: ['pub-saturday-s1'] })
      expect(ids(reply.body.needs_confirmation)).toEqual(['pub-untimed'])
      expect(reply.body.needs_confirmation[0]).toMatchObject({ time_match_status: 'unknown', eligibility_status: 'unknown' })
    })

    it('무료만 보기는 비용 미상을 뺀다', async () => {
      const reply = await post('/programs/search', { free_only: true })
      expect(ids(reply.body.results)).toEqual(['pub-saturday', 'pub-middle'])
    })

    it('잘못된 조건은 400과 한국어 이유를 돌려준다', async () => {
      const grade = await post('/programs/search', { child_grade: 0 })
      expect(grade.status).toBe(400)
      expect(grade.body.error).toBe('검색 조건을 확인해 주세요.')
      expect(grade.body.errors[0]).toMatch(/학년/)
      const window = await post('/programs/search', { available_windows: [{ day_of_week: 'sat', start_time: '12:00', end_time: '10:00' }] })
      expect(window.status).toBe(400)
      expect(window.body.errors[0]).toMatch(/종료 시각/)
      const json = await post('/programs/search', '{"child_grade": 2')
      expect(json.status).toBe(400)
      expect(json.body.error).toMatch(/JSON/)
      const array = await post('/programs/search', [])
      expect(array.status).toBe(400)
      expect(array.body.errors).toEqual(['요청 본문은 JSON 객체여야 합니다.'])
    })

    it('64KB를 넘는 본문은 413으로 거절한다', async () => {
      const big = await post('/programs/search', { dong: 'x'.repeat(70 * 1024) })
      expect(big.status).toBe(413)
      expect(big.body.error).toMatch(/64KB/)
      const chunked = await call(port, 'POST', '/programs/search', { chunks: ['{"dong":"', 'x'.repeat(40 * 1024), 'x'.repeat(40 * 1024), '"}'] })
      expect(chunked.status).toBe(413)
      const ok = await post('/programs/search', { dong: 'x'.repeat(60 * 1024) })
      expect(ok.status).toBe(200)
    })
  })

  describe('상세', () => {
    it('GET /programs/:id는 조건 없이 판정한다 (공유 링크)', async () => {
      const reply = await get('/programs/pub-saturday')
      expect(reply.status).toBe(200)
      expect(reply.body).toMatchObject({
        program_id: 'pub-saturday',
        age_grade_match_status: 'not_applied',
        time_match_status: 'not_applied',
        eligibility_status: 'matched',
        matched_sessions: [],
        matched_reasons: [],
        application_status: 'open',
        verified_at: '2026-10-15',
        source_url: 'https://example.com/pub-saturday',
      })
      expect(reply.body.next_session.id).toBe('pub-saturday-s1')
    })

    it('POST /programs/:id/evaluate는 검색과 같은 조건으로 판정한다', async () => {
      const reply = await post('/programs/pub-saturday/evaluate', { child_grade: 2, available_windows: [SAT] })
      expect(reply.status).toBe(200)
      expect(reply.body).toMatchObject({ age_grade_match_status: 'matched', time_match_status: 'matched', matched_sessions: ['pub-saturday-s1'] })
      expect(reply.body.matched_reasons).toHaveLength(2)
      const search = await post('/programs/search', { child_grade: 2, available_windows: [SAT] })
      expect(reply.body).toEqual(search.body.results[0])

      const mismatch = await post('/programs/pub-saturday/evaluate', { child_grade: 5, available_windows: [{ day_of_week: 'sat', start_time: '10:00', end_time: '11:00' }] })
      expect(mismatch.body).toMatchObject({ age_grade_match_status: 'not_matched', time_match_status: 'not_matched', matched_sessions: [] })
      const empty = await post('/programs/pub-saturday/evaluate', {})
      expect(empty.body).toEqual((await get('/programs/pub-saturday')).body)
    })

    it('사람이 승인한 언어별 요약만 내보낸다 (상태만 approved로 적은 요약·승인 기록은 내보내지 않는다)', async () => {
      const reply = await get('/programs/pub-saturday')
      expect(Object.keys(reply.body.summaries_by_language)).toEqual(['ko-easy'])
      expect(reply.body.summaries_by_language['ko-easy']).toEqual({
        title: 'pub-saturday 프로그램', institution: reply.body.institution, target: reply.body.target_raw,
        description: koLines('pub-saturday').join(' '), lines: koLines('pub-saturday'), status: 'approved', reviewed_at: NOW.toISOString(),
      })
      const search = await post('/programs/search', {})
      const listed = search.body.results.find((program: ProgramResponse) => program.program_id === 'pub-saturday')
      expect(Object.keys(listed.summaries_by_language)).toEqual(['ko-easy'])
    })

    it('원문에서 찾은 근거 인용을 함께 내보낸다', async () => {
      const reply = await get('/programs/pub-saturday')
      expect(reply.body.source_evidence).toEqual([{ field: 'cost', quote: '참가비 무료' }])
      expect(reply.body).not.toHaveProperty('evidence')
    })

    it('신청 마감·보호자 대상 공고도 공유 링크로는 200과 상태를 돌려준다', async () => {
      const closed = await get('/programs/closed-app')
      expect(closed.status).toBe(200)
      expect(closed.body.application_status).toBe('closed')
      const parent = await get('/programs/parent-talk')
      expect(parent.status).toBe(200)
      expect(parent.body.audience).toBe('parent_only')
    })

    it('없는 공고는 404, 게시되지 않은 공고(대기·반려·승인 뒤 변경)는 410', async () => {
      expect((await get('/programs/no-such-program')).status).toBe(404)
      for (const id of ['pending-draft', 'rejected-one', 'stale-edit']) {
        const reply = await get(`/programs/${id}`)
        expect(reply.status).toBe(410)
        expect(reply.body).toEqual({ error: '이 프로그램은 지금 게시되어 있지 않습니다.' })
      }
      expect((await post('/programs/pending-draft/evaluate', {})).status).toBe(410)
      expect((await post('/programs/no-such-program/evaluate', {})).status).toBe(404)
      expect((await post('/programs/pub-saturday/evaluate', { child_age: -1 })).status).toBe(400)
    })

    it('ID 형식이 아니면 404 (경로 이동 시도 포함)', async () => {
      for (const path of ['/programs/..%2F..%2Fetc%2Fpasswd', '/programs/UPPER', '/programs/%E0%A4%A', '/programs/broken']) {
        expect((await get(path)).status).toBe(404)
      }
    })
  })

  describe('경로·방식·CORS', () => {
    it('해석할 수 없는 요청 주소는 400 (내부 오류로 기록하지 않는다)', async () => {
      const raw = (target: string) => new Promise<string>((done, fail) => {
        const socket = connect(port, '127.0.0.1', () => socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`))
        let text = ''
        socket.on('data', (chunk) => { text += chunk.toString('utf8') })
        socket.on('end', () => done(text))
        socket.on('error', fail)
      })
      const before = logs.length
      for (const target of ['http://a:b/health', '//']) {
        const text = await raw(target)
        expect(text).toMatch(/^HTTP\/1\.1 400 /)
        expect(text).toContain('요청 주소가 올바르지 않습니다.')
      }
      expect(logs.slice(before).join('\n')).not.toMatch(/처리 실패|Invalid URL/)
    })

    it('맞지 않는 요청 방식은 405, 없는 경로는 404', async () => {
      const search = await get('/programs/search')
      expect(search.status).toBe(405)
      expect(search.headers.allow).toBe('POST, OPTIONS')
      expect((await post('/programs/pub-saturday', {})).status).toBe(405)
      expect((await call(port, 'DELETE', '/programs/pub-saturday')).status).toBe(405)
      expect((await get('/programs/pub-saturday/evaluate')).status).toBe(405)
      expect((await get('/nope')).status).toBe(404)
    })

    it('허용한 출처의 사전 요청(OPTIONS)에 응답한다', async () => {
      const reply = await call(port, 'OPTIONS', '/programs/search', { headers: { Origin: WEB, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
      expect(reply.status).toBe(204)
      expect(reply.headers['access-control-allow-origin']).toBe(WEB)
      expect(reply.headers['access-control-allow-methods']).toContain('POST')
      expect(reply.headers['access-control-allow-headers']).toBe('Content-Type')
      expect(reply.headers.vary).toBe('Origin')
    })

    it('허용하지 않은 출처는 CORS 헤더를 주지 않는다', async () => {
      const preflight = await call(port, 'OPTIONS', '/programs/search', { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } })
      expect(preflight.status).toBe(403)
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined()
      const plain = await post('/programs/search', {}, { Origin: 'https://evil.example' })
      expect(plain.headers['access-control-allow-origin']).toBeUndefined()
      const allowed = await post('/programs/search', {}, { Origin: WEB })
      expect(allowed.headers['access-control-allow-origin']).toBe(WEB)
    })

    it('응답은 JSON이고 캐시하지 않는다', async () => {
      const reply = await get('/programs/pub-saturday')
      expect(reply.headers['content-type']).toBe('application/json; charset=utf-8')
      expect(reply.headers['cache-control']).toBe('no-store')
    })
  })
})

describe('프로그램 API: 목록·상세의 포스터 정보', () => {
  let dir = ''
  let posters = ''
  let server: Server
  let port = 0
  const logs: string[] = []
  let image = Buffer.alloc(0)

  /** 이미지 응답은 JSON이 아니므로 본문을 그대로 받는다 */
  const fetchImage = async (path: string, headers: Record<string, string> = {}) => {
    const reply = await fetch(`http://127.0.0.1:${port}${path}`, { headers })
    return { status: reply.status, type: reply.headers.get('content-type'), etag: reply.headers.get('etag'), body: Buffer.from(await reply.arrayBuffer()) }
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'program-api-posters-'))
    const data = join(dir, 'data')
    posters = join(dir, 'posters')
    for (const id of ['with-poster', 'original-only', 'stale-poster', 'no-poster', 'broken-link', 'not-a-folder', 'changing']) saveRecord(approve(record(id)), data)
    image = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#f2c14e' } }).png().toBuffer()
    const report = (id: string, language: 'vi' | 'zh', status: string, sha = createHash('sha256').update(image).digest('hex')) => {
      writeFileSync(join(posters, 'translated', `${id}.${language}.png`), image)
      writeFileSync(join(posters, 'translated', `${id}.${language}.json`), JSON.stringify({ program_id: id, language, source_sha256: sha, status, chosen_attempt: 1, attempts: [], table: [] }))
    }
    mkdirSync(join(posters, 'translated'), { recursive: true })
    for (const id of ['with-poster', 'original-only', 'stale-poster', 'broken-link', 'changing']) mkdirSync(join(posters, 'inbox', id), { recursive: true })
    for (const id of ['with-poster', 'original-only', 'stale-poster', 'changing']) writeFileSync(join(posters, 'inbox', id, 'poster.png'), image)
    // 깨진 포스터: 가리키는 파일이 없는 링크, 폴더 자리에 놓인 파일
    symlinkSync(join(dir, 'missing.png'), join(posters, 'inbox', 'broken-link', 'poster.png'))
    writeFileSync(join(posters, 'inbox', 'not-a-folder'), 'not a folder')
    // 승인한 베트남어만 내보내고, 담당자 확인 전 중국어·원본이 바뀐 뒤의 번역본은 내보내지 않는다
    report('with-poster', 'vi', 'approved')
    report('with-poster', 'zh', 'machine_checked')
    report('stale-poster', 'vi', 'approved', 'old-source-hash')
    report('broken-link', 'vi', 'approved')
    report('changing', 'vi', 'approved')
    ;({ server, port } = await start({ dataDir: data, posterDir: posters, now: () => NOW, origins: [], log: (message) => logs.push(message), showMachineChecked: false }))
  })

  afterAll(async () => {
    await new Promise((done) => server.close(done))
    rmSync(dir, { recursive: true, force: true })
  })

  it('검색 결과의 공고마다 원본 유무와 내보낼 수 있는 번역본 언어를 붙인다', async () => {
    const reply = await call(port, 'POST', '/programs/search', { body: '{}' })
    const byId = Object.fromEntries(reply.body.results.map((program: ProgramListing) => [program.program_id, program.posters]))
    expect(byId).toEqual({
      'with-poster': { original: true, languages: ['vi'] },
      'original-only': { original: true, languages: [] },
      'stale-poster': { original: true, languages: [] },
      'no-poster': { original: false, languages: [] },
      'broken-link': { original: false, languages: [] },
      'not-a-folder': { original: false, languages: [] },
      changing: { original: true, languages: ['vi'] },
    })
  })

  it('상세(GET)와 조건 판정(POST evaluate)에도 같은 포스터 정보를 붙인다', async () => {
    const detail = await call(port, 'GET', '/programs/with-poster')
    expect(detail.body.posters).toEqual({ original: true, languages: ['vi'] })
    const evaluated = await call(port, 'POST', '/programs/with-poster/evaluate', { body: JSON.stringify({ child_grade: 2 }) })
    expect(evaluated.body.posters).toEqual({ original: true, languages: ['vi'] })
    expect((await call(port, 'GET', '/programs/no-poster')).body.posters).toEqual({ original: false, languages: [] })
  })

  it('포스터 파일이 깨져도(끊긴 링크, 폴더 자리의 파일) 목록·상세는 200이고 포스터 없이 보낸다', async () => {
    const before = logs.length
    for (const id of ['broken-link', 'not-a-folder']) {
      const detail = await call(port, 'GET', `/programs/${id}`)
      expect([id, detail.status, detail.body.posters]).toEqual([id, 200, { original: false, languages: [] }])
      const evaluated = await call(port, 'POST', `/programs/${id}/evaluate`, { body: '{}' })
      expect([id, evaluated.status]).toEqual([id, 200])
      expect((await fetchImage(`/posters/${id}/original`)).status).toBe(404)
      // 원본을 읽지 못하면 번역본도 내보내지 않는다
      expect((await fetchImage(`/posters/${id}/vi?w=256`)).status).toBe(404)
    }
    const search = await call(port, 'POST', '/programs/search', { body: '{}' })
    expect(search.status).toBe(200)
    expect(search.body.results.find((program: ProgramListing) => program.program_id === 'with-poster').posters).toEqual({ original: true, languages: ['vi'] })
    expect(logs.slice(before).join('\n')).not.toMatch(/처리 실패/)
  })

  it('원본 크기 이미지에 내용 해시로 ETag를 붙이고, 같은 판이면 본문 없이 304', async () => {
    const full = await fetchImage('/posters/with-poster/original')
    expect([full.status, full.type]).toEqual([200, 'image/png'])
    expect(full.body.equals(image)).toBe(true)
    expect(full.etag).toMatch(/^"[0-9a-f]{32}-original"$/)
    const again = await fetchImage('/posters/with-poster/original', { 'If-None-Match': full.etag! })
    expect([again.status, again.body.length, again.etag]).toEqual([304, 0, full.etag])
    expect((await fetchImage('/posters/with-poster/original', { 'If-None-Match': '"other"' })).status).toBe(200)
    const vi = await fetchImage('/posters/with-poster/vi')
    expect([vi.status, vi.type]).toEqual([200, 'image/png'])
    expect(vi.etag).not.toBe(full.etag)
    expect((await fetchImage('/posters/with-poster/vi', { 'If-None-Match': `W/${vi.etag}, "x"` })).status).toBe(304)
  })

  it('썸네일(?w=N)은 128·256·384·512 중 같거나 큰 너비의 webp로 줄이고, 원본 크기와 같은 확인을 거친다', async () => {
    const thumb = await fetchImage('/posters/with-poster/original?w=200')
    expect([thumb.status, thumb.type]).toEqual([200, 'image/webp'])
    expect(await sharp(thumb.body).metadata()).toMatchObject({ format: 'webp', width: 256, height: 341 })
    expect(thumb.body.length).toBeLessThan(image.length)
    expect(thumb.etag).toMatch(/^"[0-9a-f]{32}-original-w256"$/)
    expect((await fetchImage('/posters/with-poster/original?w=256', { 'If-None-Match': thumb.etag! })).status).toBe(304)
    expect((await sharp((await fetchImage('/posters/with-poster/original?w=5000')).body).metadata()).width).toBe(512)
    expect((await sharp((await fetchImage('/posters/with-poster/vi?w=1')).body).metadata()).width).toBe(128)
    // 내보낼 수 없는 번역본(담당자 확인 전, 원본이 바뀐 뒤)·없는 원본·게시 전 공고는 썸네일도 없다
    expect((await fetchImage('/posters/with-poster/zh?w=256')).status).toBe(404)
    expect((await fetchImage('/posters/stale-poster/vi?w=256')).status).toBe(404)
    expect((await fetchImage('/posters/no-poster/original?w=256')).status).toBe(404)
    for (const width of ['abc', '0', '-5', '1.5']) expect([width, (await fetchImage(`/posters/with-poster/original?w=${width}`)).status]).toEqual([width, 400])
  })

  it('원본 포스터가 바뀌면 다음 요청부터 번역본을 내리고 ETag도 바뀐다 (해시는 파일이 바뀔 때만 다시 계산)', async () => {
    const before = await fetchImage('/posters/changing/original?w=128')
    expect((await call(port, 'GET', '/programs/changing')).body.posters).toEqual({ original: true, languages: ['vi'] })
    const changed = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#1d6fb8' } }).png().toBuffer()
    writeFileSync(join(posters, 'inbox', 'changing', 'poster.png'), changed)
    expect((await call(port, 'GET', '/programs/changing')).body.posters).toEqual({ original: true, languages: [] })
    expect((await fetchImage('/posters/changing/vi?w=128')).status).toBe(404)
    const after = await fetchImage('/posters/changing/original?w=128', { 'If-None-Match': before.etag! })
    expect(after.status).toBe(200)
    expect(after.etag).not.toBe(before.etag)
  })
})

describe('프로그램 API: 파일 변경과 내부 오류', () => {
  let dir = ''
  const servers: Server[] = []
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'program-api-reload-')) })
  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise((done) => server.close(done))))
    rmSync(dir, { recursive: true, force: true })
  })

  it('공고 파일이 바뀌면 다음 요청부터 반영한다 (승인·사실 수정·삭제 없는 추가)', async () => {
    saveRecord(record('later-approved'), dir)
    const { server, port } = await start({ dataDir: dir, now: () => NOW, origins: [], log: () => {} })
    servers.push(server)
    expect((await call(port, 'GET', '/programs/later-approved')).status).toBe(410)
    expect((await call(port, 'GET', '/programs/added-later')).status).toBe(404)

    saveRecord(approve(record('later-approved')), dir)
    saveRecord(approve(record('added-later')), dir)
    expect((await call(port, 'GET', '/programs/later-approved')).status).toBe(200)
    expect((await call(port, 'GET', '/programs/added-later')).status).toBe(200)

    // 승인 뒤 사실을 손으로 고치면 내려간다
    saveRecord({ ...approve(record('later-approved')), cost_krw: 1000 }, dir)
    expect((await call(port, 'GET', '/programs/later-approved')).status).toBe(410)
    const search = await call(port, 'POST', '/programs/search', { body: '{}' })
    expect(ids(search.body.results)).toEqual(['added-later'])
  })

  it('승인 뒤 사실을 고쳐 다시 승인하면 이전 요약 승인은 풀린다. 승인한 문구를 고쳐도 내보내지 않는다', async () => {
    const approved = withSummaries('summary-bound')
    saveRecord(approved, dir)
    const { server, port } = await start({ dataDir: dir, now: () => NOW, origins: [], log: () => {} })
    servers.push(server)
    expect(Object.keys((await call(port, 'GET', '/programs/summary-bound')).body.summaries_by_language)).toEqual(['ko-easy'])

    // 승인한 요약 문구를 파일에서 직접 고친 경우
    const edited = structuredClone(approved)
    edited.summaries_by_language['ko-easy']!.lines[2] = '무료예요. 신청은 언제든 돼요.'
    saveRecord(edited, dir)
    expect((await call(port, 'GET', '/programs/summary-bound')).body.summaries_by_language).toEqual({})

    // 사실(비용)을 고친 뒤 공고만 다시 승인한 경우
    saveRecord(approve({ ...approved, cost_krw: 30000, cost_raw: '30,000원' }), dir)
    const reply = await call(port, 'GET', '/programs/summary-bound')
    expect(reply.status).toBe(200)
    expect(reply.body.cost_krw).toBe(30000)
    expect(reply.body.summaries_by_language).toEqual({})
  })

  it('운영이 끝난 공고는 신청 마감 전이어도 closed (도시락 공고 형태)', async () => {
    saveRecord(approve(record('ended-lunch', {
      sessions: [], period_start: '2026-10-19', period_end: '2026-10-19', application_start: '2026-10-12T09:00', application_end: '2026-10-23T00:00',
    })), dir)
    const { server, port } = await start({ dataDir: dir, now: () => new Date('2026-10-20T03:00:00Z'), origins: [], log: () => {} })
    servers.push(server)
    const reply = await call(port, 'GET', '/programs/ended-lunch')
    expect(reply.status).toBe(200)
    expect(reply.body.application_status).toBe('closed')
    const search = await call(port, 'POST', '/programs/search', { body: '{}' })
    expect(ids(search.body.results)).not.toContain('ended-lunch')
  })

  it('내부 오류는 500과 일반 문구만 돌려주고 자세한 내용은 서버 기록에만 남긴다', async () => {
    saveRecord(approve(record('boom-case')), dir)
    const logs: string[] = []
    const { server, port } = await start({ dataDir: dir, now: () => { throw new Error('secret-internal-detail') }, origins: [], log: (message) => logs.push(message) })
    servers.push(server)
    const reply = await call(port, 'GET', '/programs/boom-case')
    expect(reply.status).toBe(500)
    expect(reply.body).toEqual({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' })
    expect(reply.text).not.toMatch(/secret-internal-detail|at /)
    expect(logs.join('\n')).toMatch(/secret-internal-detail/)
  })
})

describe('직접 실행 판정 (isEntryPoint)', () => {
  const serverFile = resolve(__dirname, '../src/server.ts')
  const moduleUrl = pathToFileURL(serverFile).href
  let dir = ''
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'program-api-entry-')) })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('심볼릭 링크로 실행해도 실제 경로가 같으면 직접 실행으로 본다', () => {
    const link = join(dir, 'server-link.ts')
    symlinkSync(serverFile, link)
    expect(isEntryPoint(link, moduleUrl)).toBe(true)
    expect(isEntryPoint(serverFile, moduleUrl)).toBe(true)
  })

  it('다른 파일·없는 파일·인자 없음은 직접 실행이 아니다', () => {
    expect(isEntryPoint(resolve(__dirname, '../src/store.ts'), moduleUrl)).toBe(false)
    expect(isEntryPoint(join(dir, 'missing.ts'), moduleUrl)).toBe(false)
    expect(isEntryPoint(undefined, moduleUrl)).toBe(false)
  })
})
