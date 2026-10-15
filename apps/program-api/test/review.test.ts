import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { unverifiedFacts } from '../src/review/critical'
import { effectiveReviewStatus, factsHash, isApprovedSummary, isPublished, publicSummaries } from '../src/review/hash'
import { approveRecord, carriedReview, rejectRecord, resetReview, reusableSummaries } from '../src/review/lifecycle'
import {
  loadRecord, loadRecords, loadTranscripts, recordProblems, recordWatcher, saveRecord, saveTranscripts,
} from '../src/store'
import type { DisplayLanguage, Evidence, LanguageSummary, ProgramRecord } from '../src/types'

const NOW = new Date('2026-10-15T03:00:00Z')

/** 아래 record()의 사실과 맞는 3줄 (자동 대조 checkSummary를 통과한다) */
const LINES: Record<DisplayLanguage, string[]> = {
  'ko-easy': [
    "'토요 체험'은 오산시가족센터에서 해요. 초등 1~3학년이 대상이에요.",
    '10월 17일(토) 10:10~12:00에 해요. 장소는 오산시가족센터예요.',
    '무료예요. 10월 1일(목) 09:00부터 10월 20일(화) 18:00까지 신청해요. 신청 방법은 기관에 물어보세요.',
  ],
  vi: [
    'Chương trình “토요 체험” (Trải nghiệm cuối tuần) của 오산시가족센터, dành cho học sinh tiểu học lớp 1–3.',
    'Diễn ra vào 17/10 (Thứ Bảy), 10:10–12:00, tại 오산시가족센터.',
    'Miễn phí. Đăng ký từ 1/10 (Thứ Năm) 09:00 đến 20/10 (Thứ Ba) 18:00. Hãy hỏi đơn vị tổ chức về cách đăng ký.',
  ],
  zh: [
    '“토요 체험”（周末体验）由오산시가족센터举办，对象为小学1至3年级学生。',
    '10月17日（周六）10:10–12:00，地点：오산시가족센터。',
    '免费。报名时间：10月1日（周四）09:00至10月20日（周二）18:00，报名方式请向机构确认。',
  ],
}

function summary(status: LanguageSummary['status'], language: DisplayLanguage = 'ko-easy'): LanguageSummary {
  return { lines: LINES[language], status, generated_at: '2026-10-15T00:00:00.000Z', issues: status === 'machine_draft' ? ['문제'] : [] }
}

function record(overrides: Partial<ProgramRecord> = {}): ProgramRecord {
  return {
    program_id: 'p-review',
    title: '토요 체험',
    institution: '오산시가족센터',
    category: 'experience_culture',
    audience: 'child',
    target_type: 'all',
    target_raw: '초등 1~3학년',
    description: '체험 프로그램',
    grade_range: [1, 3],
    age_range: null,
    eligibility_requirements: [],
    guardian_companion: 'unknown',
    sibling_companion: 'unknown',
    korean_level_required: null,
    support_languages: null,
    application_languages: null,
    sessions: [{ id: 'p-review-s1', date: '2026-10-17', start_time: '10:10', end_time: '12:00', place_name: '오산시가족센터', dong: '남촌동', online: false }],
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
    application_methods: [],
    uncertain_items: [],
    evidence: [
      { field: 'title', quote: '토요 체험', verified: true },
      { field: 'target_type', quote: '누구나', verified: true },
      { field: 'target_raw', quote: '초등 1~3학년', verified: true },
      { field: 'audience', quote: '초등 1~3학년', verified: true },
      { field: 'grade_range', quote: '초등 1~3학년', verified: true },
      { field: 'sessions[p-review-s1].date', quote: '10월 17일(토)', verified: true },
      { field: 'sessions[p-review-s1].time', quote: '10:10~12:00', verified: true },
      { field: 'venue', quote: '장소: 오산시가족센터', verified: true },
      { field: 'attendance_rule', quote: '두 회차 중 하루 선택', verified: true },
      { field: 'cost', quote: '참가비 무료', verified: true },
      { field: 'application_period', quote: '접수 10.1. 09:00~10.20. 18:00', verified: true },
    ],
    summaries_by_language: { 'ko-easy': summary('machine_checked'), vi: summary('machine_checked', 'vi'), zh: summary('machine_draft', 'zh') },
    source: { url: 'https://example.com/p', retrieved_at: '2026-10-14', files: ['page.txt'], content_hash: 'abc' },
    extracted_at: '2026-10-14T00:00:00Z',
    model: 'gemini-test',
    warnings: [],
    review: { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null },
    ...overrides,
  }
}

