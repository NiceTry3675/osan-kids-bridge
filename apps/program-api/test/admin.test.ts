import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkDraft, checkItem, newClaims, newTokens, parseDraftItems, sourceTexts } from '../src/admin/check'
import type { CheckContext, DraftItem } from '../src/admin/check'
import { parseImproveRequest, runImprover } from '../src/admin/improve'
import type { ImproveInput, ImproveResult } from '../src/admin/improve'
import { addAddenda, adminFacts, parseAddenda, parseReviewRequest } from '../src/admin/programs'
import { verifiedCitations } from '../src/agent/agent'
import { noticeFacts } from '../src/agent/tools'
import { generateWithTools } from '../src/llm/gemini'
import { evaluateProgram } from '../src/match'
import { factsHash, isPublished } from '../src/review/hash'
import { approveRecord } from '../src/review/lifecycle'
import { createServer } from '../src/server'
import { loadRecord, recordProblems, saveRecord } from '../src/store'
import type { ProgramRecord } from '../src/types'

vi.mock('../src/llm/gemini', () => ({ generateWithTools: vi.fn(), generateJson: vi.fn(), generateText: vi.fn(), modelName: () => 'test-model' }))
const mockedTurn = vi.mocked(generateWithTools)

// 2026-10-15(목) 12:00, Asia/Seoul
const NOW = new Date('2026-10-15T03:00:00Z')

const QUESTIONS = [
  { question_ko: '참가비가 있나요?', topic: 'other' as const, count: 9 },
  { question_ko: '언제 참여 확정을 알려 주나요?', topic: 'schedule' as const, count: 2 },
]

function base(id: string, overrides: Partial<ProgramRecord> = {}): ProgramRecord {
  return {
    program_id: id,
    title: `${id} 운동회`,
    institution: '오산시가족센터',
    category: 'sports_arts',
    audience: 'parent_child',
    target_type: 'all',
    target_raw: '관내 5세 이상 자녀를 둔 가족',
    description: '가족 운동회',
    grade_range: null,
    age_range: [5, 99],
    eligibility_requirements: [],
    guardian_companion: 'unknown',
    sibling_companion: 'unknown',
    korean_level_required: null,
    support_languages: null,
    application_languages: null,
    sessions: [{ id: `${id}-s1`, date: '2026-10-31', start_time: '10:00', end_time: '13:00', place_name: '오산오색문화체육센터', dong: '중앙동', online: false }],
    period_start: null,
    period_end: null,
    session_count: 1,
    attendance_rule: 'all_sessions',
    mid_join_allowed: null,
    cost_krw: null,
    cost_raw: null,
    capacity: 200,
    application_start: '2026-10-02T09:00',
    application_end: '2026-10-22T18:00',
    application_methods: [{ type: 'phone', label: '문의', phone: '031-376-3428' }],
    uncertain_items: ['참가비', '보호자·형제자매 동반 가능 여부'],
    notices: ['참여 확정 여부는 10. 23.(금) 문자로 개별 안내드립니다.'],
    evidence: [
      { field: 'title', quote: `${id} 운동회`, verified: true },
      { field: 'target_raw', quote: '관내 5세 이상 자녀를 둔 가족', verified: true },
      { field: 'age_range', quote: '관내 5세 이상 자녀를 둔 가족', verified: true },
      { field: 'audience', quote: '보호자와 자녀를 포함한 가족 2명 이상', verified: true },
      { field: `sessions[${id}-s1].date`, quote: '2026.10.31.(토) 10:00~13:00', verified: true },
      { field: `sessions[${id}-s1].time`, quote: '2026.10.31.(토) 10:00~13:00', verified: true },
      { field: `sessions[${id}-s1].place`, quote: '오산오색문화체육센터 (대체육관)', verified: true },
      { field: 'capacity', quote: '모집인원: 200명', verified: true },
      { field: 'application_period', quote: '모집기간: 2026. 10. 2.(금) 09:00 ~ 10. 22.(목) 18:00', verified: true },
      { field: 'application_methods.phone', quote: '문의: 031-376-3428', verified: true },
      { field: 'session_count', quote: '총 1회', verified: true },
    ],
    summaries_by_language: {},
    source: { url: `https://example.com/${id}`, retrieved_at: '2026-10-14', files: ['page.txt'], content_hash: id },
    extracted_at: '2026-10-14T00:00:00Z',
    model: 'test',
    warnings: [],
    review: { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null },
    ...overrides,
  }
}

const approved = (id: string, overrides: Partial<ProgramRecord> = {}) => approveRecord(base(id, overrides), { reviewer: '검수자', now: NOW })

