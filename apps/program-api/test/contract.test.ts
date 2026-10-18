import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Program as GuardianProgram, SearchResponse as GuardianSearchResponse } from '../../guardian-web/src/data/types'
import { DEMO_NOW } from '../src/config'
import { addendumCovers, guardianMethods, guardianSummaries, guardianUncertainItems, uncertainTopic } from '../src/match/contract'
import { evaluateProgram } from '../src/match/evaluate'
import { searchPrograms } from '../src/match/search'
import { factsHash, isPublished, publicSummaries } from '../src/review/hash'
import { loadRecords } from '../src/store'
import type { Addendum, LanguageSummary, ProgramListing, ProgramPosters, ProgramRecord, ProgramResponse, SearchResponse } from '../src/types'

// API 응답이 보호자 웹(apps/guardian-web/src/data/types.ts)의 계약을 그대로 만족하는지.
// 아래 함수들은 타입 검사(npm run typecheck)에서 계약이 어긋나면 실패한다.
// 서버가 내보내는 공고(ProgramListing: 판정 결과 + 포스터 정보)와 검색 응답, 포스터·추가 안내 모양을 따로 확인한다.
export const asGuardianProgram = (program: ProgramResponse): GuardianProgram => program
export const asGuardianListing = (program: ProgramListing): GuardianProgram & { posters: NonNullable<GuardianProgram['posters']> } => program
export const asGuardianSearch = (response: SearchResponse): GuardianSearchResponse => response
export const asGuardianPosters = (posters: ProgramPosters): NonNullable<GuardianProgram['posters']> => posters
export const asGuardianAddenda = (addenda: ProgramResponse['addenda']): NonNullable<GuardianProgram['addenda']> => addenda

const NOW = new Date('2026-10-15T03:00:00Z')

function record(overrides: Partial<ProgramRecord> = {}): ProgramRecord {
  return {
    program_id: 'p-contract',
    title: '토요 체험',
    institution: '오산시가족센터',
    category: 'experience_culture',
    audience: 'child',
    target_type: 'multicultural_family',
    target_raw: '다문화가족 초등 1~3학년',
    description: '체험 프로그램',
    grade_range: [1, 3],
    age_range: null,
    eligibility_requirements: ['다문화가족'],
    guardian_companion: 'required',
    sibling_companion: 'unknown',
    korean_level_required: null,
    support_languages: null,
    application_languages: null,
    sessions: [{ id: 's1', date: '2026-10-17', start_time: '10:10', end_time: '12:00', place_name: '오산시가족센터', dong: '중앙동', online: false }],
    period_start: null,
    period_end: null,
    session_count: null,
    attendance_rule: 'choose_one',
    mid_join_allowed: null,
    cost_krw: 0,
    cost_raw: '무료',
    capacity: 20,
    application_start: '2026-10-01T09:00',
    application_end: '2026-10-20T18:00',
    application_methods: [],
    uncertain_items: [],
    evidence: [],
    summaries_by_language: {},
    source: { url: 'https://example.com/p', retrieved_at: '2026-10-14', files: [], content_hash: 'hash' },
    extracted_at: '2026-10-14T00:00:00Z',
    model: 'test',
    warnings: [],
    review: { status: 'approved', reviewed_at: '2026-10-14T01:00:00Z', reviewer: '검수자', notes: null, facts_hash: null },
    ...overrides,
  }
}

const summary = (overrides: Partial<LanguageSummary> = {}): LanguageSummary => ({
  lines: ['첫 줄이에요.', '둘째 줄이에요.', '셋째 줄이에요.'],
  status: 'machine_checked',
  generated_at: '2026-10-15T00:00:00Z',
  issues: [],
  ...overrides,
})