const approved = (base = record()) => approveRecord(base, { reviewer: '검수자', now: NOW })

describe('사실 해시', () => {
  it('키 순서·근거 순서·근거 확인 표시와 무관하다', () => {
    const base = record()
    const reordered = Object.fromEntries(Object.entries(base).reverse()) as unknown as ProgramRecord
    const flags: Evidence[] = [...base.evidence].reverse().map((entry) => ({ ...entry, verified: false }))
    expect(factsHash(reordered)).toBe(factsHash(base))
    expect(factsHash({ ...base, evidence: flags })).toBe(factsHash(base))
    expect(factsHash({ ...base, sessions: base.sessions.map((session) => ({ ...session, address: undefined })) })).toBe(factsHash(base))
  })

  it('검수 기록·요약·추출 시각·모델·경고는 해시에 넣지 않는다', () => {
    const base = record()
    expect(factsHash({
      ...base,
      review: { status: 'approved', reviewed_at: 'x', reviewer: 'y', notes: 'z', facts_hash: 'h' },
      summaries_by_language: {},
      extracted_at: '2030-01-01T00:00:00Z',
      model: 'other',
      warnings: ['새 경고'],
    })).toBe(factsHash(base))
  })

  it('사실·원문·근거 인용이 바뀌면 해시가 바뀐다', () => {
    const base = record()
    const hash = factsHash(base)
    expect(factsHash({ ...base, cost_krw: 5000 })).not.toBe(hash)
    expect(factsHash({ ...base, sessions: [{ ...base.sessions[0], start_time: '10:00' }] })).not.toBe(hash)
    expect(factsHash({ ...base, source: { ...base.source, content_hash: 'changed' } })).not.toBe(hash)
    expect(factsHash({ ...base, evidence: [...base.evidence, { field: 'cost', quote: '재료비 무료', verified: true }] })).not.toBe(hash)
    expect(factsHash({ ...base, uncertain_items: ['보호자 동반'] })).not.toBe(hash)
    expect(factsHash({ ...base, application_end: '2026-10-21T18:00' })).not.toBe(hash)
  })
})

describe('게시 여부', () => {
  it('승인했고 승인 때 해시와 지금 사실이 같아야 게시된다', () => {
    const published = approved()
    expect(isPublished(published)).toBe(true)
    expect(effectiveReviewStatus(published)).toBe('approved')
    expect(published.review.facts_hash).toBe(factsHash(record()))
    expect(published.review.reviewed_at).toBe(NOW.toISOString())
  })

  it('승인 뒤 사실을 고치면 stale이 되어 내려간다', () => {
    const edited = { ...approved(), cost_krw: 10000 }
    expect(isPublished(edited)).toBe(false)
    expect(effectiveReviewStatus(edited)).toBe('stale')
    const noHash = { ...approved(), review: { ...approved().review, facts_hash: null } }
    expect(effectiveReviewStatus(noHash)).toBe('stale')
  })

  it('검수 대기·반려는 게시되지 않는다', () => {
    expect(isPublished(record())).toBe(false)
    expect(effectiveReviewStatus(record())).toBe('pending')
    const rejected = rejectRecord(record(), { reviewer: '검수자', now: NOW, notes: '날짜 오류' })
    expect(isPublished(rejected)).toBe(false)
    expect(effectiveReviewStatus(rejected)).toBe('rejected')
    expect(rejected.review.notes).toBe('날짜 오류')
  })

  it('승인해도 고친 요약 외의 기록은 그대로 두고 원본을 바꾸지 않는다', () => {
    const base = record()
    const result = approveRecord(base, { reviewer: '검수자', now: NOW })
    expect(base.review.status).toBe('pending')
    expect(result.summaries_by_language).toEqual(base.summaries_by_language)
  })

  it('--summaries는 자동 대조를 통과한 요약만 승인한다', () => {
    const result = approveRecord(record(), { reviewer: '검수자', now: NOW, summaries: ['ko-easy', 'vi', 'zh'], languageReviewer: '언어 검수자' })
    expect(result.summaries_by_language['ko-easy']?.status).toBe('approved')
    expect(result.summaries_by_language.vi?.status).toBe('approved')
    expect(result.summaries_by_language.zh?.status).toBe('machine_draft')
    expect(isPublished(result)).toBe(true)
  })

  it('검수 대기로 되돌리면 승인한 요약도 machine_checked로 돌아가고 승인 기록을 지운다', () => {
    const result = resetReview(approveRecord(record(), { reviewer: '검수자', now: NOW, summaries: ['ko-easy'] }))
    expect(result.review).toEqual({ status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null })
    expect(result.summaries_by_language['ko-easy']).toEqual(summary('machine_checked'))
    expect(result.summaries_by_language.zh?.status).toBe('machine_draft')
  })
})