function context(record: ProgramRecord): CheckContext {
  return { questions: QUESTIONS.map((question) => question.question_ko), items: evaluateProgram(record, null, NOW).uncertain_items_ko, sources: sourceTexts(record) }
}

const item = (overrides: Partial<DraftItem>): DraftItem => ({
  kind: 'add_notice', topic: 'other', questions: ['참가비가 있나요?'], quote: null, draft: '참가비: {{참가비 (예: 무료)}}', resolves_items: ['참가비'], reason: '9명이 물음', ...overrides,
})

describe('공고 보완 초안의 코드 검사', () => {
  const record = base('sports')

  it('기관이 정할 값을 빈칸으로 남긴 초안은 통과한다 (빈칸 안의 예시는 검사하지 않는다)', () => {
    expect(checkItem(item({}), context(record))).toEqual([])
    expect(checkItem(item({ draft: '참가비: {{1인 5,000원 또는 무료}}' }), context(record))).toEqual([])
  })

  it('공고에 없는 금액·날짜·전화와 무료 같은 단정을 빈칸 밖에 쓰면 잡는다', () => {
    expect(newTokens('참가비는 1인 5,000원이고 11월 2일까지 010-1234-5678로 문의하세요. {{기타}}', sourceTexts(record)).map((entry) => entry.kind).sort())
      .toEqual(['dates', 'numbers', 'phones'])
    expect(newClaims('참가비는 무료입니다. {{기타}}', sourceTexts(record))).toEqual(['무료'])
    const problems = checkItem(item({ draft: '참가비는 무료입니다. 문의: {{문의 시간}}' }), context(record))
    expect(problems.some((problem) => problem.includes("'무료'"))).toBe(true)
  })

  it('공고에 있는 숫자·전화는 다시 써도 된다', () => {
    expect(newTokens('정원은 200명이고 문의는 031-376-3428입니다.', sourceTexts(record))).toEqual([])
  })

  it('공고에 없는 답에 빈칸이 없으면, 이미 있는 답에 빈칸이 있으면 잡는다', () => {
    expect(checkItem(item({ draft: '참가비는 기관에 문의해 주세요.' }), context(record))).toContain('공고에 없는 답은 담당자가 채울 {{빈칸}}으로 남겨야 함')
    const already = item({ kind: 'already_in_notice', topic: 'schedule', questions: ['언제 참여 확정을 알려 주나요?'], quote: '참여 확정 여부는 10. 23.(금) 문자로 개별 안내드립니다.', draft: '참여 확정은 {{날짜}}에 문자로 알려 드려요.', resolves_items: [] })
    expect(checkItem(already, context(record))).toContain('공고에 이미 있는 내용에는 빈칸을 두지 않음')
    expect(checkItem({ ...already, draft: '참여 확정 여부는 10월 23일(금)에 문자로 알려 드려요.' }, context(record))).toEqual([])
  })

  it('원문에 없는 인용, 목록에 없는 질문·확인 항목을 잡고 다루지 않은 질문을 알려 준다', () => {
    const wrong = item({ kind: 'already_in_notice', quote: '참가비는 무료입니다', draft: null, questions: ['주차할 수 있나요?'], resolves_items: ['주차'] })
    const problems = checkItem(wrong, context(record))
    expect(problems).toContain('인용이 공고 원문(근거 인용·안내 문장)에 글자 그대로 없음')
    expect(problems).toContain('질문 목록에 없는 문장: "주차할 수 있나요?"')
    expect(problems).toContain(`'기관에 확인할 점' 목록에 없는 문구: "주차"`)
    expect(checkDraft([item({})], context(record)).uncovered).toEqual(['언제 참여 확정을 알려 주나요?'])
  })

  it('모델이 낸 항목의 형식을 다듬고 틀린 항목은 버린다', () => {
    expect(parseDraftItems([{ kind: 'guess', questions: ['x'] }, { kind: 'add_notice', topic: 'nope', questions: [' 참가비가 있나요? ', 3], draft: ' 참가비: {{금액}} ' }]))
      .toEqual([{ kind: 'add_notice', topic: 'other', questions: ['참가비가 있나요?'], quote: null, draft: '참가비: {{금액}}', resolves_items: [], reason: '' }])
    expect(parseDraftItems('items')).toEqual([])
  })
})