describe('기관에 확인할 점 (보호자 웹 UncertainItem)', () => {
  it('추출·판정이 만드는 한국어 항목을 보호자 웹의 주제로 옮긴다', () => {
    const cases: [string, string | null][] = [
      ['운영 날짜·시간', 'schedule'],
      ['운영 시간', 'schedule'],
      ['나머지 회차 일정 (총 12회 중 3회만 날짜 확인)', 'schedule'],
      ['전체 회차 수 (원문 총 12회, 일정 10개)', 'schedule'],
      ['회차 날짜와 운영 기간', 'schedule'],
      ['10월 3일 날짜와 요일(토) 불일치', 'schedule'],
      ['신청 마감(10월 31일)이 운영 종료일(10월 17일)보다 늦은 점', 'schedule'],
      ['중도 참여 확인 필요', 'schedule'],
      ['대상 학년·나이', 'age_grade'],
      ['자녀가 참여하는 프로그램인지 확인 필요', 'age_grade'],
      ['참여 대상·자격', 'family_eligibility'],
      ['참여 자격 확인 필요: 다문화가족, 오산시 거주', 'family_eligibility'],
      ['중도입국 자녀 참여 가능 여부', 'family_eligibility'],
      ['중도입국 자녀 몇 학년까지 참여 가능한지', 'age_grade'],
      ['중도입국 자녀 개강 후 참여 가능 여부', 'schedule'],
      ['중도에 참여 가능 여부', 'schedule'],
      ['중도 신청·등록 가능 여부', 'schedule'],
      ['중간에 합류해도 되는지', 'schedule'],
      ['여섯 살 참여 가능 여부', 'age_grade'],
      ['몇 살부터 참여 가능한지', 'age_grade'],
      ['타 지역 주민 참여 가능 여부', 'family_eligibility'],
      ['오산시에 살고 있지 않아도 되는지', 'family_eligibility'],
      ['공동생활가정 아동 참여 가능 여부', 'family_eligibility'],
      ['여동생도 참여 가능한지', 'companion'],
      ['만 5세대상 참여 가능 여부', 'age_grade'],
      ['5살아이 참여 가능 여부', 'age_grade'],
      ['결혼이민자 대상으로만 운영하는지', 'family_eligibility'],
      ['중도입국 후 체류 기간 조건', 'family_eligibility'],
      ['관내 거주 여부(관외 주민 참여 가능 여부)', 'family_eligibility'],
      ['관외자 참여 가능 여부', 'family_eligibility'],
      ['타 시민 참여 가능 여부', 'family_eligibility'],
      ['중도입국 자녀 입국 날짜 기준', 'family_eligibility'],
      ['결혼이민자 대상 수업 시간', 'schedule'],
      ['중도입국 청소년 대상 반 개강 후 참여 가능 여부', 'schedule'],
      ['중도입국 자녀 대상 반 중도 참여 가능 여부', 'schedule'],
      ['중도 참석 가능 여부', 'schedule'],
      ['중도 수강 가능 여부', 'schedule'],
      // 중도 참여·나이·거주를 묻지 않는 말
      ['중도 포기 시 환불 가능 여부', 'other'],
      ['중도 수강 포기 시 환불 가능 여부', 'other'],
      ['중도 수강료 환불 여부', 'other'],
      ['관외 체험활동 장소', 'other'],
      ['셔틀버스 타시는 곳', 'other'],
      ['총 몇 세션 참여해야 수료인지', 'other'],
      ['한살림 조합원 가입 필요 여부', 'other'],
      ['오산시에 살지 않는 가족 참여 가능 여부', 'family_eligibility'],
      ['7살 이하 동생 참여', 'companion'],
      ['만 7살 참여 가능 여부', 'age_grade'],
      ['보호자·형제자매 동반 가능 여부', 'companion'],
      ['보호자 동반 가능 여부', 'companion'],
      ['형제자매 동반 가능 여부', 'companion'],
      ['필요한 한국어 수준', 'korean_level'],
      ['준비물', 'materials'],
      ['오산시 밖 장소(경기도 화성시 동탄구 동탄대로 446 (청계동))', 'other'],
      ['주차 가능 여부', 'other'],
      // 보호자 웹이 비용 행·신청 상태·신청 버튼으로 이미 보여주는 것
      ['참가비', null],
      ['신청 기간', null],
      ['신청 시작일', null],
      ['신청 마감일', null],
      ['신청 방법', null],
    ]
    for (const [item, topic] of cases) expect([item, uncertainTopic(item)]).toEqual([item, topic])
  })

  it('같은 주제는 한 번만 보내고, 원문에서 찾은 관련 표현을 붙인다', () => {
    const source = record({
      evidence: [
        { field: 'eligibility_requirements', quote: '대상 : 오산시 거주 다문화가족', verified: true },
        { field: 'guardian_companion', quote: '보호자 동반 필수', verified: true },
        { field: 'period', quote: '찾지 못한 인용', verified: false },
      ],
    })
    const items = guardianUncertainItems(source, [
      '참여 대상·자격', '보호자·형제자매 동반 가능 여부', '운영 날짜·시간', '중도 참여 확인 필요', '참가비',
      '오산시 밖 장소(경기도 화성시 동탄대로 446)',
    ])
    expect(items).toEqual([
      { topic: 'family_eligibility', note_ko: '대상 : 오산시 거주 다문화가족' },
      { topic: 'companion', note_ko: '보호자 동반 필수' },
      { topic: 'schedule', note_ko: null },
      { topic: 'other', note_ko: '경기도 화성시 동탄대로 446' },
    ])
  })

  it('신청 기간을 묻는 항목은 운영 기간이 아니라 원문의 신청 기간 표현을 붙인다 (두 곳에 다르게 적혔으면 둘 다)', () => {
    const evidence = [
      { field: 'period', quote: '행사기간 : 2026-10-19 ~ 2026-12-04', verified: true },
      { field: 'application_period', quote: '접수기간 : 2026-10-01 00:00 ~ 2026-10-17 00:00', verified: true },
      { field: 'application_period', quote: '신청 기간: 2026. 9. 28.(월) ~ 10. 14.(수)', verified: true },
      { field: 'application_period', quote: '찾지 못한 인용', verified: false },
    ]
    expect(guardianUncertainItems(record({ evidence }), ['상단 접수기간과 본문 신청 기간의 불일치'])).toEqual([
      { topic: 'schedule', note_ko: '접수기간 : 2026-10-01 00:00 ~ 2026-10-17 00:00 / 신청 기간: 2026. 9. 28.(월) ~ 10. 14.(수)' },
    ])
    expect(guardianUncertainItems(record({ evidence: evidence.slice(0, 2) }), ['접수 마감 일시 불일치'])).toEqual([
      { topic: 'schedule', note_ko: '접수기간 : 2026-10-01 00:00 ~ 2026-10-17 00:00' },
    ])
    // 운영 일정이나 운영 종료일과 견주는 항목은 운영 기간 표현 그대로
    expect(guardianUncertainItems(record({ evidence }), ['운영 날짜·시간'])).toEqual([{ topic: 'schedule', note_ko: '행사기간 : 2026-10-19 ~ 2026-12-04' }])
    expect(guardianUncertainItems(record({ evidence }), ['신청 마감(10월 31일)이 운영 종료일(10월 17일)보다 늦은 점'])).toEqual([
      { topic: 'schedule', note_ko: '행사기간 : 2026-10-19 ~ 2026-12-04' },
    ])
    // 신청 기간 인용이 없으면 주제의 원문 표현으로 돌아간다
    expect(guardianUncertainItems(record({ evidence: evidence.slice(0, 1) }), ['신청 기간 불일치'])).toEqual([
      { topic: 'schedule', note_ko: '행사기간 : 2026-10-19 ~ 2026-12-04' },
    ])
  })

  it('응답에는 주제로 묶은 항목과 한국어 항목을 함께 담는다', () => {
    const program = evaluateProgram(record({ uncertain_items: ['형제자매 동반 가능 여부'] }), null, NOW)
    expect(program.uncertain_items_ko).toEqual(['형제자매 동반 가능 여부', '참여 자격 확인 필요: 다문화가족'])
    expect(program.uncertain_items).toEqual([{ topic: 'companion', note_ko: null }, { topic: 'family_eligibility', note_ko: null }])
  })

  it('기관이 덧붙인 안내는 확인할 점에서 빼고, 주제·문장·서울 기준 날짜만 응답에 담는다 (담당자 이름·질문은 뺀다)', () => {
    const addendum = {
      id: 'add-1', topic: 'companion' as const, text: '형제자매도 함께 올 수 있습니다.', resolves_questions: ['동생도 가도 되나요?'],
      resolves_items: ['형제자매 동반 가능 여부'], author: '김담당', added_at: '2026-10-15T16:30:00.000Z', drafted_by_ai: true,
    }
    const program = evaluateProgram(record({ uncertain_items: ['형제자매 동반 가능 여부'], addenda: [addendum] }), null, NOW)
    expect(program.addenda).toEqual([{ topic: 'companion', text: '형제자매도 함께 올 수 있습니다.', added_at: '2026-10-16', covers: ['companion'] }])
    expect(program.uncertain_items.map((item) => item.topic)).not.toContain('companion')
    expect(evaluateProgram(record(), null, NOW).addenda).toEqual([])
  })

  it('추가 안내마다 답한 주제(covers)를 붙인다: 푼 확인 항목의 주제와, 비용을 다루면 cost', () => {
    const addendum = (overrides: Partial<Addendum>): Addendum => ({
      id: 'add-1', topic: 'other', text: '', resolves_questions: [], resolves_items: [], author: '김담당', added_at: '2026-10-15T03:00:00.000Z', drafted_by_ai: true, ...overrides,
    })
    // 참가비 항목은 보호자 웹이 비용 행에 보여 주므로 주제는 없고 cost만
    expect(addendumCovers(addendum({ text: '참가비: 무료', resolves_items: ['참가비'] }))).toEqual(['cost'])
    expect(addendumCovers(addendum({ text: '재료비 1인 5,000원은 현장에서 받습니다.' }))).toEqual(['cost'])
    expect(addendumCovers(addendum({ text: '참가비는 1만 원입니다.' }))).toEqual(['cost'])
    expect(addendumCovers(addendum({ topic: 'materials', text: '준비물: 운동하기 편한 옷과 운동화', resolves_items: ['준비물'] }))).toEqual(['materials'])
    // 기타로 묶이는 항목은 주제로 넣지 않는다 (같은 기타의 다른 질문이 숨는다)
    expect(addendumCovers(addendum({ text: '형제자매도 함께 올 수 있습니다.', resolves_items: ['보호자·형제자매 동반 가능 여부', '주차 가능 여부'] }))).toEqual(['companion'])
    expect(addendumCovers(addendum({ text: '무료로 참여할 수 있어요.' }))).toEqual(['cost'])
    // '지원', '정원'의 '원'은 비용이 아니다
    expect(addendumCovers(addendum({ text: '베트남어 통역을 지원하고 정원은 그대로입니다.' }))).toEqual([])
  })

  it('참가비가 아닌 무료·비용·원은 cost로 보지 않는다', () => {
    const addendum = (overrides: Partial<Addendum>): Addendum => ({
      id: 'add-1', topic: 'other', text: '', resolves_questions: [], resolves_items: [], author: '김담당', added_at: '2026-10-15T03:00:00.000Z', drafted_by_ai: true, ...overrides,
    })
    expect(addendumCovers(addendum({ text: '주차는 무료예요.' }))).toEqual([])
    expect(addendumCovers(addendum({ text: '오산역에서 무료 셔틀버스가 다녀요.' }))).toEqual([])
    expect(addendumCovers(addendum({ topic: 'materials', text: '간식은 센터에서 무료로 드려요.' }))).toEqual(['materials'])
    expect(addendumCovers(addendum({ text: '1:1 원어민 선생님과 함께해요.' }))).toEqual([])
    expect(addendumCovers(addendum({ text: '문의는 031-372-1234 원장에게 해 주세요.' }))).toEqual([])
    expect(addendumCovers(addendum({ topic: 'companion', text: '형제자매도 올 수 있어요.', resolves_items: ['형제자매 동반 시 추가 비용'] }))).toEqual(['companion'])
  })

  it('한 항목만 푼 안내는 같은 주제의 남은 확인할 점을 숨기지 않는다', () => {
    const base = { id: 'add-1', resolves_questions: [], author: '김담당', added_at: '2026-10-15T03:00:00.000Z', drafted_by_ai: true }
    const partial = evaluateProgram(record({
      uncertain_items: ['준비물 확인 필요', '간식 제공 여부', '주차 가능 여부', '통역 지원 여부'],
      addenda: [
        { ...base, topic: 'materials', text: '준비물: 운동화', resolves_items: ['준비물 확인 필요'] },
        { ...base, id: 'add-2', topic: 'other', text: '주차할 수 있어요.', resolves_items: ['주차 가능 여부'] },
      ],
    }), null, NOW)
    expect(partial.uncertain_items_ko).toEqual(expect.arrayContaining(['간식 제공 여부', '통역 지원 여부']))
    expect(partial.uncertain_items_ko).not.toEqual(expect.arrayContaining(['준비물 확인 필요']))
    expect(partial.uncertain_items.map((item) => item.topic)).toEqual(expect.arrayContaining(['materials', 'other']))
    expect(partial.addenda?.map((addendum) => addendum.covers)).toEqual([[], []])
  })

  it('저장해 둔 번역은 있는 언어만 보호자 응답에 담는다', () => {
    const base = { id: 'add-1', topic: 'other' as const, text: '참가비: 무료', resolves_questions: [], resolves_items: ['참가비'], author: '김담당', added_at: '2026-10-15T03:00:00.000Z', drafted_by_ai: true }
    const both = evaluateProgram(record({ uncertain_items: ['참가비'], addenda: [{ ...base, translations: { vi: 'Phí tham gia: Miễn phí', zh: '参加费：免费' } }] }), null, NOW)
    expect(both.addenda).toEqual([{ topic: 'other', text: '참가비: 무료', added_at: '2026-10-15', covers: ['cost'], translations: { vi: 'Phí tham gia: Miễn phí', zh: '参加费：免费' } }])
    const viOnly = evaluateProgram(record({ addenda: [{ ...base, translations: { vi: 'Phí tham gia: Miễn phí', zh: ' ' } }] }), null, NOW)
    expect(viOnly.addenda[0].translations).toEqual({ vi: 'Phí tham gia: Miễn phí' })
    const none = evaluateProgram(record({ addenda: [{ ...base, translations: {} }] }), null, NOW)
    expect(none.addenda[0]).not.toHaveProperty('translations')
  })
})

