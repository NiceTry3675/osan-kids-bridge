import { mkdtempSync, rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PLAN, DEMO_RESPONSES, recommend, SUPPRESSION_THRESHOLD, VENUES } from '@osan-kids-bridge/planning'
import { checkPlan, FactLedger, numbersIn, parseProposals } from '../src/admin/plan-check'
import type { ProposalDraft, Simulation } from '../src/admin/plan-check'
import { MAX_SIMULATIONS, parsePlanRequest, readDemand, readPrograms, readQuestions, runPlanner, sessionSlot, simulatePlan, withoutNumbers } from '../src/admin/planner'
import type { PlanInput, PlanResult } from '../src/admin/planner'
import { generateWithTools } from '../src/llm/gemini'
import { createServer } from '../src/server'
import { saveRecord } from '../src/store'
import type { ProgramRecord } from '../src/types'

vi.mock('../src/llm/gemini', () => ({ generateWithTools: vi.fn(), generateJson: vi.fn(), generateText: vi.fn(), modelName: () => 'test-model' }))
const mockedTurn = vi.mocked(generateWithTools)

// 2026-10-15(목) 12:00, Asia/Seoul
const NOW = new Date('2026-10-15T03:00:00Z')

const QUESTIONS = [
  { question_ko: '베트남어 통역이 있나요?', topic: 'korean_level' as const, count: 8 },
  { question_ko: 'A반과 B반을 모두 신청할 수 있나요?', topic: 'schedule' as const, count: 6 },
]

function program(id: string, category: ProgramRecord['category'], date: string, start: string, overrides: Partial<ProgramRecord> = {}): ProgramRecord {
  return {
    program_id: id, title: `${id} 프로그램`, institution: '오산시가족센터', category, audience: 'child', target_type: 'all', target_raw: '초등학생', description: '',
    grade_range: [1, 6], age_range: null, eligibility_requirements: [], guardian_companion: 'unknown', sibling_companion: 'unknown', korean_level_required: null,
    support_languages: null, application_languages: null,
    sessions: [{ id: `${id}-s1`, date, start_time: start, end_time: null, place_name: '센터', dong: '남촌동', online: false }],
    period_start: null, period_end: null, session_count: 1, attendance_rule: 'all_sessions', mid_join_allowed: null, cost_krw: null, cost_raw: null, capacity: 20,
    application_start: null, application_end: null, application_methods: [], uncertain_items: [], notices: [], evidence: [], summaries_by_language: {},
    source: { url: null, retrieved_at: null, files: [], content_hash: id }, extracted_at: '2026-10-14T00:00:00Z', model: 'test', warnings: [],
    review: { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null },
    ...overrides,
  }
}

const RECORDS = [
  program('sat-craft', 'experience_culture', '2026-10-24', '10:00'),
  program('sat-art', 'sports_arts', '2026-10-31', '10:30'),
  program('korean', 'korean_study', '2026-11-14', '10:30'),
  program('old-music', 'sports_arts', '2026-05-06', '16:00'),
  // 아이 대상 편성 비교에서 빠지는 공고: 성인 대상, 중·고등 대상, 운영 기간이 지난(회차 없음) 공고
  program('adult-class', 'experience_culture', '2026-10-24', '10:00', { audience: 'adult', grade_range: null }),
  program('high-school', 'career', '2026-11-07', '10:00', { grade_range: [7, 9] }),
  program('past-period', 'experience_culture', '2026-10-24', '10:00', { sessions: [], period_end: '2026-10-13' }),
]

/** 출력 안의 {fact, value}를 모두 모은다 */
function factsIn(value: unknown, found: { fact: string; value: number }[] = []): { fact: string; value: number }[] {
  if (Array.isArray(value)) value.forEach((item) => factsIn(item, found))
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.fact === 'string' && typeof record.value === 'number') found.push({ fact: record.fact, value: record.value })
    else Object.values(record).forEach((item) => factsIn(item, found))
  }
  return found
}

