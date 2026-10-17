import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runAgent, verifiedCitations } from '../src/agent/agent'
import type { AgentReply, AgentRequest } from '../src/agent/agent'
import { parseAgentRequest, parseQuestion, summarizeQuestions } from '../src/agent/requests'
import { runTool } from '../src/agent/tools'
import type { ToolState } from '../src/agent/tools'
import { generateWithTools } from '../src/llm/gemini'
import { approveRecord } from '../src/review/lifecycle'
import { createServer } from '../src/server'
import { saveRecord } from '../src/store'
import type { ProgramRecord } from '../src/types'

vi.mock('../src/llm/gemini', () => ({ generateWithTools: vi.fn(), generateJson: vi.fn(), generateText: vi.fn(), modelName: () => 'test-model' }))
const mockedTurn = vi.mocked(generateWithTools)

// 2026-10-15(목) 12:00, Asia/Seoul
const NOW = new Date('2026-10-15T03:00:00Z')

function record(id: string, overrides: Partial<ProgramRecord> = {}): ProgramRecord {
  return approveRecord({
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
    eligibility_requirements: ['관내'],
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
    application_end: '2026-10-23T01:00',
    application_methods: [{ type: 'phone', label: '문의', phone: '031-376-3428' }],
    uncertain_items: [],
    notices: ['참여 확정 여부는 10. 23.(금) 문자로 개별 안내드립니다.'],
    evidence: [
      { field: 'target_raw', quote: '관내 5세 이상 자녀를 둔 가족', verified: true },
      { field: 'capacity', quote: '모집인원: 200명', verified: true },
      { field: 'cost', quote: '참가비 1만원', verified: false },
    ],
    summaries_by_language: {},
    source: { url: 'https://example.com', retrieved_at: '2026-10-15', files: ['page.txt'], content_hash: id },
    extracted_at: '2026-10-15T00:00:00Z',
    model: 'test',
    warnings: [],
    review: { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null },
    ...overrides,
  }, { reviewer: '검수자', now: NOW })
}

const freshState = (): ToolState => ({ steps: [], programs: new Map(), unanswered: [], inquiry: null })

describe('상담 요청 검사', () => {
  it('마지막 메시지가 보호자 질문이고 언어가 맞아야 한다', () => {
    expect(parseAgentRequest({ messages: [{ role: 'user', text: '준비물?' }], locale: 'vi', program_id: 'sports' })).toEqual({
      ok: true, request: { messages: [{ role: 'user', text: '준비물?' }], locale: 'vi', program_id: 'sports' },
    })
    const bad = parseAgentRequest({ messages: [{ role: 'assistant', text: '안녕' }], locale: 'fr', program_id: '../x' })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.errors).toHaveLength(3)
  })

  it('기관에 알릴 질문은 공고·주제·질문만 받는다', () => {
    expect(parseQuestion({ program_id: 'sports', topic: 'materials', question_ko: ' 준비물이 있나요? ', name: '홍길동' }))
      .toEqual({ ok: true, question: { program_id: 'sports', topic: 'materials', question_ko: '준비물이 있나요?' } })
    expect(parseQuestion({ program_id: 'sports', topic: 'cost', question_ko: '' }).ok).toBe(false)
  })

  it('공고별로 같은 질문을 세고 많은 순으로 놓는다', () => {
    const records = new Map([['fair', record('fair')]])
    const summary = summarizeQuestions([
      { program_id: 'fair', topic: 'materials', question_ko: '준비물?', date: '2026-10-14' },
      { program_id: 'fair', topic: 'materials', question_ko: '준비물?', date: '2026-10-15' },
      { program_id: 'fair', topic: 'other', question_ko: '참가비?', date: '2026-10-13' },
    ], records)
    expect(summary.total).toBe(3)
    expect(summary.programs[0]).toMatchObject({ title: 'fair 운동회', total: 3, topics: { materials: 2, other: 1 } })
    expect(summary.programs[0].questions[0]).toEqual({ question_ko: '준비물?', topic: 'materials', count: 2, last_date: '2026-10-15' })
  })
})