describe('신청·문의 방법', () => {
  it('문의만 받는 연락처는 inquiry_methods로 나누고, 주소 없는 온라인 신청은 원문 주소로 연결한다', () => {
    const source = record({
      application_methods: [
        { type: 'online', label: '오산시가족센터 홈페이지 프로그램 신청' },
        { type: 'phone', label: '전화 신청', phone: '031-111-1111' },
        { type: 'phone', label: '문의', phone: '031-222-2222' },
        { type: 'visit', label: '방문 접수', address: '중앙동 도서관' },
      ],
    })
    const { apply, inquiry } = guardianMethods(source, '2026-10-14')
    expect(apply).toEqual([
      { type: 'online', label: '오산시가족센터 홈페이지 프로그램 신청', url: 'https://example.com/p' },
      { type: 'phone', label: '전화 신청', phone: '031-111-1111' },
      { type: 'visit', label: '방문 접수', address: '중앙동 도서관' },
    ])
    expect(inquiry).toEqual([{ type: 'phone', phone: '031-222-2222', hours: null, languages: null, verified_at: '2026-10-14' }])
  })

  it('원문 주소가 없거나 http(s)가 아니면 온라인 신청에 주소를 붙이지 않는다', () => {
    const online = { type: 'online' as const, label: '홈페이지 신청' }
    expect(guardianMethods(record({ application_methods: [online], source: { ...record().source, url: null } }), '2026-10-14').apply).toEqual([online])
    expect(guardianMethods(record({ application_methods: [online], source: { ...record().source, url: 'javascript:alert(1)' } }), '2026-10-14').apply).toEqual([online])
    const own = { ...online, url: 'https://form.example.com/a' }
    expect(guardianMethods(record({ application_methods: [own] }), '2026-10-14').apply).toEqual([own])
  })

  it('동반 규칙의 미상은 null, 공고 검수 전이면 문의처 확인일은 추출일', () => {
    const program = evaluateProgram(record({
      review: { ...record().review, status: 'pending', reviewed_at: null },
      application_methods: [{ type: 'phone', label: '문의', phone: '031-222-2222' }],
    }), null, NOW)
    expect([program.guardian_companion, program.sibling_companion]).toEqual(['required', null])
    expect(program.inquiry_methods[0].verified_at).toBe('2026-10-14')
    expect(program.review_state).toBe('current')
  })

  it('시연용 가상 공고만 is_demo. 이 표시는 검수할 사실이 아니라 승인을 풀지 않는다', () => {
    const invented = record({ source: { ...record().source, demo: true } })
    expect(evaluateProgram(invented, null, NOW).is_demo).toBe(true)
    expect(evaluateProgram(record(), null, NOW).is_demo).toBe(false)
    expect(factsHash(invented)).toBe(factsHash(record()))
  })
})