describe('편성 도우미의 도구', () => {
  it('수요 통계는 1~4가정 칸을 숫자 없이 내보내고, 내보낸 숫자는 모두 fact로 남긴다', () => {
    const ledger = new FactLedger()
    // 좁은 대상(초5~6 · 진로)이라 가린 칸이 생긴다
    const output = readDemand({ grade_band: '5-6', interest: 'career' }, ledger, 1)
    const facts = factsIn(output)
    expect(facts.length).toBeGreaterThan(5)
    for (const { fact, value } of facts) {
      expect(ledger.get(fact)?.value).toBe(value)
      expect(value === 0 || value >= SUPPRESSION_THRESHOLD).toBe(true)
    }
    expect(JSON.stringify(output)).toContain('5가정 미만')
    expect(ledger.size).toBe(facts.length)
  })

  it('전체 수요에는 분야별 관심 가정이 함께 나온다', () => {
    const ledger = new FactLedger()
    const output = readDemand({ grade_band: '1-6', interest: 'all' }, ledger, 1) as { households: { value: number }; interests: { interest: string; households: { value: number } }[] }
    expect(output.households.value).toBe(DEMO_RESPONSES.length)
    expect(output.interests.find((item) => item.interest === 'korean_study')?.households.value)
      .toBe(DEMO_RESPONSES.filter((response) => response.interests.includes('korean_study')).length)
  })

  it('질문은 주제별 합계와 문장별 건수를 fact로 낸다', () => {
    const ledger = new FactLedger()
    const output = readQuestions(QUESTIONS, ledger)
    expect(output.topics.map((topic) => [topic.topic, topic.asked_by.value])).toEqual([['korean_level', 8], ['schedule', 6]])
    expect(ledger.get('q.1')?.value).toBe(8)
  })

  it('지금 공고는 운영이 끝난 것과 초등 아이 대상이 아닌 것을 빼고 분야·요일 시간대별로 센다', () => {
    const ledger = new FactLedger()
    const output = readPrograms(RECORDS, ledger, NOW)
    expect(output.open_programs.value).toBe(3)
    expect(output.by_interest.map((item) => [item.interest, item.programs.value])).toEqual([['experience_culture', 1], ['korean_study', 1], ['sports_arts', 1], ['career', 0]])
    expect(output.by_slot.map((slot) => [slot.slot, slot.programs.value])).toEqual([['sat-morning', 3]])
    const listed = (id: string) => output.programs.find((item) => item.title.startsWith(id))!
    expect(listed('old-music').ended).toBe(true)
    expect(listed('past-period').ended).toBe(true)
    expect(listed('adult-class')).toMatchObject({ audience: '성인', not_primary_children: true })
    expect(listed('high-school').not_primary_children).toBe(true)
  })

  it('회차의 날짜·시작 시각을 요일·시간대 칸으로 바꾼다', () => {
    expect(sessionSlot('2026-10-31', '10:00')).toBe('sat-morning')
    expect(sessionSlot('2026-10-14', '19:00')).toBe('wed-evening')
    expect(sessionSlot('2026-10-14', '05:00')).toBeNull()
    expect(sessionSlot(null, '10:00')).toBeNull()
  })

  it('편성 계산은 기존 추천 계산과 같은 숫자를 내고, 정해진 횟수까지만 돈다', () => {
    const ledger = new FactLedger()
    const simulations = new Map<string, Simulation>()
    const output = simulatePlan({ interest: 'korean_study', grade_range: [4, 1], class_count: 3, capacity: 12 }, ledger, simulations) as { simulation_id: string; options: { covered: { value: number } }[] }
    const expected = recommend(DEMO_RESPONSES, VENUES, { interest: 'korean_study', gradeRange: [1, 4], classCount: 3, capacity: 12, venueIds: VENUES.map((venue) => venue.id), baseline: DEFAULT_PLAN.baseline })
    expect(output.simulation_id).toBe('s1')
    expect(output.options.map((option) => option.covered.value)).toEqual(expected.recommendations.map((item) => item.covered))
    expect(ledger.get('s1.r1.gain')?.value).toBe(expected.recommendations[0].baselineDelta)
    expect(simulatePlan({ interest: 'korean_study', grade_range: [1, 9], class_count: 3, capacity: 12 }, ledger, simulations)).toEqual({ error: 'grade_range는 1~6 사이 학년 두 개여야 합니다.' })
    for (let i = 1; i < MAX_SIMULATIONS; i++) simulatePlan({ interest: 'all', grade_range: [1, 6], class_count: 1, capacity: 15 }, ledger, simulations)
    expect(simulatePlan({ interest: 'all', grade_range: [1, 6], class_count: 1, capacity: 15 }, ledger, simulations)).toHaveProperty('error')
  })

  it('닿는 가정이 가려진(1~4) 칸이면 비율·차이도 내지 않아, 빼거나 곱해서 가린 값을 알아낼 수 없다', () => {
    const ledger = new FactLedger()
    const simulations = new Map<string, Simulation>()
    // 초6 · 체험·문화 · 1개 반: 지금처럼 토요일 오전에 열면 닿는 가정이 5 미만
    const output = simulatePlan({ interest: 'experience_culture', grade_range: [6, 6], class_count: 1, capacity: 15 }, ledger, simulations) as { baseline: { covered: unknown; coverage_pct: unknown }; options: Record<string, unknown>[] }
    expect(output.baseline).toMatchObject({ covered: '5가정 미만', coverage_pct: '가림' })
    expect(ledger.get('s1.base.pct')).toBeUndefined()
    expect(output.options.every((option) => option.more_than_baseline === undefined && option.less_than_baseline === undefined)).toBe(true)
    expect([...Array(3).keys()].every((at) => ledger.get(`s1.r${at + 1}.gain`) === undefined)).toBe(true)
  })

  it('계산이 만든 안내 문장은 숫자를 지워 모델에 주고, 정원·반별 예상 신청은 fact로 준다', () => {
    expect(withoutNumbers('베트남어 안내 필요 20가정: 모집 안내문을 번역하세요.')).toBe('베트남어 안내 필요: 모집 안내문을 번역하세요.')
    expect(withoutNumbers('중국어 안내 필요(가정 수는 가림): 통역 연락처를 준비하세요.')).toBe('중국어 안내 필요: 통역 연락처를 준비하세요.')
    expect(withoutNumbers('한국어 수준 응답 중 초급이 46%예요. 보조교사를 두세요.')).toBe('한국어 수준 응답 중 초급 비율이 높아요. 보조교사를 두세요.')
    const ledger = new FactLedger()
    const output = simulatePlan({ interest: 'all', grade_range: [1, 6], class_count: 2, capacity: 12 }, ledger, new Map()) as { capacity: { fact: string }; options: { classes: { expected_signups: unknown; over_capacity: boolean }[]; language_needs: string[]; teaching: string[] }[] }
    expect(ledger.get(output.capacity.fact)).toMatchObject({ value: 12, unit: '명' })
    expect(output.options[0].classes.some((item) => item.over_capacity)).toBe(true)
    expect(JSON.stringify(output.options.map((option) => [option.language_needs, option.teaching]))).not.toMatch(/\d/)
  })

  it('지금 관행보다 덜 닿으면 차이를 loss로, 크기만 남긴다', () => {
    const ledger = new FactLedger()
    const simulations = new Map<string, Simulation>()
    simulatePlan({ interest: 'sports_arts', grade_range: [1, 1], class_count: 1, capacity: 15 }, ledger, simulations)
    const result = simulations.get('s1')!.result
    const lower = result.recommendations.find((item) => item.baselineDelta !== undefined && item.baselineDelta < 0)!
    expect(ledger.get(`s1.r${lower.rank}.loss`)?.value).toBe(-lower.baselineDelta!)
    expect(ledger.get(`s1.r${lower.rank}.gain`)).toBeUndefined()
  })
})