describe('검수자 기록 (CONTENT_REVIEW 게시 전 확인 기록)', () => {
  it('승인·반려에는 검수자 이름이 필요하다', () => {
    expect(() => approveRecord(record(), { reviewer: ' ', now: NOW })).toThrow(/검수자/)
    expect(() => approveRecord(record(), { reviewer: null as unknown as string, now: NOW })).toThrow(/검수자/)
    expect(() => rejectRecord(record(), { reviewer: '', now: NOW, notes: '사유' })).toThrow(/검수자/)
  })

  it('베트남어·중국어 요약은 그 언어의 최종 검수자 없이 승인하지 않는다', () => {
    expect(() => approveRecord(record(), { reviewer: '검수자', now: NOW, summaries: ['vi'] })).toThrow(/vi 요약을 승인하려면/)
    expect(() => approveRecord(record(), { reviewer: '검수자', now: NOW, summaries: ['ko-easy', 'zh'] })).toThrow(/zh/)
  })

  it('언어마다 최종 검수자·승인 시각을 남기고, 목록에 적은 언어만 승인한다', () => {
    const viOnly = approveRecord(record(), { reviewer: '사실 검수자', now: NOW, summaries: ['vi'], languageReviewer: '베트남어 검수자' })
    expect(viOnly.summaries_by_language.vi).toMatchObject({ status: 'approved', reviewer: '베트남어 검수자', approved_at: NOW.toISOString() })
    expect(viOnly.summaries_by_language['ko-easy']?.status).toBe('machine_checked')
    expect(viOnly.review.reviewer).toBe('사실 검수자')
    const ko = approveRecord(viOnly, { reviewer: '사실 검수자', now: NOW, summaries: ['ko-easy'] })
    expect(ko.summaries_by_language['ko-easy']).toMatchObject({ status: 'approved', reviewer: '사실 검수자' })
    // 다른 언어를 승인해도 사실·문구가 같은 베트남어 승인은 유지된다
    expect(ko.summaries_by_language.vi).toEqual(viOnly.summaries_by_language.vi)
  })
})

describe('요약 승인과 사실·문구의 연결 (SEC-1)', () => {
  const both = () => approveRecord(record(), { reviewer: '검수자', now: NOW, summaries: ['ko-easy', 'vi'], languageReviewer: '언어 검수자' })

  it('승인한 요약은 승인 때의 사실·문구와 같을 때만 내보낸다', () => {
    const published = both()
    expect(Object.keys(publicSummaries(published)).sort()).toEqual(['ko-easy', 'vi'])
    expect(publicSummaries(published).vi).not.toHaveProperty('reviewer')
    expect(publicSummaries(published).vi).not.toHaveProperty('approved_hash')
    // 승인 뒤 문구를 손으로 고치면 내보내지 않는다
    const vi = published.summaries_by_language.vi!
    const edited = { ...published, summaries_by_language: { ...published.summaries_by_language, vi: { ...vi, lines: ['EDITED AFTER APPROVAL: miễn phí cho mọi người', ...vi.lines.slice(1)] } } }
    expect(isApprovedSummary(edited, 'vi', edited.summaries_by_language.vi)).toBe(false)
    expect(Object.keys(publicSummaries(edited))).toEqual(['ko-easy'])
    // 승인 기록 없이 status만 approved로 바꾼 요약도 내보내지 않는다
    const forged = { ...record(), summaries_by_language: { 'ko-easy': summary('approved') } }
    expect(publicSummaries(forged)).toEqual({})
  })

  it('사실을 고친 뒤 요약 없이 다시 승인하면 이전 요약 승인을 거둔다', () => {
    const published = both()
    const edited = { ...published, sessions: [{ ...published.sessions[0], date: '2026-10-24' }] }
    expect(isPublished(edited)).toBe(false)
    const reapproved = approveRecord(edited, { reviewer: '검수자', now: NOW })
    expect(isPublished(reapproved)).toBe(true)
    expect(reapproved.summaries_by_language['ko-easy']?.status).toBe('machine_checked')
    expect(reapproved.summaries_by_language.vi?.status).toBe('machine_checked')
    expect(reapproved.summaries_by_language.vi).not.toHaveProperty('approved_hash')
    expect(publicSummaries(reapproved)).toEqual({})
  })

  it('사실과 맞지 않게 된 요약은 --summaries로도 승인하지 않고 문제를 남긴다', () => {
    const edited = { ...both(), sessions: [{ ...record().sessions[0], date: '2026-10-24' }] }
    const result = approveRecord(edited, { reviewer: '검수자', now: NOW, summaries: ['ko-easy', 'vi'], languageReviewer: '언어 검수자' })
    for (const language of ['ko-easy', 'vi'] as const) {
      const item = result.summaries_by_language[language]!
      expect(item.status).toBe('machine_draft')
      expect(item.issues.join('\n')).toMatch(/다음 회차 날짜\(10월 24일\)가 없음/)
    }
    expect(publicSummaries(result)).toEqual({})
  })

  it('반려하면 요약 승인도 거둔다', () => {
    const rejected = rejectRecord(both(), { reviewer: '검수자', now: NOW, notes: '대상 확인 필요' })
    expect(rejected.summaries_by_language['ko-easy']?.status).toBe('machine_checked')
    expect(rejected.summaries_by_language.vi?.status).toBe('machine_checked')
  })
})