describe('언어별 안내 (보호자 웹 ReviewedSummary)', () => {
  it('쉬운 한국어는 원문 제목·기관·대상, 베트남어·중국어는 그 언어의 머리글이 있을 때만 보낸다', () => {
    const heading = { title: 'Trải nghiệm thứ Bảy', institution: 'Trung tâm Gia đình thành phố Osan (오산시가족센터)', target: 'Học sinh lớp 1–3 tiểu học thuộc gia đình đa văn hóa' }
    const summaries = guardianSummaries(record(), {
      'ko-easy': summary(),
      vi: summary({ heading, status: 'approved', approved_at: '2026-10-15T02:00:00Z' }),
      zh: summary(),
    })
    expect(Object.keys(summaries)).toEqual(['ko-easy', 'vi'])
    expect(summaries['ko-easy']).toEqual({
      title: '토요 체험', institution: '오산시가족센터', target: '다문화가족 초등 1~3학년',
      description: '첫 줄이에요. 둘째 줄이에요. 셋째 줄이에요.', reviewed_at: '2026-10-15T00:00:00Z', status: 'machine_checked',
      lines: summary().lines,
    })
    expect(summaries.vi).toMatchObject({ ...heading, reviewed_at: '2026-10-15T02:00:00Z', status: 'approved' })
  })

  it('자동 대조를 통과하지 못한 요약은 보내지 않는다', () => {
    expect(guardianSummaries(record(), { 'ko-easy': summary({ status: 'machine_draft', issues: ['문제'] }) })).toEqual({})
  })
})