describe('편성안의 코드 검사', () => {
  const ledger = new FactLedger()
  const simulations = new Map<string, Simulation>()
  readDemand({ grade_band: '1-6', interest: 'all' }, ledger, 1)
  readPrograms(RECORDS, ledger, NOW)
  simulatePlan({ interest: 'korean_study', grade_range: [1, 4], class_count: 2, capacity: 12 }, ledger, simulations)
  const context = { ledger, simulations }
  const value = (id: string) => ledger.get(id)!.value
  const good = (): ProposalDraft => ({
    simulation_id: 's1', rank: 1, title: '초등 1~4학년 한국어 놀이 교실', language_support: ['vi'],
    reasons: [
      { text: `한국어에 관심 표시한 가정이 ${value('d1.interest.korean_study')}가정인데 한국어 공고는 ${value('p.interest.korean_study')}개예요.`, facts: ['d1.interest.korean_study', 'p.interest.korean_study'] },
      { text: `평일 저녁 2반이면 대상 가정의 ${value('s1.r1.pct')}%에 닿아요.`, facts: ['s1.r1.pct'] },
    ],
  })

  it('계산 결과에서 고르고 숫자를 fact 그대로 쓴 편성안은 통과한다', () => {
    expect(checkPlan([good()], context)).toEqual({ problems: [[]], general: [] })
  })

  it('인용하지 않았거나 직접 계산한 숫자, 없는 fact를 잡는다', () => {
    const derived = value('s1.r1.covered') - value('s1.base.covered')
    const bad = good()
    bad.reasons[1] = { text: `토요일 오전보다 ${derived}가정 더 닿아요.`, facts: ['s1.r1.covered', 's1.base.covered'] }
    bad.reasons.push({ text: '전체 400가정 중 일부예요.', facts: ['d9.total'] })
    const problems = checkPlan([bad], context).problems[0]
    expect(problems).toContain(`근거 2: 숫자 ${derived}는 인용한 fact의 값이 아닙니다. 도구 결과에 {fact, value}로 나온 숫자만 그대로 쓰고 그 fact를 인용하세요(직접 계산한 숫자는 쓰지 않습니다).`)
    expect(problems.some((problem) => problem.includes('fact "d9.total"는 도구 결과에 없습니다'))).toBe(true)
    // 수요·공고 숫자만 인용하고 이 안의 계산 결과는 인용하지 않으면 받지 않는다
    const noResult = good()
    noResult.reasons[1] = { text: '토요일 오전에 공고가 몰려 있어요.', facts: ['p.slot.sat-morning'] }
    expect(checkPlan([noResult], context).problems[0]).toEqual(['적어도 한 근거는 이 편성안의 계산 결과(s1.r1.covered·pct·gain 같은 fact)를 인용해야 합니다.'])
  })

  it('단정·개인 정보 표현, 숫자를 넣은 제목, 없는 안, 같은 안 두 번을 잡는다', () => {
    const bad = good()
    bad.reasons[0] = { ...bad.reasons[0], text: `${bad.reasons[0].text} 참여를 보장해요. 국적별로 나눠요.` }
    bad.title = '수요일 저녁 72가정 교실'
    const problems = checkPlan([bad], context).problems[0]
    expect(problems).toContain("근거 1: '보장'는 쓰지 않습니다(단정이나 받지 않는 개인 정보).")
    expect(problems).toContain("근거 1: '국적'는 쓰지 않습니다(단정이나 받지 않는 개인 정보).")
    expect(problems.some((problem) => problem.startsWith('title의 숫자 72'))).toBe(true)
    expect(checkPlan([{ ...good(), rank: 4 }], context).problems[0][0]).toContain('s1에 4안이 없습니다')
    expect(checkPlan([{ ...good(), simulation_id: 's7' }], context).problems[0][0]).toContain('simulate_plan 결과에 없습니다')
    expect(checkPlan([good(), good()], context).general).toContain('같은 계산 결과의 같은 안을 두 번 냈습니다. 서로 다른 안을 고르세요.')
  })

  it('숫자 토큰은 세 자리 쉼표만 천 단위로 읽고, 전각 숫자도 읽는다', () => {
    expect(numbersIn('1,234가정 중 48%, 2.5칸')).toEqual([1234, 48, 2.5])
    expect(numbersIn('1,2반')).toEqual([1, 2])
    expect(numbersIn('４가정')).toEqual([4])
  })

  it('한글로 쓴 수, 전각 숫자, 단위가 다른 숫자, 학년·반 자리 밖의 1~4를 잡는다', () => {
    const own = { text: `평일 저녁 2개 반이면 대상 가정의 ${value('s1.r1.pct')}%에 닿아요.`, facts: ['s1.r1.pct'] }
    const check = (text: string, facts = ['s1.r1.pct']) => checkPlan([{ ...good(), reasons: [own, { text, facts }] }], context).problems[0]
    expect(check('수요일 오후에 되는 가정은 네 가정뿐이에요.').some((problem) => problem.includes("'네 가정'처럼 수를 한글로"))).toBe(true)
    expect(check('열두 명이 물었어요.').some((problem) => problem.includes("'열두 명'"))).toBe(true)
    expect(check('수요일 오후는 ４가정이에요.').some((problem) => problem.includes('숫자 4는 인용한 fact의 값이 아닙니다'))).toBe(true)
    expect(check(`토요일 오전보다 ${value('s1.r1.pct')}가정 더 닿아요.`)).toContain(`근거 2: 숫자 ${value('s1.r1.pct')}가정의 단위가 인용한 fact(%)와 다릅니다.`)
    // 대상 학년(1~4)·반(1·2반)을 말하는 자리는 받지만, 같은 숫자를 가정 수로 쓰면 fact가 있어야 한다
    expect(check('1~4학년 아이를 1반과 2반으로 나눠요.')).toEqual([])
    expect(check('토요일 오전에는 3가정만 닿아요.').some((problem) => problem.includes('숫자 3는 인용한 fact의 값이 아닙니다'))).toBe(true)
    // 띄어 써도 단정 표현을 잡는다
    const spaced = check('모든가정이 확 실히 올 수 있어요.')
    expect(spaced).toHaveLength(2)
    expect(spaced).toEqual(expect.arrayContaining(["근거 2: '확실'는 쓰지 않습니다(단정이나 받지 않는 개인 정보).", "근거 2: '모든가정'는 쓰지 않습니다(단정이나 받지 않는 개인 정보)."]))
  })

  it('수가 아닌 말(지시어 \'이\', 일반적인 \'한 가정\', \'열다\')과 학년대·반·안 번호 표현은 숫자로 보지 않는다', () => {
    const own = { text: `평일 저녁 2개 반이면 대상 가정의 ${value('s1.r1.pct')}%에 닿아요.`, facts: ['s1.r1.pct'] }
    const check = (text: string, facts = ['s1.r1.pct']) => checkPlan([{ ...good(), reasons: [own, { text, facts }] }], context).problems[0]
    for (const text of ['이 반은 평일 저녁이라 맞벌이 가정에 닿기 쉬워요.', '한 가정이 여러 분야를 고를 수 있어요.', '새로 열 반은 평일 저녁이에요.', '1학년부터 4학년까지 함께 받아요.', '1·2반은 같은 동에서 열어요.', '1안은 반 2개예요.', '초1~초4 아이가 대상이에요.']) {
      expect(check(text), text).toEqual([])
    }
    // 다른 학년대의 수요를 말할 때도 그 학년대 표현은 받는다 (숫자는 fact로)
    expect(check(`초1~6 응답은 ${value('d1.total')}가정이에요.`, ['d1.total'])).toEqual([])
    // 같은 뜻의 단위('가구', '프로')와 한글 수(삼십 프로, 마흔두 가구)도 잡는다
    expect(check(`대상 가정 중 ${value('s1.r1.pct')}가구에 닿아요.`).some((problem) => problem.includes('단위가 인용한 fact(%)와 다릅니다'))).toBe(true)
    expect(check('대상 가정의 삼십 프로에 닿아요.').some((problem) => problem.includes("'삼십 프로'"))).toBe(true)
    expect(check('마흔두 가구에 닿아요.').some((problem) => problem.includes("'마흔두 가구'"))).toBe(true)
    // '연초'의 '초'는 학년이 아니다
    expect(check('연초 3가정이 물었어요.').some((problem) => problem.includes('숫자 3는'))).toBe(true)
  })

  it('지금 관행과의 차이는 인용한 방향(더·덜)과 맞게 써야 하고, 단정을 부정하는 말은 받는다', () => {
    const gain = { text: `토요일 오전보다 ${value('s1.r1.gain')}가정 덜 닿아요.`, facts: ['s1.r1.gain'] }
    expect(checkPlan([{ ...good(), reasons: [good().reasons[1], gain] }], context).problems[0]).toContain("근거 2: 인용한 차이(gain)는 더 닿는 가정 수입니다. '덜·적게'로 쓰지 마세요.")
    const hedge = { text: '닿는다고 참여가 보장되지는 않아요. 평일 오후 수요는 불확실해요.', facts: ['s1.r1.pct'] }
    expect(checkPlan([{ ...good(), reasons: [good().reasons[1], hedge] }], context).problems[0]).toEqual([])
    const visa = { text: '비자 종류별로 나눠요. 보·장해요.', facts: ['s1.r1.pct'] }
    expect(checkPlan([{ ...good(), reasons: [good().reasons[1], visa] }], context).problems[0]).toEqual(["근거 2: '비자'는 쓰지 않습니다(단정이나 받지 않는 개인 정보).", "근거 2: '보장'는 쓰지 않습니다(단정이나 받지 않는 개인 정보)."])
  })

  it('제목은 이 안의 대상 학년·반 수만 숫자로 쓰고, 금지어를 넣지 못한다', () => {
    expect(checkPlan([{ ...good(), title: '초등 1~3학년 한국어 교실' }], context).problems[0].some((problem) => problem.startsWith('title의 숫자 3'))).toBe(true)
    expect(checkPlan([{ ...good(), title: '국적별 맞춤 교실' }], context).problems[0]).toContain("title: '국적'는 쓰지 않습니다(단정이나 받지 않는 개인 정보).")
    expect(checkPlan([{ ...good(), title: '초1~4 한국어 2개 반' }], context).problems[0]).toEqual([])
  })

  it('모델이 보낸 모양이 틀려도 읽다가 멈추지 않는다', () => {
    expect(parseProposals([{ simulation_id: 3, rank: '1', reasons: 'x' }, null])).toEqual([
      { simulation_id: '', rank: 0, title: '', language_support: [], reasons: [] },
      { simulation_id: '', rank: 0, title: '', language_support: [], reasons: [] },
    ])
  })
})

