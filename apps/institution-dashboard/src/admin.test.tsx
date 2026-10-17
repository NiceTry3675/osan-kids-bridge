// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { fillBlanks, hasBlank } from './data/admin'
import type { ImproveResult, PlanResult, ProgramDetail, ProgramRow } from './data/admin'
import { LanguageProvider } from './i18n'

vi.hoisted(() => { vi.stubEnv('VITE_API_BASE_URL', 'http://api.test') })

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function row(id: string, overrides: Partial<ProgramRow> = {}): ProgramRow {
  return {
    program_id: id, title: `${id} 공고`, institution: '오산시가족센터', category: 'sports_arts', is_demo: false,
    review: { status: 'approved', reviewer: '시연 데이터', reviewed_at: '2026-10-15T01:00:00Z', notes: null },
    unverified: 0, warnings: 0, summaries: { 'ko-easy': 'machine_checked', vi: 'machine_checked' }, has_poster: true,
    posters: { vi: { status: 'machine_checked', chosen_attempt: 2, attempts: 2, served: true } },
    schedule: '1회차 10-31 10:00~13:00', application_status: 'open', application_end: '2026-10-22', to_confirm: 2, addenda: [],
    ...overrides,
  }
}

const SPORTS = row('osan-fc-sports-day', { title: '우리 zip. 운동회' })
const PENDING = row('pending-one', { title: '대기 공고', review: { status: 'pending', reviewer: null, reviewed_at: null, notes: null }, unverified: 2, posters: {} })

function detail(base: ProgramRow, overrides: Partial<ProgramDetail> = {}): ProgramDetail {
  return {
    ...base, source_url: 'https://example.com', retrieved_at: '2026-10-15',
    facts: [
      { label: '정원', value: '200명', status: 'verified', quotes: ['모집인원: 200명'] },
      { label: '비용', value: '공고에 없음', status: 'not_stated', quotes: [] },
      { label: '학년 범위', value: '초등 1~3학년', status: 'unverified', quotes: [] },
    ],
    unverified_labels: base.unverified ? ['학년 범위', '참석 방식'] : [], warning_list: [], to_confirm_items: ['참가비', '보호자·형제자매 동반 가능 여부'], notices: [],
    summary_list: [{ language: 'ko-easy', state: 'machine_checked', lines: ['한 줄', '두 줄', '세 줄'], heading: null, issues: [], reviewer: null }],
    source_text: [{ file: 'page.txt', text: '우리 zip. 운동회' }],
    poster_list: base.posters.vi ? [{
      ...base.posters.vi, language: 'vi', segments: 18, qr: { matches: true }, injected_fault: '날짜 31/10 → 10/31', reviewer: null, approved_at: null, source_changed: false,
      attempt_list: [{ n: 1, passed: false, issues: [{ kind: 'tokens', message: '빠진 날짜 10-31' }], duration_ms: 1 }, { n: 2, passed: true, issues: [], duration_ms: 1 }],
    }] : [],
    ...overrides,
  }
}

const IMPROVE: ImproveResult = {
  program_id: 'osan-fc-sports-day', title: '우리 zip. 운동회', uncovered: [], passed: true, rounds: 2, model: 'test',
  steps: [{ tool: 'read_notice', ok: true }, { tool: 'read_questions', ok: true }, { tool: 'check_draft', ok: false, problems: 1 }, { tool: 'check_draft', ok: true, problems: 0 }, { tool: 'submit', ok: true, problems: 0 }],
  items: [{
    id: 'item-1', kind: 'add_notice', topic: 'other', questions: ['참가비가 있나요?'], quote: null, draft: '참가비: {{참가비 (예: 무료)}}',
    resolves_items: ['참가비'], reason: '9명이 물었는데 공고에 비용이 없음', blanks: ['참가비 (예: 무료)'], problems: [], asked: 9,
  }],
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>
let calls: { url: string; init?: RequestInit }[] = []
function serve(routes: Record<string, Handler>) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const path = url.replace('http://api.test', '')
    const key = `${init?.method ?? 'GET'} ${path}`
    const handler = routes[key] ?? (path === '/agent/questions' ? () => json({ programs: [] }) : null)
    if (!handler) return json({ error: `없는 주소 ${key}` }, 404)
    return handler(url, init)
  }))
}

const open = (hash: string) => {
  window.location.hash = hash
  window.scrollTo = vi.fn() as typeof window.scrollTo
  return render(<LanguageProvider><App /></LanguageProvider>)
}

beforeEach(() => { try { localStorage.clear() } catch { /* 없어도 됩니다. */ } })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('빈칸 채우기', () => {
  it('채운 빈칸만 바꾸고, 남은 빈칸은 알아본다', () => {
    const text = fillBlanks('참가비: {{금액}} · 준비물: {{준비물}}', { 금액: '무료' })
    expect(text).toBe('참가비: 무료 · 준비물: {{준비물}}')
    expect(hasBlank(text)).toBe(true)
    expect(hasBlank(fillBlanks(text, { 준비물: '운동화' }))).toBe(false)
  })
})