describe('상담 도구 (검수된 사실과 기존 판정만 쓴다)', () => {
  const records = [record('sports')]
  const context = { records, now: NOW }

  it('조건으로 찾고, 공고 사실을 미상까지 그대로 준다', () => {
    const state = freshState()
    const found = runTool('search_programs', { child_age: 8, windows: [{ day_of_week: 'sat', start_time: '09:00', end_time: '14:00' }] }, context, state) as { results: { program_id: string }[] }
    expect(found.results.map((item) => item.program_id)).toEqual(['sports'])
    const facts = runTool('get_program', { program_id: 'sports' }, context, state) as Record<string, unknown>
    expect(facts).toMatchObject({ cost: '공고에 없음', capacity: 200, eligibility_requirements: ['관내'] })
    expect(facts.evidence).toEqual([{ field: 'target_raw', quote: '관내 5세 이상 자녀를 둔 가족' }, { field: 'capacity', quote: '모집인원: 200명' }])
    expect(state.steps.map((step) => step.tool)).toEqual(['search_programs', 'get_program'])
  })

  it('아이 조건 비교는 자격을 확정하지 않는다', () => {
    const fit = runTool('check_fit', { program_id: 'sports', child_age: 8 }, context, freshState()) as Record<string, unknown>
    expect(fit).toMatchObject({ age_grade: '맞음', family_eligibility: '확인 필요' })
  })

  it('문의문은 한국어로 만들고 공고에서 확인된 연락처만 준다', () => {
    const state = freshState()
    runTool('draft_inquiry', { program_id: 'sports', questions_ko: ['참가비가 있나요?', '준비물이 있나요?'] }, context, state)
    expect(state.inquiry?.message_ko).toContain('1. 참가비가 있나요?\n2. 준비물이 있나요?')
    expect(state.inquiry?.contacts).toEqual([{ type: 'phone', phone: '031-376-3428' }])
  })

  it('답이 없는 질문은 표시만 하고 저장하지 않는다', () => {
    const state = freshState()
    runTool('flag_unanswered', { program_id: 'sports', topic: 'materials', question_ko: '준비물이 있나요?' }, context, state)
    runTool('flag_unanswered', { program_id: 'sports', topic: 'materials', question_ko: '준비물이 있나요?' }, context, state)
    expect(state.unanswered).toHaveLength(1)
  })

  it('없는 공고는 오류로 알린다', () => {
    expect(runTool('get_program', { program_id: 'nope' }, context, freshState())).toMatchObject({ error: expect.any(String) })
  })
})

describe('상담 에이전트', () => {
  const records = [record('sports')]

  it('원문 근거에 없는 인용은 버린다', () => {
    expect(verifiedCitations([
      { program_id: 'sports', quote: '관내 5세 이상  자녀를 둔 가족' },
      { program_id: 'sports', quote: '참가비 1만원' },
      { program_id: 'sports', quote: '준비물: 운동화' },
      { program_id: 'sports', quote: '참여 확정 여부는 10. 23.(금) 문자로 개별 안내드립니다.' },
    ], records).map((citation) => citation.quote)).toEqual(['관내 5세 이상 자녀를 둔 가족', '참여 확정 여부는 10. 23.(금) 문자로 개별 안내드립니다.'])
  })

  it('도구를 차례로 쓰고 respond로 끝낸다', async () => {
    const content = { role: 'model', parts: [] }
    mockedTurn
      .mockResolvedValueOnce({ calls: [{ name: 'get_program', args: { program_id: 'sports' }, id: '1' }], text: null, content })
      .mockResolvedValueOnce({ calls: [{ name: 'flag_unanswered', args: { program_id: 'sports', topic: 'materials', question_ko: '준비물이 있나요?' } }, { name: 'draft_inquiry', args: { program_id: 'sports', questions_ko: ['준비물이 있나요?'] } }], text: null, content })
      .mockResolvedValueOnce({ calls: [{ name: 'respond', args: { answer: 'Thông báo không ghi đồ cần chuẩn bị.', citations: [{ program_id: 'sports', quote: '모집인원: 200명' }, { program_id: 'sports', quote: '지어낸 문장' }], follow_ups: ['Đăng ký thế nào?'] } }], text: null, content })
    const reply = await runAgent({ messages: [{ role: 'user', text: 'Có cần chuẩn bị gì không?' }], locale: 'vi', program_id: 'sports' }, { records, now: NOW })
    expect(reply.reply).toBe('Thông báo không ghi đồ cần chuẩn bị.')
    expect(reply.steps.map((step) => step.tool)).toEqual(['get_program', 'flag_unanswered', 'draft_inquiry'])
    expect(reply.citations.map((citation) => citation.quote)).toEqual(['모집인원: 200명'])
    expect(reply.unanswered).toEqual([{ program_id: 'sports', title: 'sports 운동회', topic: 'materials', question_ko: '준비물이 있나요?' }])
    expect(reply.inquiry?.is_demo).toBe(false)
    // 보고 있는 공고를 마지막 질문 앞에 알려 준다
    const firstCall = mockedTurn.mock.calls[0][0]
    expect(JSON.stringify(firstCall.contents[0])).toContain('[보호자가 보고 있는 공고: sports')
  })
})