describe('편성 도우미 (에이전트)', () => {
  const turn = (calls: { name: string; args?: Record<string, unknown> }[]) => ({
    calls: calls.map((call, index) => ({ name: call.name, args: call.args ?? {}, id: `c${index}` })),
    text: null,
    content: { role: 'model', parts: [{ text: 'call' }] },
  })
  const simulation = { interest: 'korean_study', grade_range: [1, 4], class_count: 2, capacity: 12 }
  const expected = recommend(DEMO_RESPONSES, VENUES, { interest: 'korean_study', gradeRange: [1, 4], classCount: 2, capacity: 12, venueIds: VENUES.map((venue) => venue.id), baseline: DEFAULT_PLAN.baseline!.slice(0, 2) })
  const pct = Math.round(expected.recommendations[0].coverageRate * 100)
  const proposal = (text: string) => ({ simulation_id: 's1', rank: 1, title: '초등 1~4학년 한국어 놀이 교실', language_support: ['vi', 'zh'], reasons: [
    { text: '베트남어 통역 문의가 8건 있었어요.', facts: ['q.1'] },
    { text, facts: ['s1.r1.pct'] },
  ] })

  beforeEach(() => mockedTurn.mockReset())

  it('통계·질문·공고를 읽고 계산한 뒤, 검사에서 걸린 숫자를 고쳐 제출한다. 카드의 숫자는 코드가 다시 만든다', async () => {
    mockedTurn
      .mockResolvedValueOnce(turn([{ name: 'read_demand', args: { grade_band: '1-6', interest: 'all' } }, { name: 'read_questions' }, { name: 'read_programs' }]))
      .mockResolvedValueOnce(turn([{ name: 'simulate_plan', args: simulation }]))
      .mockResolvedValueOnce(turn([{ name: 'check_plan', args: { proposals: [proposal(`대상 가정의 ${pct + 7}%에 닿아요.`)] } }]))
      .mockResolvedValueOnce(turn([{ name: 'submit_plan', args: { proposals: [proposal(`대상 가정의 ${pct}%에 닿아요.`)] } }]))
    const result = await runPlanner({ records: RECORDS, questions: QUESTIONS, now: NOW })
    expect(result.passed).toBe(true)
    expect(result.rounds).toBe(2)
    expect(result.steps.map((step) => `${step.tool}:${step.ok}${step.label ? `:${step.label}` : ''}`)).toEqual([
      'read_demand:true:초1~6', 'read_questions:true', 'read_programs:true', 'simulate_plan:true:초1~4 · 한국어', 'check_plan:false', 'submit_plan:true',
    ])
    const [card] = result.proposals
    expect(card.classes.map((item) => [item.slot, item.venue_id])).toEqual(expected.recommendations[0].options.map((option) => [option.slot, option.venueId]))
    expect(card.coverage_pct).toBe(pct)
    expect(card.gain).toBe(expected.recommendations[0].baselineDelta)
    expect(card.reasons[1].facts).toEqual([{ id: 's1.r1.pct', label: '초1~4 · 한국어 1안이 닿는 비율(대상 가정 중)', value: `${pct}%` }])
    expect(card.language_support.map((item) => item.label)).toEqual(['베트남어', '중국어'])
    expect(result.data_note).toContain('가상 응답')
    // 코드 검사의 문제가 모델에 돌아갔다
    expect(JSON.stringify(mockedTurn.mock.calls[3][0].contents)).toContain(`숫자 ${pct + 7}는 인용한 fact의 값이 아닙니다`)
    expect(mockedTurn.mock.calls[0][0].system).toContain('요일·시간·장소를 직접 정하지 않는다')
  })

  it('끝내 통과하지 못하면 마지막 편성안을 문제와 함께 돌려준다', async () => {
    mockedTurn
      .mockResolvedValueOnce(turn([{ name: 'read_questions' }, { name: 'simulate_plan', args: simulation }]))
      .mockResolvedValue(turn([{ name: 'submit_plan', args: { proposals: [proposal('대상 가정의 99%에 닿아요.')] } }]))
    const result = await runPlanner({ records: RECORDS, questions: QUESTIONS, now: NOW })
    expect(result.passed).toBe(false)
    expect(result.proposals[0].problems).toContain('근거 2: 숫자 99는 인용한 fact의 값이 아닙니다. 도구 결과에 {fact, value}로 나온 숫자만 그대로 쓰고 그 fact를 인용하세요(직접 계산한 숫자는 쓰지 않습니다).')
  })

  it('검사까지 한 뒤 모델 호출이 실패하면 검사한 편성안을 돌려주고, 아무것도 못 했으면 실패로 올린다', async () => {
    mockedTurn
      .mockResolvedValueOnce(turn([{ name: 'read_questions' }, { name: 'simulate_plan', args: simulation }]))
      .mockResolvedValueOnce(turn([{ name: 'check_plan', args: { proposals: [proposal(`대상 가정의 ${pct}%에 닿아요.`)] } }]))
      .mockRejectedValueOnce(new Error('This operation was aborted'))
    const result = await runPlanner({ records: RECORDS, questions: QUESTIONS, now: NOW })
    expect(result).toMatchObject({ passed: false, rounds: 1 })
    expect(result.proposals[0].problems).toEqual([])
    mockedTurn.mockReset()
    mockedTurn.mockRejectedValueOnce(new Error('This operation was aborted'))
    await expect(runPlanner({ records: RECORDS, questions: QUESTIONS, now: NOW })).rejects.toThrow('aborted')
  })

  it('도구 없이 글로 답하면 한 번 되돌리고, 그래도 글이면 빈 결과로 끝낸다', async () => {
    mockedTurn.mockResolvedValue({ calls: [], text: '토요일 오전이 좋아요', content: { role: 'model', parts: [{ text: '토요일 오전이 좋아요' }] } })
    const result = await runPlanner({ records: RECORDS, questions: [], now: NOW })
    expect(mockedTurn).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ passed: false, proposals: [], rounds: 0 })
  })

  it('모든 턴에 같은 120초 마감을 넘기고, 마감이 지나면 새 턴을 시작하지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const started = Date.now()
      // 턴마다 50초가 걸리는 상황: 0·50·100초에 시작한 세 턴 뒤, 150초에는 새 턴을 시작하지 않는다
      mockedTurn.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 50_000)
        return turn([{ name: 'read_questions' }])
      })
      const result = await runPlanner({ records: RECORDS, questions: QUESTIONS, now: NOW })
      expect(mockedTurn).toHaveBeenCalledTimes(3)
      for (const [options] of mockedTurn.mock.calls) expect(options.deadline).toBe(started + 120_000)
      expect(result).toMatchObject({ passed: false, proposals: [], rounds: 0 })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('편성 요청 본문', () => {
  it('질문 목록은 없어도 되고, 같은 문장은 합친다', () => {
    expect(parsePlanRequest({})).toEqual({ ok: true, questions: [] })
    expect(parsePlanRequest({ questions: [...QUESTIONS, { ...QUESTIONS[0], count: 2 }] })).toEqual({ ok: true, questions: [{ ...QUESTIONS[0], count: 10 }, QUESTIONS[1]] })
    expect(parsePlanRequest({ questions: [{ question_ko: '', topic: 'other' }] }).ok).toBe(false)
    expect(parsePlanRequest({ questions: [{ question_ko: '언제?', topic: 'weather' }] }).ok).toBe(false)
    expect(parsePlanRequest({ questions: 'x' }).ok).toBe(false)
  })
})