describe('시연 데이터 (npm run demo)', () => {
  const demoDir = resolve(import.meta.dirname, '../demo')
  const now = new Date(DEMO_NOW)
  const published = loadRecords(demoDir).filter(isPublished).map((source) => ({ ...source, summaries_by_language: publicSummaries(source, true) }))
  const topics = new Set(['family_eligibility', 'companion', 'korean_level', 'schedule', 'age_grade', 'materials', 'other'])

  it('모든 시연 공고가 보호자 웹이 읽는 값으로 나온다', () => {
    expect(published.length).toBeGreaterThan(0)
    for (const source of published) {
      const program = evaluateProgram(source, null, now)
      expect(program.is_demo).toBe(source.source.demo === true)
      for (const item of program.uncertain_items) expect(topics.has(item.topic)).toBe(true)
      for (const rule of [program.guardian_companion, program.sibling_companion]) expect([null, 'required', 'allowed', 'not_allowed']).toContain(rule)
      for (const method of program.inquiry_methods) expect(method.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const method of program.application_methods) if (method.type === 'online') expect(method.url).toMatch(/^https?:\/\//)
      for (const text of Object.values(program.summaries_by_language)) {
        for (const value of [text.title, text.institution, text.target, text.description]) expect(value.trim()).not.toBe('')
      }
      // 장소가 원문에 있으면 대표 회차로 보여준다
      if (source.sessions.some((session) => session.place_name) || source.venue?.place_name) expect(program.next_session?.place_name).toBeTruthy()
    }
  })

  it('만든 공고(demo-)만 시연용 표시가 있고, 실제 기관 공고는 원문으로 연결한다', () => {
    const marked = published.filter((source) => source.source.demo).map((source) => source.program_id)
    expect(marked.length).toBeGreaterThan(0)
    expect(marked).toEqual(published.map((source) => source.program_id).filter((id) => id.startsWith('demo-')))
    // 저장된 공고의 표시는 inbox source.json과 같다
    for (const source of published) {
      const inbox = JSON.parse(readFileSync(resolve(demoDir, 'inbox', source.program_id, 'source.json'), 'utf8')) as { demo?: boolean }
      expect([source.program_id, source.source.demo === true]).toEqual([source.program_id, inbox.demo === true])
    }
    for (const source of published.filter((record) => !record.source.demo)) expect(source.source.url).toMatch(/^https:\/\//)
  })

  it('초등 2학년·토요일 오전 시나리오: 결과 2건, 시간 확인 필요 1건', () => {
    const response = searchPrograms(published, {
      child_grade: 2, available_windows: [{ day_of_week: 'sat', start_time: '10:05', end_time: '12:10' }], interests: [], free_only: false,
    }, now)
    expect(response.results.map((program) => program.program_id)).toEqual(['demo-saturday-craft', 'demo-korean-play'])
    expect(response.needs_confirmation.map((program) => program.program_id)).toEqual(['demo-weekend-art'])
  })
})