describe('상담·질문·포스터 API', () => {
  let server: Server
  let port: number
  let root: string
  const asked: AgentRequest[] = []

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'agent-api-'))
    const data = join(root, 'data')
    const posters = join(root, 'posters')
    saveRecord(record('sports'), data)
    // 원본 포스터와 자동 검증을 통과한 베트남어 번역본
    mkdirSync(join(posters, 'inbox', 'sports'), { recursive: true })
    mkdirSync(join(posters, 'translated'), { recursive: true })
    const png = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#fff' } }).png().toBuffer()
    writeFileSync(join(posters, 'inbox', 'sports', 'poster.png'), png)
    writeFileSync(join(posters, 'translated', 'sports.vi.png'), png)
    const { createHash } = await import('node:crypto')
    writeFileSync(join(posters, 'translated', 'sports.vi.json'), JSON.stringify({
      program_id: 'sports', language: 'vi', source_file: 'poster.png', source_sha256: createHash('sha256').update(png).digest('hex'),
      status: 'machine_checked', created_at: NOW.toISOString(), models: { image: 'img', check: 'chk' }, table: [], table_repairs: 0, table_issues: [],
      qr: null, attempts: [{ n: 1, file: 'sports.vi.attempt-1.png', issues: [], readback: '', duration_ms: 1 }], chosen_attempt: 1,
    }))
    server = createServer({
      dataDir: data, posterDir: posters, now: () => NOW, origins: ['*'], showMachineChecked: true, log: () => {},
      agent: async (request): Promise<AgentReply> => {
        asked.push(request)
        return { reply: 'ok', citations: [], follow_ups: [], steps: [], programs: [], inquiry: null, unanswered: [] }
      },
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => {
    server.close()
    rmSync(root, { recursive: true, force: true })
  })

  const url = (path: string) => `http://127.0.0.1:${port}${path}`
  const post = (path: string, body: unknown) => fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  it('상담 요청을 검사해 에이전트에 넘긴다', async () => {
    const ok = await post('/agent/chat', { messages: [{ role: 'user', text: '준비물?' }], locale: 'vi', program_id: 'sports' })
    expect(ok.status).toBe(200)
    expect(asked.at(-1)).toMatchObject({ locale: 'vi', program_id: 'sports' })
    expect((await post('/agent/chat', { messages: [], locale: 'vi' })).status).toBe(400)
    expect((await post('/agent/chat', { messages: [{ role: 'user', text: '?' }], locale: 'vi', program_id: 'missing' })).status).toBe(404)
  })

  it('알린 질문을 날짜만 붙여 저장하고 공고별로 돌려준다', async () => {
    expect((await post('/agent/questions', { program_id: 'sports', topic: 'materials', question_ko: '준비물이 있나요?' })).status).toBe(201)
    expect((await post('/agent/questions', { program_id: 'missing', topic: 'materials', question_ko: '준비물?' })).status).toBe(404)
    const summary = await (await fetch(url('/agent/questions'))).json() as { programs: { questions: unknown[] }[] }
    expect(summary.programs[0].questions[0]).toEqual({ question_ko: '준비물이 있나요?', topic: 'materials', count: 1, last_date: '2026-10-15' })
  })

  it('게시된 공고의 원본·검증된 번역 포스터만 준다', async () => {
    const info = await (await fetch(url('/posters/sports'))).json()
    expect(info).toMatchObject({ original: true, languages: { vi: { status: 'machine_checked', attempts: 1, checked: { issues: 0 } } } })
    const image = await fetch(url('/posters/sports/vi'))
    expect(image.headers.get('content-type')).toBe('image/png')
    expect((await fetch(url('/posters/sports/zh'))).status).toBe(404)
    expect((await fetch(url('/posters/missing'))).status).toBe(404)
  })
})