function call(port: number, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const text = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((done, fail) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers: { ...(text ? { 'Content-Type': 'application/json' } : {}), ...headers } }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        done({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null })
      })
    })
    req.on('error', fail)
    if (text !== undefined) req.write(text)
    req.end()
  })
}

describe('편성 도우미 API', () => {
  let dir = ''
  let server: Server
  let port = 0
  const planner = vi.fn(async (input: PlanInput): Promise<PlanResult> => ({ proposals: [], passed: true, rounds: 1, steps: [], model: 'fake', data_note: `${input.records.length}개 공고` }))

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'program-api-planning-'))
    for (const record of RECORDS) saveRecord(record, dir)
    server = createServer({ dataDir: dir, now: () => NOW, origins: [], log: () => {}, admin: true, planner })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  })

  it('기관의 모든 공고와 질문을 편성 도우미에 넘기고, 실패하면 503', async () => {
    const reply = await call(port, 'POST', '/admin/planning/propose', { questions: QUESTIONS })
    expect(reply.status).toBe(200)
    expect(reply.body.data_note).toBe(`${RECORDS.length}개 공고`)
    expect(planner).toHaveBeenCalledWith(expect.objectContaining({ questions: QUESTIONS, now: NOW }))
    planner.mockRejectedValueOnce(new Error('model down'))
    expect((await call(port, 'POST', '/admin/planning/propose', { questions: [] })).status).toBe(503)
  })

  it('형식이 틀린 본문, JSON이 아닌 본문, 다른 메서드는 받지 않는다', async () => {
    expect((await call(port, 'POST', '/admin/planning/propose', { questions: [{ question_ko: 'x', topic: 'weather' }] })).status).toBe(400)
    expect((await call(port, 'POST', '/admin/planning/propose', { questions: [] }, { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect((await call(port, 'GET', '/admin/planning/propose')).status).toBe(405)
  })
})