describe('다시 추출할 때의 검수 상태', () => {
  it('승인된 사실과 같으면 승인을 유지하고, 다르면 검수 대기로 되돌린다', () => {
    const previous = approved()
    const same = { ...record(), extracted_at: '2026-10-16T00:00:00Z', warnings: ['다른 경고'] }
    expect(carriedReview(previous, same)).toEqual(previous.review)
    expect(carriedReview(previous, { ...record(), capacity: 12 }).status).toBe('pending')
    expect(carriedReview(null, record()).status).toBe('pending')
  })

  it('반려·대기였던 공고는 다시 추출하면 검수 대기다', () => {
    const rejected = rejectRecord(record(), { reviewer: '검수자', now: NOW, notes: '사유' })
    expect(carriedReview(rejected, record())).toEqual({ status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null })
  })

  it('사실이 같고 세 언어 요약이 모두 있을 때만 이전 요약을 다시 쓴다', () => {
    const previous = record()
    expect(reusableSummaries(previous, { ...record(), summaries_by_language: {} })).toEqual(previous.summaries_by_language)
    expect(reusableSummaries(previous, { ...record(), cost_krw: 1000 })).toBeNull()
    expect(reusableSummaries({ ...previous, summaries_by_language: { vi: summary('machine_checked') } }, record())).toBeNull()
    expect(reusableSummaries(null, record())).toBeNull()
  })
})