describe('공고 보완 도우미 (에이전트)', () => {
  const record = approved('sports')
  const turn = (calls: { name: string; args?: Record<string, unknown> }[]) => ({
    calls: calls.map((call, index) => ({ name: call.name, args: call.args ?? {}, id: `c${index}` })),
    text: null,
    content: { role: 'model', parts: [{ text: 'call' }] },
  })
  const good = [
    item({}),
    item({ kind: 'already_in_notice', topic: 'schedule', questions: ['언제 참여 확정을 알려 주나요?'], quote: '참여 확정 여부는 10. 23.(금) 문자로 개별 안내드립니다.', draft: null, resolves_items: [] }),
  ]

  beforeEach(() => mockedTurn.mockReset())

  it('공고·질문을 읽고, 코드 검사에서 걸린 초안을 고쳐 다시 검사한 뒤 제출한다', async () => {
    mockedTurn
      .mockResolvedValueOnce(turn([{ name: 'read_notice' }, { name: 'read_questions' }]))
      .mockResolvedValueOnce(turn([{ name: 'check_draft', args: { items: [{ ...good[0], draft: '참가비는 무료입니다.' }, good[1]] } }]))
      .mockResolvedValueOnce(turn([{ name: 'check_draft', args: { items: good } }]))
      .mockResolvedValueOnce(turn([{ name: 'submit', args: { items: good } }]))
    const result = await runImprover({ record, questions: QUESTIONS, now: NOW })
    expect(result.passed).toBe(true)
    expect(result.rounds).toBe(3)
    expect(result.steps.map((step) => `${step.tool}:${step.ok}`)).toEqual(['read_notice:true', 'read_questions:true', 'check_draft:false', 'check_draft:true', 'submit:true'])
    expect(result.items.map((entry) => [entry.id, entry.blanks, entry.asked, entry.problems])).toEqual([['item-1', ['참가비 (예: 무료)'], 9, []], ['item-2', [], 2, []]])
    expect(result.uncovered).toEqual([])
    // 코드 검사의 문제 목록이 모델에 돌아갔다
    const feedback = JSON.stringify(mockedTurn.mock.calls[2][0].contents)
    expect(feedback).toContain("공고에 없는 단정 '무료'")
    expect(mockedTurn.mock.calls[0][0].system).toContain('{{빈칸 이름}}')
  })

  it('문제가 남은 초안을 제출하면 받지 않고, 끝내 통과하지 못하면 문제와 함께 돌려준다', async () => {
    const bad = [{ ...good[0], draft: '참가비는 5,000원입니다.' }]
    mockedTurn.mockResolvedValue(turn([{ name: 'submit', args: { items: bad } }]))
    const result = await runImprover({ record, questions: QUESTIONS, now: NOW })
    expect(result.passed).toBe(false)
    expect(result.items[0].problems).toContain('공고에 없는 숫자 5000 → 기관이 정할 값이면 {{빈칸}}으로')
    expect(result.uncovered).toEqual(['언제 참여 확정을 알려 주나요?'])
    expect(result.steps.every((step) => step.tool === 'submit' && !step.ok)).toBe(true)
  })

  it('요청의 질문 목록을 검사한다', () => {
    expect(parseImproveRequest({ questions: QUESTIONS })).toEqual({ ok: true, questions: QUESTIONS })
    expect(parseImproveRequest({ questions: [] }).ok).toBe(false)
    expect(parseImproveRequest({ questions: [{ question_ko: '참가비?', topic: 'money' }] }).ok).toBe(false)
  })
})

describe('기관 추가 안내', () => {
  const record = approved('sports')
  const toConfirm = evaluateProgram(record, null, NOW).uncertain_items_ko

  it('빈칸이 남았거나 확인 항목 목록에 없는 문구를 풀겠다고 하면 받지 않는다', () => {
    expect(parseAddenda({ author: '김담당', items: [{ topic: 'other', text: '참가비: {{금액}}' }] }, toConfirm).ok).toBe(false)
    expect(parseAddenda({ author: '김담당', items: [{ topic: 'other', text: '참가비는 무료입니다.', resolves_items: ['주차'] }] }, toConfirm).ok).toBe(false)
    expect(parseAddenda({ items: [{ topic: 'other', text: '참가비는 무료입니다.' }] }, toConfirm).ok).toBe(false)
  })

  it('덧붙여도 원문 검수(사실 해시)는 그대로 게시되고, 푼 항목은 확인할 점에서 빠지며 상담 에이전트가 인용할 수 있다', () => {
    const parsed = parseAddenda({ author: '김담당', items: [{ topic: 'other', text: '참가비는 무료입니다.', resolves_questions: ['참가비가 있나요?'], resolves_items: ['참가비'], drafted_by_ai: true }] }, toConfirm)
    if (!parsed.ok) throw new Error(parsed.errors.join())
    const next = addAddenda(record, parsed.input, NOW)
    expect(recordProblems(next)).toEqual([])
    expect(next.addenda).toEqual([{ id: 'add-1', topic: 'other', text: '참가비는 무료입니다.', resolves_questions: ['참가비가 있나요?'], resolves_items: ['참가비'], drafted_by_ai: true, author: '김담당', added_at: NOW.toISOString() }])
    expect(factsHash(next)).toBe(factsHash(record))
    expect(isPublished(next)).toBe(true)
    expect(evaluateProgram(next, null, NOW).uncertain_items_ko).not.toContain('참가비')
    expect(noticeFacts(evaluateProgram(next, null, NOW), next, '2026-10-15', []).institution_addenda).toEqual([{ text: '참가비는 무료입니다.', confirmed_on: '2026-10-15' }])
    expect(verifiedCitations([{ program_id: 'sports', quote: '참가비는 무료입니다.' }, { program_id: 'sports', quote: '모집인원: 200명' }], [next]).map((citation) => citation.source)).toEqual(['addendum', 'notice'])
    expect(verifiedCitations([{ program_id: 'sports', quote: '참가비는 무료입니다.' }], [record])).toEqual([])
    expect(addAddenda(next, parsed.input, NOW).addenda?.map((addendum) => addendum.id)).toEqual(['add-1', 'add-2'])
  })
})