describe('공고 관리', () => {
  it('검수가 필요한 공고를 먼저 보여 주고 메뉴에 처리할 수를 붙인다', async () => {
    serve({ 'GET /admin/programs': () => json({ now: '2026-10-15T01:00:00Z', programs: [SPORTS, PENDING] }) })
    open('#programs')
    const table = await screen.findByRole('table')
    const titles = within(table).getAllByRole('rowheader').map((cell) => cell.querySelector('a')!.textContent)
    expect(titles).toEqual(['대기 공고', '우리 zip. 운동회'])
    expect(screen.getByLabelText('처리할 것 1건')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: '게시 중' }))
    expect(within(table).getAllByRole('rowheader')).toHaveLength(1)
  })

  it('관리자 API가 꺼져 있으면 켜는 방법을 알려 준다', async () => {
    serve({})
    open('#programs')
    expect(await screen.findByText('관리자 API가 꺼져 있어요')).toBeTruthy()
  })

  it('검수 화면: 근거 없는 사실이 있으면 대조 확인을 표시해야 승인할 수 있고, 승인 요청에 그 표시를 보낸다', async () => {
    const pending = detail(PENDING)
    serve({
      'GET /admin/programs': () => json({ now: '', programs: [SPORTS, PENDING] }),
      'GET /admin/programs/pending-one': () => json(pending),
      'POST /admin/programs/pending-one/review': () => json({ ...pending, review: { status: 'approved', reviewer: '김오산', reviewed_at: '2026-10-15T01:00:00Z', notes: null } }),
    })
    open('#programs/pending-one')
    expect(await screen.findByText('원문 근거로 확인되지 않은 사실: 학년 범위, 참석 방식')).toBeTruthy()
    fireEvent.change(screen.getAllByLabelText('담당자 이름')[1], { target: { value: '김오산' } })
    const approve = screen.getByRole('button', { name: '승인하고 게시' }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('근거가 확인되지 않은 사실 2개를 원문과 직접 대조했어요'))
    expect(approve.disabled).toBe(false)
    fireEvent.click(approve)
    expect(await screen.findByText('승인했어요. 보호자 화면에 게시됩니다.')).toBeTruthy()
    const body = JSON.parse(String(calls.find((call) => call.init?.method === 'POST')!.init!.body))
    expect(body).toEqual({ action: 'approve', reviewer: '김오산', summaries: ['ko-easy'], force: true })
  })

  it('번역 포스터의 검증 기록(회차별 문제, QR, 시연용 오류)을 보여 준다', async () => {
    serve({ 'GET /admin/programs': () => json({ now: '', programs: [SPORTS] }), 'GET /admin/programs/osan-fc-sports-day': () => json(detail(SPORTS)) })
    open('#programs/osan-fc-sports-day')
    expect(await screen.findByText('빠진 날짜 10-31')).toBeTruthy()
    expect(screen.getByText('QR 원본 이식 · 다시 읽어 주소 일치')).toBeTruthy()
    expect(screen.getByText('시연용: 1회차 지시에 일부러 넣은 오류 (날짜 31/10 → 10/31)를 검증이 잡았어요.')).toBeTruthy()
    // 담당자 이름이 없으면 번역 포스터를 승인할 수 없다
    expect((screen.getByRole('button', { name: '이 번역 포스터 승인' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('공고 보완 도우미', () => {
  const QUESTIONS = { programs: [{ program_id: 'osan-fc-sports-day', title: '우리 zip. 운동회', questions: [{ question_ko: '주차할 곳이 있나요?', topic: 'other', count: 2, last_date: '2026-10-16' }] }] }

  it('답 없는 질문으로 초안을 받아, 빈칸을 채워야 공고에 덧붙일 수 있다', async () => {
    let rows = [SPORTS]
    serve({
      'GET /agent/questions': () => json(QUESTIONS),
      'GET /admin/programs': () => json({ now: '', programs: rows }),
      'POST /admin/programs/osan-fc-sports-day/improve': () => json(IMPROVE),
      'POST /admin/programs/osan-fc-sports-day/addenda': (_url, init) => {
        const body = JSON.parse(String(init!.body))
        rows = [{ ...SPORTS, addenda: [{ id: 'add-1', ...body.items[0], author: body.author, added_at: '2026-10-15T01:00:00Z' }] }]
        return json(detail(rows[0]))
      },
    })
    open('#questions/osan-fc-sports-day')
    fireEvent.click(await screen.findByRole('button', { name: /보완 초안 만들기/ }))
    expect(await screen.findByText(/코드 검사 통과 \(2회 검사\)/)).toBeTruthy()
    expect(screen.getByText(/문제 1건 → 고쳐 쓰기/)).toBeTruthy()
    const add = screen.getByRole('button', { name: '고른 1건을 공고에 덧붙이기' }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
    expect(screen.getByText('빈칸 1곳을 채워야 덧붙일 수 있어요.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('참가비 (예: 무료)'), { target: { value: '무료' } })
    fireEvent.change(screen.getByLabelText('확정하는 담당자'), { target: { value: '김오산' } })
    expect(add.disabled).toBe(false)
    fireEvent.click(add)
    expect(await screen.findByText('추가 안내 1건을 공고에 덧붙였어요.')).toBeTruthy()
    const body = JSON.parse(String(calls.find((call) => call.url.endsWith('/addenda'))!.init!.body))
    expect(body).toEqual({ author: '김오산', items: [{ topic: 'other', text: '참가비: 무료', resolves_questions: ['참가비가 있나요?'], resolves_items: ['참가비'], drafted_by_ai: true }] })
    // 보완 도우미에는 아직 답하지 않은 질문만 보냈다
    const sent = JSON.parse(String(calls.find((call) => call.url.endsWith('/improve'))!.init!.body))
    expect(sent.questions.map((question: { question_ko: string }) => question.question_ko)).toContain('참가비가 있나요?')
    await waitFor(() => expect(screen.getAllByText(/추가 안내로 답함/).length).toBeGreaterThan(0))
  })

  it('공고에 이미 있는 답은 미리 고르지 않고, 본문으로 건너뛰기는 화면을 바꾸지 않는다', async () => {
    const already = { ...IMPROVE.items[0], id: 'item-2', kind: 'already_in_notice' as const, topic: 'schedule' as const, questions: ['언제 알려 주나요?'], quote: '참여 확정 여부는 문자로 안내드립니다.', draft: '참여 확정 여부는 문자로 알려 드려요.', blanks: [], resolves_items: [] }
    serve({
      'GET /admin/programs': () => json({ now: '', programs: [SPORTS] }),
      'POST /admin/programs/osan-fc-sports-day/improve': () => json({ ...IMPROVE, items: [IMPROVE.items[0], already] }),
    })
    open('#questions/osan-fc-sports-day')
    fireEvent.click(await screen.findByRole('button', { name: /보완 초안 만들기/ }))
    await screen.findByText('공고에 이미 있음')
    const boxes = [...document.querySelectorAll<HTMLInputElement>('.draft-include input')]
    expect(boxes.map((box) => box.checked)).toEqual([true, false])
    fireEvent.click(screen.getByText('본문으로 건너뛰기'))
    expect(document.activeElement?.id).toBe('main')
    // 화면 주소가 아닌 #main으로 바뀌어도 보던 화면에 머문다
    window.location.hash = '#main'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(screen.getByRole('heading', { level: 1, name: '보호자 질문' })).toBeTruthy()
  })

  it('도우미가 실패하면 서버의 오류 문장을 보여 준다', async () => {
    serve({
      'GET /admin/programs': () => json({ now: '', programs: [SPORTS] }),
      'POST /admin/programs/osan-fc-sports-day/improve': () => json({ error: '공고 보완 도우미가 지금 답할 수 없습니다. 잠시 후 다시 시도해 주세요.' }, 503),
    })
    open('#questions/osan-fc-sports-day')
    fireEvent.click(await screen.findByRole('button', { name: /보완 초안 만들기/ }))
    expect(await screen.findByText('공고 보완 도우미가 지금 답할 수 없습니다. 잠시 후 다시 시도해 주세요.')).toBeTruthy()
  })
})

describe('AI 편성 제안', () => {
  const PLAN: PlanResult = {
    passed: true, rounds: 2, model: 'test', data_note: '시연용 가상 응답 400가정 · 가상 장소 9곳 (실제 통계 아님)',
    steps: [{ tool: 'read_demand', ok: true, label: '초1~6' }, { tool: 'read_questions', ok: true }, { tool: 'read_programs', ok: true }, { tool: 'simulate_plan', ok: true, label: '초1~4 · 한국어' }, { tool: 'check_plan', ok: false, problems: 1 }, { tool: 'submit_plan', ok: true, problems: 0 }],
    proposals: [{
      id: 'plan-1', rank: 2, title: '초등 1~4학년 한국어 놀이 교실', interest: 'korean_study', interest_label: '한국어', grade_range: [1, 4], class_count: 2, capacity: 12,
      classes: [
        { n: 1, slot: 'wed-evening', when: '수요일 저녁', venue_id: 'v-sinjang-gym', venue: '신장동 체육관', dong: '신장동', reach: '33가정', reach_count: { suppressed: false, value: 33 }, expected: '약 9명', expected_people: 9.2, over_capacity: false },
        { n: 2, slot: 'mon-evening', when: '월요일 저녁', venue_id: 'v-sinjang-family', venue: '신장동 가족센터', dong: '신장동', reach: '30가정', reach_count: { suppressed: false, value: 30 }, expected: '약 8명', expected_people: 8.4, over_capacity: false },
      ],
      eligible: 131, covered: '54가정', covered_count: { suppressed: false, value: 54 }, coverage_pct: 41, baseline: { label: '지금처럼 모두 토요일 오전', covered: '29가정', coverage_pct: 22 }, gain: 25,
      language_support: [{ language: 'vi', label: '베트남어' }], language_needs: [], teaching: [], warnings: [],
      reasons: [{ text: '한국어에 관심 표시한 가정이 121가정인데 한국어 공고는 1개예요.', facts: [{ id: 'd1.interest.korean_study', label: '초1~6 · 한국어에 관심 표시한 가정', value: '121가정' }] }],
      problems: [],
    }],
  }

  it('보호자 질문을 보내 편성안을 받고, 숫자의 근거와 지금 관행과의 비교를 보여 주며, 추천 화면으로 넘긴다', async () => {
    serve({ 'GET /admin/programs': () => json({ now: '', programs: [SPORTS] }), 'POST /admin/planning/propose': () => json(PLAN) })
    open('#plan')
    expect(await screen.findByText('보호자 익명 통계')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'AI 편성안 만들기' }))
    expect(await screen.findByText('초등 1~4학년 한국어 놀이 교실')).toBeTruthy()
    const sent = JSON.parse(String(calls.find((entry) => entry.url.endsWith('/admin/planning/propose'))!.init!.body))
    expect(sent.questions[0]).toEqual({ question_ko: '참가비가 있나요?', topic: 'other', count: 9 })
    expect(screen.getByText('편성 계산 · 초1~4 · 한국어')).toBeTruthy()
    expect(screen.getByText('코드 검사 통과 (2회 검사) · 근거의 숫자가 모두 도구 결과와 같아요')).toBeTruthy()
    expect(screen.getAllByText('41%').length).toBeGreaterThan(0)
    expect(screen.getByText('+25가정')).toBeTruthy()
    expect(screen.getByTitle('초1~6 · 한국어에 관심 표시한 가정').textContent).toContain('121가정')
    // 히트맵이 편성안 대상으로 바뀌고 반 번호가 표시된다
    expect(screen.getByText('편성안 대상 한국어 · 초1~4 · 131가정의 가능 시간과 편성안의 반(번호)이에요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /일정·장소 추천에서 자세히 보기/ }))
    expect(window.location.hash).toBe('#recommend')
    expect(await screen.findByRole('radio', { name: '2개 반', checked: true })).toBeTruthy()
    // 편성안이 고른 안(2안)을 펼친다
    expect(screen.getByRole('tab', { name: '2안' }).getAttribute('aria-selected')).toBe('true')
    // 추천 화면을 다녀와도 편성안이 남는다
    fireEvent.click(screen.getByRole('link', { name: /AI 편성 제안/ }))
    expect(await screen.findByText('초등 1~4학년 한국어 놀이 교실')).toBeTruthy()
  })

  it('실행 중에 다른 메뉴로 갔다 와도 실행이 끊기지 않고 결과가 남는다', async () => {
    let finish: (response: Response) => void = () => {}
    serve({ 'GET /admin/programs': () => json({ now: '', programs: [SPORTS] }), 'POST /admin/planning/propose': () => new Promise<Response>((resolve) => { finish = resolve }) })
    open('#plan')
    fireEvent.click(await screen.findByRole('button', { name: 'AI 편성안 만들기' }))
    expect(await screen.findByText(/편성을 계산하고 있어요/)).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: /수요 현황/ }))
    finish(json(PLAN))
    await waitFor(() => expect(window.location.hash).toBe('#demand'))
    fireEvent.click(screen.getByRole('link', { name: /AI 편성 제안/ }))
    expect(await screen.findByText('초등 1~4학년 한국어 놀이 교실')).toBeTruthy()
  })

  it('편성 도우미가 실패하면 서버의 오류 문장을 보여 준다', async () => {
    serve({ 'GET /admin/programs': () => json({ now: '', programs: [] }), 'POST /admin/planning/propose': () => json({ error: '편성 도우미가 지금 답할 수 없습니다. 잠시 후 다시 시도해 주세요.' }, 503) })
    open('#plan')
    fireEvent.click(await screen.findByRole('button', { name: 'AI 편성안 만들기' }))
    expect(await screen.findByText('편성 도우미가 지금 답할 수 없습니다. 잠시 후 다시 시도해 주세요.')).toBeTruthy()
  })
})