describe('승인 전 근거 확인', () => {
  it('근거가 확인된 사실만 있으면 비어 있다', () => {
    expect(unverifiedFacts(record())).toEqual([])
  })

  it('값이 있는데 verified 근거가 없는 핵심 사실을 찾는다', () => {
    const base = record()
    const withoutCost = base.evidence.filter((entry) => entry.field !== 'cost')
    expect(unverifiedFacts({ ...base, evidence: withoutCost })).toEqual(['비용'])
    const unverifiedCost = [...withoutCost, { field: 'cost', quote: '무료!', verified: false }]
    expect(unverifiedFacts({ ...base, evidence: unverifiedCost })).toEqual(['비용'])
    const withoutTime = base.evidence.filter((entry) => !entry.field.endsWith('.time'))
    expect(unverifiedFacts({ ...base, evidence: withoutTime })).toEqual(['회차 2026-10-17 시각'])
    expect(unverifiedFacts({ ...base, capacity: 20, application_methods: [{ type: 'phone', label: '전화', phone: '031-000-0000' }] }))
      .toEqual(['정원', '신청 방법(전화)'])
  })

  it('미상인 값은 근거가 없어도 된다', () => {
    const base = record()
    const unknowns = record({
      audience: 'unknown', target_type: 'unknown', target_raw: '', grade_range: null, eligibility_requirements: null, cost_krw: null, cost_raw: null,
      application_start: null, application_end: null, sessions: [], attendance_rule: 'unknown', evidence: base.evidence.filter((entry) => entry.field === 'title'),
    })
    expect(unverifiedFacts(unknowns)).toEqual([])
  })

  it('추출 뒤 값을 고쳐 근거 인용과 맞지 않으면 확인되지 않은 것으로 본다 (SEC-2)', () => {
    const base = record()
    expect(unverifiedFacts({ ...base, sessions: [{ ...base.sessions[0], date: '2026-10-24' }] })).toEqual(['회차 2026-10-24 날짜'])
    expect(unverifiedFacts({ ...base, sessions: [{ ...base.sessions[0], start_time: '10:00' }] })).toEqual(['회차 2026-10-17 시각'])
    expect(unverifiedFacts({ ...base, cost_krw: 5000 })).toEqual(['비용'])
    expect(unverifiedFacts({ ...base, grade_range: [1, 6] })).toEqual(['학년 범위'])
    expect(unverifiedFacts({ ...base, application_end: '2026-10-21T18:00' })).toEqual(['신청 기간'])
    expect(unverifiedFacts({ ...base, application_end: '2026-10-20T20:00' })).toEqual(['신청 기간'])
    expect(unverifiedFacts({ ...base, target_type: 'multicultural_family' })).toEqual(['대상 구분'])
    expect(unverifiedFacts({ ...base, eligibility_requirements: ['오산시 거주'] })).toEqual(['참여 자격'])
    expect(unverifiedFacts({ ...base, target_raw: '초등 1~6학년' })).toEqual(['대상 원문 표현'])
    expect(unverifiedFacts({ ...base, guardian_companion: 'not_allowed', evidence: [...base.evidence, { field: 'guardian_companion', quote: '초등 1~3학년', verified: true }] }))
      .toEqual(['보호자 동반'])
    expect(unverifiedFacts({ ...base, application_methods: [{ type: 'phone', label: '전화 신청', phone: '031-000-0009' }], evidence: [...base.evidence, { field: 'application_methods.phone', quote: '전화 신청 031-000-0000', verified: true }] }))
      .toEqual(['신청 방법(전화 신청)'])
  })

  it('참여하는 사람은 audience 근거와 맞아야 하고, 대상 문구로 대신하지 않는다 (F5)', () => {
    const base = record()
    const withoutAudience = base.evidence.filter((entry) => entry.field !== 'audience')
    expect(unverifiedFacts({ ...base, evidence: withoutAudience })).toEqual(['참여하는 사람(audience)'])
    const adultQuote = [...withoutAudience, { field: 'audience', quote: '영양제 꿀팁', verified: true }]
    expect(unverifiedFacts({ ...base, evidence: adultQuote })).toEqual(['참여하는 사람(audience)'])
  })

  it('참석 방식은 근거가 필요하다. 회차가 하나뿐인 all_sessions는 예외 (F2)', () => {
    const base = record()
    const withoutAttendance = base.evidence.filter((entry) => entry.field !== 'attendance_rule')
    expect(unverifiedFacts({ ...base, evidence: withoutAttendance })).toEqual(['참석 방식'])
    expect(unverifiedFacts({ ...base, attendance_rule: 'all_sessions', evidence: withoutAttendance })).toEqual([])
    const twoSessions = [base.sessions[0], { ...base.sessions[0], id: 'p-review-s2', date: '2026-10-24' }]
    const umbrella = record({
      title: '1인가구 지원사업', attendance_rule: 'all_sessions', sessions: [], session_count: 3,
      evidence: [...withoutAttendance, { field: 'attendance_rule', quote: '총 3회', verified: true }, { field: 'session_count', quote: '총 3회', verified: true }],
    })
    expect(unverifiedFacts(umbrella)).toEqual(['참석 방식'])
    expect(unverifiedFacts({ ...umbrella, title: '토요 체험' })).toEqual([])
    expect(unverifiedFacts({ ...base, attendance_rule: 'all_sessions', sessions: twoSessions, evidence: withoutAttendance })).toContain('참석 방식')
  })
})