describe('검수 화면 데이터', () => {
  it('사실마다 값·근거 인용·확인 상태를 보여 준다', () => {
    const facts = adminFacts(base('sports', { cost_krw: 10000, cost_raw: '1만원' }))
    const byLabel = (label: string) => facts.find((fact) => fact.label === label)
    expect(byLabel('정원')).toEqual({ label: '정원', value: '200명', status: 'verified', quotes: ['모집인원: 200명'] })
    expect(byLabel('비용')).toMatchObject({ value: '10,000원', status: 'unverified', quotes: [] })
    expect(byLabel('나이 범위')).toMatchObject({ status: 'verified' })
    expect(byLabel('보호자 동반')).toMatchObject({ value: '공고에 없음', status: 'not_stated' })
  })

  it('검수 요청 본문을 검사한다', () => {
    expect(parseReviewRequest({ action: 'approve', reviewer: '김담당', summaries: ['ko-easy'] })).toMatchObject({ ok: true, request: { action: 'approve', summaries: ['ko-easy'], force: false } })
    expect(parseReviewRequest({ action: 'reject', reviewer: '김담당' }).ok).toBe(false)
    expect(parseReviewRequest({ action: 'approve' }).ok).toBe(false)
    expect(parseReviewRequest({ action: 'reset' }).ok).toBe(true)
    expect(parseReviewRequest({ action: 'approve', reviewer: '김담당', summaries: ['en'] }).ok).toBe(false)
  })
})

interface Reply { status: number; body: any; type: string | undefined }

function call(port: number, method: string, path: string, body?: unknown): Promise<Reply> {
  return new Promise((done, fail) => {
    const text = body === undefined ? undefined : JSON.stringify(body)
    const headers = text === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(text)) }
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks)
        const type = res.headers['content-type']
        done({ status: res.statusCode ?? 0, type, body: type?.startsWith('application/json') && raw.length ? JSON.parse(raw.toString('utf8')) : raw })
      })
    })
    req.on('error', fail)
    if (text !== undefined) req.write(text)
    req.end()
  })
}

async function start(options: Parameters<typeof createServer>[0]): Promise<{ server: Server; port: number }> {
  const server = createServer(options)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return { server, port: (server.address() as AddressInfo).port }
}