describe('저장소', () => {
  let dir = ''
  const tempDir = () => (dir = mkdtempSync(join(tmpdir(), 'program-store-')))
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

  it('저장한 공고를 그대로 읽는다', () => {
    tempDir()
    const path = saveRecord(approved(), dir)
    expect(path).toBe(join(dir, 'programs', 'p-review.json'))
    const loaded = loadRecord('p-review', dir)
    expect(loaded).toEqual(approved())
    expect(isPublished(loaded!)).toBe(true)
    expect(loadRecord('missing-one', dir)).toBeNull()
    expect(readdirSync(join(dir, 'programs'))).toEqual(['p-review.json'])
  })

  it('경로를 벗어나는 ID를 받지 않는다', () => {
    tempDir()
    for (const id of ['../etc/passwd', 'a/b', '..', 'UPPER', '', 'x', '-lead', 'search', 'a.json']) {
      expect(() => loadRecord(id, dir)).toThrow(/프로그램 ID/)
    }
    expect(() => saveRecord(record({ program_id: '../escape' }), dir)).toThrow()
  })

  it('형식이 틀린 파일은 경고하고 건너뛴다', () => {
    tempDir()
    saveRecord(record(), dir)
    saveTranscripts('p-review', [{ file: 'poster.png', sha256: 'aa', text: '포스터' }], dir)
    const programs = join(dir, 'programs')
    writeFileSync(join(programs, 'broken.json'), '{ not json')
    writeFileSync(join(programs, 'wrong-id.json'), JSON.stringify(record()))
    writeFileSync(join(programs, 'no-review.json'), JSON.stringify({ ...record({ program_id: 'no-review' }), review: undefined }))
    writeFileSync(join(programs, 'Bad_Name.json'), JSON.stringify(record()))
    const warnings: string[] = []
    const records = loadRecords(dir, (message) => warnings.push(message))
    expect(records.map((item) => item.program_id)).toEqual(['p-review'])
    expect(warnings).toHaveLength(4)
    expect(warnings.join('\n')).toMatch(/broken/)
    expect(warnings.join('\n')).toMatch(/파일 이름\(wrong-id\)/)
    expect(warnings.join('\n')).toMatch(/review 형식/)
    expect(() => loadRecord('broken', dir)).toThrow(/JSON/)
  })

  it('형식 검사는 빠진 필드를 알려 준다', () => {
    expect(recordProblems(record())).toEqual([])
    const { sessions: _sessions, ...rest } = record()
    expect(recordProblems(rest)).toEqual(['sessions 형식이 올바르지 않습니다'])
    expect(recordProblems(null)).toEqual(['JSON 객체가 아닙니다'])
  })

  it('판독문은 공고 옆 <id>.transcripts.json에 저장한다', () => {
    tempDir()
    const transcripts = [{ file: 'poster.png', sha256: 'aa', text: '토요 체험\n10:10~12:00' }]
    expect(saveTranscripts('p-review', transcripts, dir)).toBe(join(dir, 'programs', 'p-review.transcripts.json'))
    expect(loadTranscripts('p-review', dir)).toEqual(transcripts)
    expect(loadTranscripts('none-yet', dir)).toEqual([])
    writeFileSync(join(dir, 'programs', 'p-review.transcripts.json'), '{"transcripts": [1]}')
    const warnings: string[] = []
    expect(loadTranscripts('p-review', dir, (message) => warnings.push(message))).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it('파일이 바뀔 때만 다시 읽는다', () => {
    tempDir()
    mkdirSync(join(dir, 'programs'), { recursive: true })
    const records = recordWatcher(dir, () => {})
    const empty = records()
    expect(empty).toEqual([])
    expect(records()).toBe(empty)
    saveRecord(record(), dir)
    const first = records()
    expect(first.map((item) => item.program_id)).toEqual(['p-review'])
    expect(records()).toBe(first)
    saveRecord({ ...record(), title: '바뀐 제목입니다' }, dir)
    expect(records()[0].title).toBe('바뀐 제목입니다')
  })
})

describe('자동 대조를 통과한 요약 내보내기 (시연 설정)', () => {
  it('기본은 승인된 요약만, 설정을 켜면 machine_checked도 상태를 붙여 내보내고 machine_draft는 끝까지 뺀다', () => {
    const drafts = { ...record(), summaries_by_language: { 'ko-easy': summary('machine_checked'), vi: summary('machine_checked', 'vi'), zh: summary('machine_draft', 'zh') } }
    expect(publicSummaries(drafts)).toEqual({})
    const shown = publicSummaries(drafts, true)
    expect(Object.keys(shown).sort()).toEqual(['ko-easy', 'vi'])
    expect(shown.vi?.status).toBe('machine_checked')
  })
})