describe('관리자 API', () => {
  let dir = ''
  let posters = ''
  let server: Server
  let port = 0
  let closed: { server: Server; port: number }
  const improver = vi.fn(async (input: ImproveInput): Promise<ImproveResult> => ({
    program_id: input.record.program_id, title: input.record.title, items: [], uncovered: [], passed: true, rounds: 1, steps: [], model: 'fake',
  }))

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'program-api-admin-'))
    posters = mkdtempSync(join(tmpdir(), 'program-api-posters-'))
    saveRecord(approved('sports'), dir)
    saveRecord(base('pending-one', { capacity: 30 }), dir)
    mkdirSync(join(dir, 'inbox', 'sports'), { recursive: true })
    writeFileSync(join(dir, 'inbox', 'sports', 'page.txt'), '우리 zip. 운동회\n■ 모집인원: 200명')
    ;({ server, port } = await start({ dataDir: dir, posterDir: posters, now: () => NOW, origins: [], log: () => {}, admin: true, improver }))
    closed = await start({ dataDir: dir, posterDir: posters, now: () => NOW, origins: [], log: () => {}, admin: false })
  })

  afterAll(async () => {
    await new Promise((done) => server.close(done))
    await new Promise((done) => closed.server.close(done))
    rmSync(dir, { recursive: true, force: true })
    rmSync(posters, { recursive: true, force: true })
  })

  it('ADMIN_API를 켜지 않으면 관리자 주소는 없다', async () => {
    expect((await call(closed.port, 'GET', '/admin/programs')).status).toBe(404)
  })

  it('게시 여부와 상관없이 모든 공고의 검수 상태를 보여 준다', async () => {
    const reply = await call(port, 'GET', '/admin/programs')
    expect(reply.status).toBe(200)
    expect(reply.body.programs.map((row: any) => [row.program_id, row.review.status, row.to_confirm])).toEqual([['pending-one', 'pending', 2], ['sports', 'approved', 2]])
    const detail = await call(port, 'GET', '/admin/programs/sports')
    expect(detail.body.source_text).toEqual([{ file: 'page.txt', text: '우리 zip. 운동회\n■ 모집인원: 200명' }])
    expect(detail.body.facts.find((fact: any) => fact.label === '정원').status).toBe('verified')
    expect((await call(port, 'GET', '/admin/programs/nope')).status).toBe(404)
  })

  it('근거가 확인되지 않은 사실이 있으면 확인 표시(force) 없이 승인하지 않는다', async () => {
    const blocked = await call(port, 'POST', '/admin/programs/pending-one/review', { action: 'approve', reviewer: '김담당' })
    expect(blocked.status).toBe(409)
    expect(blocked.body.errors).toContain('정원')
    const ok = await call(port, 'POST', '/admin/programs/pending-one/review', { action: 'approve', reviewer: '김담당', force: true, note: '원문 대조함' })
    expect(ok.status).toBe(200)
    expect(ok.body.review).toMatchObject({ status: 'approved', reviewer: '김담당', notes: '원문 대조함' })
    expect(loadRecord('pending-one', dir)?.review.status).toBe('approved')
    const reset = await call(port, 'POST', '/admin/programs/pending-one/review', { action: 'reset' })
    expect(reset.body.review.status).toBe('pending')
  })

  it('추가 안내를 저장하면 보호자 API의 확인할 점에서 빠지고, 지우면 돌아온다', async () => {
    const saved = await call(port, 'POST', '/admin/programs/sports/addenda', { author: '김담당', items: [{ topic: 'other', text: '참가비는 무료입니다.', resolves_items: ['참가비'], resolves_questions: ['참가비가 있나요?'], drafted_by_ai: true }] })
    expect(saved.status).toBe(200)
    expect(saved.body.addenda).toHaveLength(1)
    const program = await call(port, 'GET', '/programs/sports')
    expect(program.status).toBe(200)
    expect(program.body.uncertain_items_ko).not.toContain('참가비')
    expect((await call(port, 'POST', '/admin/programs/sports/addenda', { author: '김담당', items: [{ topic: 'other', text: '{{금액}}' }] })).status).toBe(400)
    const removed = await call(port, 'DELETE', '/admin/programs/sports/addenda/add-1')
    expect(removed.body.addenda).toEqual([])
    expect((await call(port, 'GET', '/programs/sports')).body.uncertain_items_ko).toContain('참가비')
    expect((await call(port, 'DELETE', '/admin/programs/sports/addenda/add-9')).status).toBe(404)
  })

  it('공고 보완 도우미는 질문 목록을 검사한 뒤 에이전트에 넘기고, 실패하면 503', async () => {
    expect((await call(port, 'POST', '/admin/programs/sports/improve', { questions: [] })).status).toBe(400)
    const reply = await call(port, 'POST', '/admin/programs/sports/improve', { questions: QUESTIONS })
    expect(reply.status).toBe(200)
    expect(improver).toHaveBeenCalledWith(expect.objectContaining({ questions: QUESTIONS, now: NOW }))
    improver.mockRejectedValueOnce(new Error('model down'))
    expect((await call(port, 'POST', '/admin/programs/sports/improve', { questions: QUESTIONS })).status).toBe(503)
  })

  it('번역 포스터가 없으면 승인할 수 없고, 원본 이미지도 없으면 404', async () => {
    expect((await call(port, 'POST', '/admin/posters/sports/vi/approve', { reviewer: '김담당' })).status).toBe(409)
    expect((await call(port, 'POST', '/admin/posters/sports/vi/approve', {})).status).toBe(400)
    expect((await call(port, 'GET', '/admin/posters/sports/original')).status).toBe(404)
    expect((await call(port, 'GET', '/admin/posters/sports/vi-2')).status).toBe(404)
  })
})
