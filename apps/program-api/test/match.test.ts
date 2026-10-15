import { describe, expect, it } from 'vitest'
import { applicationStatus } from '../src/match/application'
import { isValidDate, isValidTime, lastApplicationDay, seoulNowMinutes, seoulToday, weekdayOf } from '../src/match/dates'
import { evaluateProgram, MID_JOIN_ITEM } from '../src/match/evaluate'
import { parseSearchFilters } from '../src/match/filters'
import { isListable, searchPrograms } from '../src/match/search'
import type { AvailableWindow, ProgramRecord, ProgramResponse, ProgramSession, SearchFilters } from '../src/types'

// 2026-10-15(목) 12:00, Asia/Seoul
const NOW = new Date('2026-10-15T03:00:00Z')
const SAT: AvailableWindow = { day_of_week: 'sat', start_time: '10:05', end_time: '12:10' }

function session(id: string, date: string | null, start: string | null, end: string | null, dong: string | null = '중앙동'): ProgramSession {
  return { id, date, start_time: start, end_time: end, place_name: '오산시가족센터', dong, online: false }
}

function record(overrides: Partial<ProgramRecord> = {}): ProgramRecord {
  return {
    program_id: 'p-test',
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
    sessions: [session('s1', '2026-10-17', '10:10', '12:00')],
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
    application_methods: [{ type: 'phone', label: '기관에 전화하기', phone: '031-000-0000' }],
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

function filters(overrides: Partial<SearchFilters> = {}): SearchFilters {
  return { available_windows: [], interests: [], free_only: false, ...overrides }
}

const ids = (programs: ProgramResponse[]) => programs.map((program) => program.program_id)
const timeOf = (overrides: Partial<ProgramRecord>, windows: AvailableWindow[] = [SAT], now = NOW) =>
  evaluateProgram(record(overrides), filters({ available_windows: windows }), now)

describe('서울 날짜·시각', () => {
  it('UTC가 아닌 서울 기준 날짜와 분을 쓴다', () => {
    expect(seoulToday(NOW)).toBe('2026-10-15')
    expect(seoulNowMinutes(NOW)).toBe(12 * 60)
    expect(seoulToday(new Date('2026-10-14T15:30:00Z'))).toBe('2026-10-15')
    expect(seoulNowMinutes(new Date('2026-10-14T15:30:00Z'))).toBe(30)
  })

  it('요일을 계산한다', () => {
    expect(weekdayOf('2026-10-15')).toBe('thu')
    expect(weekdayOf('2026-10-17')).toBe('sat')
    expect(weekdayOf('2026-10-18')).toBe('sun')
  })

  it('실제 있는 날짜와 HH:MM만 받는다', () => {
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2026-1-05')).toBe(false)
    expect(isValidTime('09:00')).toBe(true)
    expect(isValidTime('9:00')).toBe(false)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('12:60')).toBe(false)
  })
})

describe('신청 상태', () => {
  const status = (start: string | null, end: string | null, now = NOW) =>
    applicationStatus(record({ application_start: start, application_end: end }), now)

  it('시작 전·접수 중·마감을 시각까지 비교한다', () => {
    expect(status('2026-10-16T09:00', '2026-10-20T18:00')).toBe('upcoming')
    expect(status('2026-10-01T09:00', '2026-10-20T18:00')).toBe('open')
    expect(status('2026-10-01T09:00', '2026-10-14T18:00')).toBe('closed')
  })

  it('분 단위로 비교하고 시작·마감 시각을 포함한다', () => {
    expect(status('2026-10-15T12:00', '2026-10-20T18:00')).toBe('open')
    expect(status('2026-10-15T12:01', '2026-10-20T18:00')).toBe('upcoming')
    expect(status('2026-10-01T09:00', '2026-10-15T12:00')).toBe('open')
    expect(status('2026-10-01T09:00', '2026-10-15T11:59')).toBe('closed')
  })

  it('기간이 모두 없으면 unknown', () => {
    expect(status(null, null)).toBe('unknown')
  })

  it('한쪽만 있으면 확인되는 것만 판정한다', () => {
    expect(status(null, '2026-10-14T18:00')).toBe('closed')
    expect(status(null, '2026-10-20T18:00')).toBe('unknown')
    expect(status('2026-10-16T09:00', null)).toBe('upcoming')
    expect(status('2026-10-01T09:00', null)).toBe('unknown')
  })

  it('날짜만 있는 마감일 당일에는 마감 시각을 추정하지 않는다', () => {
    expect(status('2026-10-01', '2026-10-15')).toBe('unknown')
    expect(status('2026-10-01', '2026-10-14')).toBe('closed')
    expect(status('2026-10-01', '2026-10-16')).toBe('open')
  })

  it('날짜만 있는 시작일 당일에는 시작 여부를 추정하지 않는다', () => {
    expect(status('2026-10-15', '2026-10-20')).toBe('unknown')
    expect(status('2026-10-16', '2026-10-20')).toBe('upcoming')
    expect(status('2026-10-14', '2026-10-20T18:00')).toBe('open')
  })

  it('시작이 마감보다 늦거나 형식이 틀리면 unknown', () => {
    expect(status('2026-10-20T09:00', '2026-10-10T18:00')).toBe('unknown')
    expect(status('2026-10-20', '2026-10-10')).toBe('unknown')
    expect(status('2026-10-15T13:00', '2026-10-15T09:00')).toBe('unknown')
    expect(status('2026/10/01', '2026-10-20')).toBe('unknown')
    expect(status('2026-10-01', '2026-10-20T25:00')).toBe('unknown')
  })

  it('서울 자정을 넘긴 직후를 다음 날로 본다', () => {
    expect(status('2026-10-01T09:00', '2026-10-14T23:59', new Date('2026-10-14T15:00:00Z'))).toBe('closed')
    expect(status('2026-10-01T09:00', '2026-10-14T23:59', new Date('2026-10-14T14:59:00Z'))).toBe('open')
  })
})

describe('시간 판정 (명세 4장)', () => {
  it('10:05~12:10은 10:10~12:00 회차와 맞고 10:00~11:00 회차와는 맞지 않는다', () => {
    const fits = timeOf({ sessions: [session('a', '2026-10-17', '10:10', '12:00')] })
    expect(fits.time_match_status).toBe('matched')
    expect(fits.matched_sessions).toEqual(['a'])
    const early = timeOf({ sessions: [session('b', '2026-10-17', '10:00', '11:00')] })
    expect(early.time_match_status).toBe('not_matched')
    expect(early.matched_sessions).toEqual([])
  })

  it('분 단위 그대로 비교하고 반올림하지 않는다', () => {
    expect(timeOf({ sessions: [session('a', '2026-10-17', '10:05', '12:10')] }).time_match_status).toBe('matched')
    expect(timeOf({ sessions: [session('a', '2026-10-17', '10:04', '12:00')] }).time_match_status).toBe('not_matched')
    expect(timeOf({ sessions: [session('a', '2026-10-17', '10:10', '12:11')] }).time_match_status).toBe('not_matched')
  })

  it('요일이 다르면 맞지 않고, 특정 날짜 구간은 그 날짜에만 맞는다', () => {
    const sunday = { sessions: [session('a', '2026-10-18', '10:10', '12:00')] }
    expect(timeOf(sunday).time_match_status).toBe('not_matched')
    const dateWindow = (date: string): AvailableWindow => ({ date, start_time: '10:00', end_time: '12:00' })
    expect(timeOf(sunday, [dateWindow('2026-10-18')]).time_match_status).toBe('matched')
    expect(timeOf(sunday, [dateWindow('2026-10-25')]).time_match_status).toBe('not_matched')
  })

  it('날짜만 확인되고 시각이 없어도 그날에 해당하는 가능 시간이 없으면 불일치다', () => {
    // 2026-10-22는 목요일. 토요일 구간만 넣었으면 시각을 몰라도 참여할 수 없다
    const thursday = { attendance_rule: 'all_sessions' as const, sessions: [session('a', '2026-10-22', null, null)] }
    expect(timeOf(thursday).time_match_status).toBe('not_matched')
    expect(timeOf({ ...thursday, attendance_rule: 'choose_one' }).time_match_status).toBe('not_matched')
    // 같은 요일 구간이 있으면 시각이 없으니 확인 필요
    const thu: AvailableWindow = { day_of_week: 'thu', start_time: '09:00', end_time: '18:00' }
    expect(timeOf(thursday, [thu]).time_match_status).toBe('unknown')
    // 한 회차 선택형에서 다른 회차가 그날에 해당하면 그 회차 때문에 확인 필요로 남는다
    const choose = { attendance_rule: 'choose_one' as const, sessions: [session('a', '2026-10-22', null, null), session('b', '2026-10-24', null, null)] }
    expect(timeOf(choose).time_match_status).toBe('unknown')
  })

  it('요일 구간과 날짜 구간 중 어느 하나와 맞아도 된다', () => {
    const windows: AvailableWindow[] = [SAT, { date: '2026-10-18', start_time: '09:00', end_time: '18:00' }]
    const program = timeOf({ sessions: [session('a', '2026-10-17', '13:00', '15:00'), session('b', '2026-10-18', '13:00', '15:00')] }, windows)
    expect(program.time_match_status).toBe('matched')
    expect(program.matched_sessions).toEqual(['b'])
  })

  it('가능 시간을 입력하지 않으면 not_applied이고 시간 일치 문구가 없다', () => {
    const program = evaluateProgram(record(), filters({ child_grade: 2 }), NOW)
    expect(program.time_match_status).toBe('not_applied')
    expect(program.matched_sessions).toEqual([])
    expect(program.matched_reasons.some((reason) => reason.includes('시간'))).toBe(false)
    expect(program.matched_reasons).toHaveLength(1)
  })

  it('지난 회차는 일치 근거로 쓰지 않는다', () => {
    const program = timeOf({
      sessions: [session('past', '2026-10-10', '10:10', '12:00'), session('later', '2026-10-17', '13:00', '15:00')],
    })
    expect(program.time_match_status).toBe('not_matched')
    expect(program.matched_sessions).toEqual([])
  })

  it('오늘 회차는 시작 시각이 지났으면 지난 회차, 아니면 앞으로 시작할 회차다', () => {
    const today: AvailableWindow = { date: '2026-10-15', start_time: '09:00', end_time: '18:00' }
    expect(timeOf({ sessions: [session('a', '2026-10-15', '11:00', '13:00')] }, [today]).time_match_status).toBe('not_matched')
    expect(timeOf({ sessions: [session('a', '2026-10-15', '12:00', '13:00')] }, [today]).time_match_status).toBe('not_matched')
    expect(timeOf({ sessions: [session('a', '2026-10-15', '12:01', '13:00')] }, [today]).time_match_status).toBe('matched')
  })

  describe('한 회차 선택형 (choose_one)', () => {
    it('앞으로 시작할 회차 하나라도 맞으면 matched', () => {
      const program = timeOf({ sessions: [session('a', '2026-10-17', '13:00', '15:00'), session('b', '2026-10-24', '10:10', '12:00'), session('c', null, null, null)] })
      expect(program.time_match_status).toBe('matched')
      expect(program.matched_sessions).toEqual(['b'])
    })

    it('일치가 없고 일정 미상 회차가 있으면 unknown', () => {
      expect(timeOf({ sessions: [session('a', '2026-10-17', '13:00', '15:00'), session('b', '2026-10-24', null, null)] }).time_match_status).toBe('unknown')
    })

    it('확인된 회차가 모두 불일치면 not_matched', () => {
      expect(timeOf({ sessions: [session('a', '2026-10-17', '13:00', '15:00'), session('b', '2026-10-24', '09:00', '11:00')] }).time_match_status).toBe('not_matched')
    })

    it('원문 총 회차보다 적은 회차만 적혀 있으면 빠진 일정이 있어 unknown', () => {
      expect(timeOf({ session_count: 4, sessions: [session('a', '2026-10-17', '13:00', '15:00')] }).time_match_status).toBe('unknown')
    })
  })

  describe('전 회차 참석형 (all_sessions)', () => {
    const allSessions = (sessions: ProgramSession[], overrides: Partial<ProgramRecord> = {}) =>
      timeOf({ attendance_rule: 'all_sessions', sessions, ...overrides })

    it('모든 회차가 맞아야 matched', () => {
      const program = allSessions([session('a', '2026-10-24', '10:10', '12:00'), session('b', '2026-10-17', '10:30', '12:00')])
      expect(program.time_match_status).toBe('matched')
      expect(program.matched_sessions).toEqual(['b', 'a'])
      expect(program.next_session?.id).toBe('b')
    })

    it('한 회차라도 확인된 불일치면 not_matched (choose_one과 다름)', () => {
      const sessions = [session('a', '2026-10-17', '10:10', '12:00'), session('b', '2026-10-24', '10:00', '12:00')]
      expect(allSessions(sessions).time_match_status).toBe('not_matched')
      expect(timeOf({ attendance_rule: 'choose_one', sessions }).time_match_status).toBe('matched')
    })

    it('불일치는 없지만 일정이 빠진 필수 회차가 있으면 unknown', () => {
      const program = allSessions([session('a', '2026-10-17', '10:10', '12:00'), session('b', null, null, null)])
      expect(program.time_match_status).toBe('unknown')
      expect(program.matched_sessions).toEqual([])
      expect(allSessions([session('a', '2026-10-17', '10:10', '12:00')], { session_count: 3 }).time_match_status).toBe('unknown')
    })

    it('일정 미상 회차가 있어도 확인된 불일치가 있으면 not_matched', () => {
      expect(allSessions([session('a', '2026-10-17', '09:00', '12:00'), session('b', null, null, null)]).time_match_status).toBe('not_matched')
    })

    it('지난 필수 회차가 있고 중도 참여가 명시되지 않으면 unknown과 중도 참여 확인 필요', () => {
      const sessions = [session('past', '2026-10-10', '10:10', '12:00'), session('a', '2026-10-17', '10:10', '12:00')]
      for (const midJoin of [null, false]) {
        const program = allSessions(sessions, { mid_join_allowed: midJoin })
        expect(program.time_match_status).toBe('unknown')
        expect(program.uncertain_items).toContain(MID_JOIN_ITEM)
      }
    })

    it('중도 참여가 명시되면 남은 회차로 판정한다', () => {
      const program = allSessions([session('past', '2026-10-10', '08:00', '09:00'), session('a', '2026-10-17', '10:10', '12:00')], { mid_join_allowed: true })
      expect(program.time_match_status).toBe('matched')
      expect(program.matched_sessions).toEqual(['a'])
      expect(program.mid_join_allowed).toBe(true)
      expect(program.uncertain_items).not.toContain(MID_JOIN_ITEM)
      expect(program.matched_reasons.some((reason) => reason.startsWith('남은 회차'))).toBe(true)
    })

    it('남은 필수 회차가 맞지 않으면 지난 회차와 관계없이 not_matched', () => {
      const program = allSessions([session('past', '2026-10-10', '10:10', '12:00'), session('a', '2026-10-17', '13:00', '15:00')])
      expect(program.time_match_status).toBe('not_matched')
    })
  })

  it('참석 방식이 미상이면 unknown', () => {
    expect(timeOf({ attendance_rule: 'unknown' }).time_match_status).toBe('unknown')
  })

  it('참석 방식이 미상이어도 총 회차가 모두 적혔고 남은 회차가 하나도 맞지 않으면 not_matched', () => {
    const evening = [session('a', '2026-10-16', '19:00', '20:30'), session('b', '2026-10-21', '19:00', '20:30')]
    expect(timeOf({ attendance_rule: 'unknown', session_count: 2, sessions: evening }).time_match_status).toBe('not_matched')
    // 총 회차를 모르거나 적히지 않은 회차가 있으면 여전히 unknown
    expect(timeOf({ attendance_rule: 'unknown', session_count: null, sessions: evening }).time_match_status).toBe('unknown')
    expect(timeOf({ attendance_rule: 'unknown', session_count: 3, sessions: evening }).time_match_status).toBe('unknown')
    // 맞는 회차가 있으면 참석 방식을 몰라 unknown
    const withFit = [...evening, session('c', '2026-10-17', '10:10', '12:00')]
    expect(timeOf({ attendance_rule: 'unknown', session_count: 3, sessions: withFit }).time_match_status).toBe('unknown')
  })

  it('회차 없이 운영 기간만 있으면 시간을 입력했을 때 unknown', () => {
    const program = timeOf({ sessions: [], period_start: '2026-10-19', period_end: '2026-12-04', session_count: 12 })
    expect(program.time_match_status).toBe('unknown')
    expect(program.next_session).toBeNull()
  })

  it('회차도 기간도 없으면 unknown', () => {
    expect(timeOf({ sessions: [] }).time_match_status).toBe('unknown')
  })

  it('시작·종료가 뒤바뀐 회차는 확인된 일정으로 보지 않는다', () => {
    expect(timeOf({ sessions: [session('a', '2026-10-17', '12:00', '10:10')] }).time_match_status).toBe('unknown')
  })
})

describe('학년·나이와 별도 자격', () => {
  it('같은 기준끼리만 비교한다', () => {
    expect(evaluateProgram(record(), filters({ child_grade: 2 }), NOW).age_grade_match_status).toBe('matched')
    expect(evaluateProgram(record(), filters({ child_grade: 5 }), NOW).age_grade_match_status).toBe('not_matched')
    const byAge = record({ grade_range: null, age_range: [8, 12] })
    expect(evaluateProgram(byAge, filters({ child_age: 9 }), NOW).age_grade_match_status).toBe('matched')
    expect(evaluateProgram(byAge, filters({ child_age: 13 }), NOW).age_grade_match_status).toBe('not_matched')
  })

  it('나이와 학년을 서로 환산하지 않고, 범위가 없으면 unknown', () => {
    expect(evaluateProgram(record({ grade_range: null, age_range: [8, 12] }), filters({ child_grade: 2 }), NOW).age_grade_match_status).toBe('unknown')
    expect(evaluateProgram(record({ grade_range: [1, 3], age_range: null }), filters({ child_age: 8 }), NOW).age_grade_match_status).toBe('unknown')
    expect(evaluateProgram(record({ grade_range: null, target_type: 'multicultural_family' }), filters({ child_grade: 2 }), NOW).age_grade_match_status).toBe('unknown')
  })

  it('누구나 공고(학년·나이 제한 없음)와 자녀가 참여하지 않는 공고는 학년을 묻지 않는다', () => {
    expect(evaluateProgram(record({ grade_range: null, target_type: 'all' }), filters({ child_grade: 2 }), NOW).age_grade_match_status).toBe('not_applied')
    expect(evaluateProgram(record({ grade_range: null, target_type: 'unknown' }), filters({ child_grade: 2 }), NOW).age_grade_match_status).toBe('unknown')
    expect(evaluateProgram(record({ grade_range: null, audience: 'adult' }), filters({ child_grade: 2 }), NOW).age_grade_match_status).toBe('not_applied')
    expect(evaluateProgram(record({ grade_range: null, audience: 'parent_only' }), filters({ child_age: 8 }), NOW).age_grade_match_status).toBe('not_applied')
  })

  it('학년 일치 근거는 초·중·고 학년으로 쓴다', () => {
    expect(evaluateProgram(record(), filters({ child_grade: 2 }), NOW).matched_reasons)
      .toEqual(['입력한 학년(초등 2학년)이 공고 대상 학년(초등 1~3학년)에 들어가요'])
    expect(evaluateProgram(record({ grade_range: [7, 9] }), filters({ child_grade: 8 }), NOW).matched_reasons)
      .toEqual(['입력한 학년(중학교 2학년)이 공고 대상 학년(중학교 1~3학년)에 들어가요'])
    expect(evaluateProgram(record({ grade_range: [5, 8] }), filters({ child_grade: 6 }), NOW).matched_reasons[0])
      .toContain('초등 5학년~중학교 2학년')
  })

  it('별도 자격이 없다고 확인된 누구나 공고만 자격 matched', () => {
    expect(evaluateProgram(record({ eligibility_requirements: [] }), null, NOW).eligibility_status).toBe('matched')
    expect(evaluateProgram(record({ eligibility_requirements: null }), null, NOW).eligibility_status).toBe('unknown')
    expect(evaluateProgram(record({ eligibility_requirements: ['오산시 거주'] }), filters({ child_grade: 2 }), NOW).eligibility_status).toBe('unknown')
  })

  it('다문화가족 대상은 가족 배경을 입력받지 않으므로 자동으로 matched가 아니다', () => {
    const program = evaluateProgram(record({ target_type: 'multicultural_family', target_raw: '다문화가족 초등 1~4학년', grade_range: [1, 4], eligibility_requirements: [] }), filters({ child_grade: 2 }), NOW)
    expect(program.age_grade_match_status).toBe('matched')
    expect(program.eligibility_status).toBe('unknown')
    expect(program.uncertain_items).toContain('참여 자격 확인 필요: 다문화가족')
  })

  it('별도 자격 확인 항목을 공고의 확인 필요 사항과 겹치지 않게 덧붙인다', () => {
    const covered = evaluateProgram(record({ eligibility_requirements: ['다문화가족'], uncertain_items: ['다문화가족 자격 확인'] }), null, NOW)
    expect(covered.uncertain_items).toEqual(['다문화가족 자격 확인'])
    const partial = evaluateProgram(record({ eligibility_requirements: ['다문화가족', '오산시 거주'], uncertain_items: ['다문화가족 자격 확인'] }), null, NOW)
    expect(partial.uncertain_items).toEqual(['다문화가족 자격 확인', '참여 자격 확인 필요: 오산시 거주'])
    // 구체적인 자격이 없으면 일반 문구는 보호자 웹이 화면 언어로 표시한다
    const unknown = evaluateProgram(record({ eligibility_requirements: null }), null, NOW)
    expect(unknown.eligibility_status).toBe('unknown')
    expect(unknown.uncertain_items).toEqual([])
  })

  it('자녀가 참여하는지 미상이면 확인 항목을 더하고, 판정 중 공고를 바꾸지 않는다', () => {
    const source = record({ audience: 'unknown', sessions: [session('b', '2026-10-24', '10:10', '12:00'), session('a', '2026-10-17', '10:10', '12:00')] })
    const snapshot = structuredClone(source)
    const program = evaluateProgram(source, filters({ available_windows: [SAT] }), NOW)
    expect(program.uncertain_items).toEqual(['자녀가 참여하는 프로그램인지 확인 필요'])
    expect(program.matched_sessions).toEqual(['a', 'b'])
    expect(source).toEqual(snapshot)
  })

  it('한 번뿐인 행사와 이미 끝난 과정에는 중도 참여 확인을 붙이지 않는다', () => {
    const oneDay = evaluateProgram(record({ attendance_rule: 'all_sessions', session_count: 1, period_start: '2026-06-10', period_end: '2026-06-10', sessions: [session('a', '2026-06-10', '18:00', '19:30')] }), null, NOW)
    expect(oneDay.uncertain_items).not.toContain(MID_JOIN_ITEM)
    const ended = evaluateProgram(record({ attendance_rule: 'all_sessions', sessions: [session('a', '2026-10-01', '10:10', '12:00'), session('b', '2026-10-08', '10:10', '12:00')] }), null, NOW)
    expect(ended.uncertain_items).not.toContain(MID_JOIN_ITEM)
    const running = evaluateProgram(record({ attendance_rule: 'all_sessions', sessions: [session('a', '2026-10-08', '10:10', '12:00'), session('b', '2026-10-22', '10:10', '12:00')] }), null, NOW)
    expect(running.uncertain_items).toContain(MID_JOIN_ITEM)
  })

  it('다문화가족을 구체적으로 밝힌 자격(중도입국 등)이 있으면 다문화가족을 따로 덧붙이지 않는다', () => {
    const program = evaluateProgram(record({ target_type: 'multicultural_family', eligibility_requirements: ['중도입국'] }), null, NOW)
    expect(program.uncertain_items).toEqual(['참여 자격 확인 필요: 중도입국'])
  })

  it('중도 참여 확인 항목은 공고에 이미 있으면 다시 넣지 않는다', () => {
    const program = evaluateProgram(record({
      attendance_rule: 'all_sessions',
      sessions: [session('past', '2026-10-10', '10:10', '12:00'), session('a', '2026-10-17', '10:10', '12:00')],
      uncertain_items: ['중도 참여 가능 여부', '중도 참여 가능 여부'],
    }), filters({ available_windows: [SAT] }), NOW)
    expect(program.time_match_status).toBe('unknown')
    expect(program.uncertain_items).toEqual(['중도 참여 가능 여부'])
  })
})

describe('공유 링크 단독 상세 (filters = null)', () => {
  it('입력이 필요한 판정은 not_applied이고 일치 근거가 없다', () => {
    const program = evaluateProgram(record({ sessions: [session('b', '2026-10-24', '10:10', '12:00'), session('a', '2026-10-17', '10:10', '12:00')] }), null, NOW)
    expect(program.age_grade_match_status).toBe('not_applied')
    expect(program.time_match_status).toBe('not_applied')
    expect(program.eligibility_status).toBe('matched')
    expect(program.matched_sessions).toEqual([])
    expect(program.matched_reasons).toEqual([])
    expect(program.next_session?.id).toBe('a')
    expect(program.application_status).toBe('open')
    expect(program.source_url).toBe('https://example.com/p')
  })

  it('확인일은 승인 시각의 서울 날짜다', () => {
    expect(evaluateProgram(record(), null, NOW).verified_at).toBe('2026-10-14')
    const lateUtc = record({ review: { status: 'approved', reviewed_at: '2026-10-14T16:00:00Z', reviewer: null, notes: null, facts_hash: null } })
    expect(evaluateProgram(lateUtc, null, NOW).verified_at).toBe('2026-10-15')
    const pending = record({ review: { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null } })
    expect(evaluateProgram(pending, null, NOW).verified_at).toBeNull()
  })

  it('마감된 공고도 상세에서는 closed로 돌려준다', () => {
    const closed = record({ application_start: '2026-09-01T09:00', application_end: '2026-10-10T18:00' })
    expect(evaluateProgram(closed, null, NOW).application_status).toBe('closed')
    expect(isListable(closed, NOW)).toBe(false)
  })

  it('보호자 웹 Program과 명세 6장 추가 필드를 모두 담는다', () => {
    const program = evaluateProgram(record(), null, NOW)
    for (const key of [
      'program_id', 'title', 'institution', 'category', 'target_raw', 'description', 'grade_range', 'age_range',
      'age_grade_match_status', 'eligibility_status', 'time_match_status', 'uncertain_items', 'matched_reasons',
      'attendance_rule', 'sessions', 'matched_sessions', 'next_session', 'cost_krw', 'cost_raw', 'application_status',
      'application_start', 'application_end', 'application_methods', 'source_url', 'verified_at', 'target_type', 'audience',
      'eligibility_requirements', 'guardian_companion', 'sibling_companion', 'korean_level_required', 'support_languages',
      'application_languages', 'period_start', 'period_end', 'session_count', 'capacity', 'summaries_by_language', 'source_evidence',
    ]) expect(program).toHaveProperty(key)
    expect(program).not.toHaveProperty('mid_join_allowed')
    expect(program).not.toHaveProperty('review')
    expect(program).not.toHaveProperty('evidence')
  })
})

describe('운영이 끝난 공고의 신청 상태 (리뷰 R2, 명세 5.1·5.2)', () => {
  // 도시락 공고처럼 운영 기간은 끝났는데 신청 마감이 그 뒤로 적힌 경우
  const lunchbox = { sessions: [], period_start: '2026-10-19', period_end: '2026-10-19', application_start: '2026-10-12T09:00', application_end: '2026-10-23T00:00' }
  const later = new Date('2026-10-20T03:00:00Z')

  it('운영이 끝났으면 신청 마감 전이어도 closed로 돌려준다', () => {
    expect(evaluateProgram(record(lunchbox), null, later).application_status).toBe('closed')
    expect(evaluateProgram(record(lunchbox), filters(), later).application_status).toBe('closed')
    expect(isListable(record(lunchbox), later)).toBe(false)
  })

  it('운영 중이면 신청 기간대로', () => {
    expect(evaluateProgram(record(lunchbox), null, NOW).application_status).toBe('open')
    const past = { application_start: '2026-10-12T09:00', application_end: '2026-10-23T00:00', sessions: [session('a', '2026-10-17', '10:10', '12:00')] }
    expect(evaluateProgram(record(past), null, NOW).application_status).toBe('open')
    expect(evaluateProgram(record(past), null, later).application_status).toBe('closed')
  })
})

describe('원문 근거 (리뷰 R4)', () => {
  it('원문에서 찾은 인용만 필드 이름과 함께 내보낸다', () => {
    const program = evaluateProgram(record({
      evidence: [
        { field: 'cost', quote: '참가비 무료', verified: true },
        { field: 'capacity', quote: '정원 20명', verified: false },
        { field: 'sessions[s1].date', quote: '10월 17일(토)', verified: true },
      ],
    }), null, NOW)
    expect(program.source_evidence).toEqual([
      { field: 'cost', quote: '참가비 무료' },
      { field: 'sessions[s1].date', quote: '10월 17일(토)' },
    ])
    expect(evaluateProgram(record(), null, NOW).source_evidence).toEqual([])
  })
})

describe('신청 기간 형식 (보호자 웹 호환)', () => {
  it('application_start·end는 날짜만, 시각은 *_at 필드로 보낸다', () => {
    const program = evaluateProgram(record({ application_start: '2026-10-01T09:00', application_end: '2026-10-21' }), null, NOW)
    expect(program.application_start).toBe('2026-10-01')
    expect(program.application_end).toBe('2026-10-21')
    expect(program.application_start_at).toBe('2026-10-01T09:00')
    expect(program.application_end_at).toBe('2026-10-21')
  })

  it('00:00 마감은 전날을 마지막 신청일로 보낸다', () => {
    const program = evaluateProgram(record({ application_start: '2026-10-01T00:00', application_end: '2026-11-01T00:00' }), null, NOW)
    expect(program.application_start).toBe('2026-10-01')
    expect(program.application_end).toBe('2026-10-31')
    expect(program.application_end_at).toBe('2026-11-01T00:00')
  })

  it('새벽(06:00 전) 마감도 전날까지, 그 밖에는 그날까지', () => {
    expect(lastApplicationDay('2026-10-30T01:00')).toBe('2026-10-29')
    expect(lastApplicationDay('2026-10-30T05:59')).toBe('2026-10-29')
    expect(lastApplicationDay('2026-10-30T06:00')).toBe('2026-10-30')
    expect(lastApplicationDay('2026-10-30T18:00')).toBe('2026-10-30')
    expect(lastApplicationDay('2026-10-30')).toBe('2026-10-30')
    expect(lastApplicationDay('2026-11-01T00:00')).toBe('2026-10-31')
    expect(lastApplicationDay(null)).toBeNull()
  })
})

describe('다음 회차와 일치 근거', () => {
  const sessions = [
    session('past', '2026-10-10', '10:10', '12:00'),
    session('soon', '2026-10-17', '13:00', '15:00'),
    session('fit', '2026-10-24', '10:10', '12:00'),
    session('undated', null, null, null),
  ]

  it('시간이 맞으면 가장 빠른 일치 회차, 아니면 가장 빠른 앞으로의 날짜 확인 회차', () => {
    expect(timeOf({ sessions }).next_session?.id).toBe('fit')
    expect(evaluateProgram(record({ sessions }), filters(), NOW).next_session?.id).toBe('soon')
    expect(timeOf({ sessions }, [{ day_of_week: 'sun', start_time: '10:00', end_time: '12:00' }]).next_session?.id).toBe('soon')
  })

  it('앞으로의 날짜 확인 회차가 없으면 null', () => {
    expect(evaluateProgram(record({ sessions: [session('past', '2026-10-10', '10:10', '12:00'), session('u', null, null, null)] }), null, NOW).next_session).toBeNull()
  })

  it('일치 근거에 신청 상태·비용·거리를 섞지 않는다', () => {
    const program = evaluateProgram(record({ sessions }), filters({ child_grade: 2, available_windows: [SAT], dong: '중앙동', interests: ['experience_culture'] }), NOW)
    expect(program.matched_reasons).toEqual([
      '입력한 학년(초등 2학년)이 공고 대상 학년(초등 1~3학년)에 들어가요',
      '입력한 시간 안에 들어가는 회차가 있어요: 10월 24일(토) 10:10~12:00',
    ])
    for (const word of ['신청', '비용', '무료', '원', '거리', '가까', '동']) {
      expect(program.matched_reasons.join(' ')).not.toContain(word)
    }
  })

  it('확인되지 않은 판정은 일치 근거에 넣지 않는다', () => {
    const program = evaluateProgram(record({ grade_range: null, attendance_rule: 'unknown' }), filters({ child_grade: 2, available_windows: [SAT] }), NOW)
    expect(program.matched_reasons).toEqual([])
  })
})

describe('목록 포함 여부', () => {
  it('보호자만 참여하는 공고는 자녀 프로그램 목록에서 뺀다', () => {
    expect(isListable(record({ audience: 'parent_only' }), NOW)).toBe(false)
    expect(isListable(record({ audience: 'adult' }), NOW)).toBe(false)
    expect(isListable(record({ target_type: 'parent_only' }), NOW)).toBe(false)
    expect(isListable(record({ audience: 'parent_child' }), NOW)).toBe(true)
  })

  it('검수 승인된 공고만 올린다', () => {
    expect(isListable(record({ review: { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null } }), NOW)).toBe(false)
    expect(isListable(record({ review: { status: 'rejected', reviewed_at: '2026-10-14', reviewer: null, notes: null, facts_hash: null } }), NOW)).toBe(false)
  })

  it('신청 기간 미상은 남기고 마감은 뺀다', () => {
    expect(isListable(record({ application_start: null, application_end: null }), NOW)).toBe(true)
    expect(isListable(record({ application_end: '2026-10-14T18:00' }), NOW)).toBe(false)
  })

  it('운영이 끝난 공고는 뺀다', () => {
    const open = { application_start: null, application_end: null }
    expect(isListable(record({ ...open, sessions: [session('a', '2026-10-10', '10:00', '12:00')] }), NOW)).toBe(false)
    expect(isListable(record({ ...open, sessions: [session('a', '2026-10-15', '09:00', '11:00')] }), NOW)).toBe(false)
    expect(isListable(record({ ...open, sessions: [], period_start: '2026-09-01', period_end: '2026-10-14' }), NOW)).toBe(false)
  })

  it('운영 종료가 확인되지 않으면 남긴다', () => {
    const open = { application_start: null, application_end: null }
    expect(isListable(record({ ...open, sessions: [session('a', '2026-10-10', '10:00', '12:00'), session('b', null, null, null)] }), NOW)).toBe(true)
    expect(isListable(record({ ...open, sessions: [session('a', '2026-10-15', '11:00', '13:00')] }), NOW)).toBe(true)
    expect(isListable(record({ ...open, sessions: [session('a', '2026-10-10', '10:00', '12:00')], session_count: 3 }), NOW)).toBe(true)
    expect(isListable(record({ ...open, sessions: [], period_start: '2026-09-01', period_end: '2026-10-15' }), NOW)).toBe(true)
    expect(isListable(record({ ...open, sessions: [] }), NOW)).toBe(true)
  })
})

describe('검색 결과 분류 (명세 5.1)', () => {
  const craft = record({ program_id: 'craft', sessions: [session('c1', '2026-10-17', '10:10', '12:00')] })
  const art = record({ program_id: 'art', category: 'sports_arts', sessions: [session('a1', '2026-10-17', '10:00', '12:00')] })
  const periodOnly = record({ program_id: 'period', sessions: [], period_start: '2026-10-19', period_end: '2026-12-04', session_count: 12 })
  const older = record({ program_id: 'older', grade_range: [4, 6] })
  const noGrade = record({ program_id: 'no-grade', grade_range: null, target_type: 'multicultural_family' })
  const parentOnly = record({ program_id: 'parents', audience: 'parent_only', target_type: 'parent_only' })
  const closed = record({ program_id: 'closed', application_end: '2026-10-14T18:00' })
  const all = [craft, art, periodOnly, older, noGrade, parentOnly, closed]

  it('조건 없이 탐색하면 needs_confirmation은 비고, 마감·보호자 전용은 빠진다', () => {
    const response = searchPrograms(all, filters(), NOW)
    expect(response.needs_confirmation).toEqual([])
    expect(ids(response.results).sort()).toEqual(['art', 'craft', 'no-grade', 'older', 'period'])
    expect(response.results.every((program) => program.time_match_status === 'not_applied')).toBe(true)
  })

  it('학년·시간과 명시적으로 불일치하면 빼고, 시간 미상은 needs_confirmation으로 보낸다', () => {
    const response = searchPrograms(all, filters({ child_grade: 2, available_windows: [SAT] }), NOW)
    expect(ids(response.results).sort()).toEqual(['craft', 'no-grade'])
    expect(ids(response.needs_confirmation)).toEqual(['period'])
    expect(response.needs_confirmation[0].matched_sessions).toEqual([])
  })

  it('학년 미상은 결과에 남기고 확인 필요로 표시한다', () => {
    const program = searchPrograms([noGrade], filters({ child_grade: 2 }), NOW).results[0]
    expect(program.age_grade_match_status).toBe('unknown')
  })

  it('시간 미상이면서 대상·자격도 미상이면 두 사유를 모두 담는다', () => {
    const both = record({ program_id: 'both', attendance_rule: 'unknown', eligibility_requirements: ['오산시 거주'] })
    const program = searchPrograms([both], filters({ available_windows: [SAT] }), NOW).needs_confirmation[0]
    expect(program.time_match_status).toBe('unknown')
    expect(program.eligibility_status).toBe('unknown')
    expect(program.uncertain_items).toContain('참여 자격 확인 필요: 오산시 거주')
  })

  it('무료만 보기는 cost_krw 0만 남기고 비용 미상은 뺀다', () => {
    const paid = record({ program_id: 'paid', cost_krw: 10000, cost_raw: '10,000원' })
    const unknownCost = record({ program_id: 'unknown-cost', cost_krw: null, cost_raw: null })
    expect(ids(searchPrograms([craft, paid, unknownCost], filters({ free_only: true }), NOW).results)).toEqual(['craft'])
    expect(ids(searchPrograms([craft, paid, unknownCost], filters(), NOW).results).sort()).toEqual(['craft', 'paid', 'unknown-cost'])
  })

  it('관심 분야와 사는 동은 순서만 바꾸고 제외하지 않는다', () => {
    const base = searchPrograms(all, filters(), NOW)
    const preferred = searchPrograms(all, filters({ interests: ['korean_study'], dong: '세마동' }), NOW)
    expect(ids(preferred.results).sort()).toEqual(ids(base.results).sort())
  })

  it('표시 언어는 판정과 목록을 바꾸지 않는다', () => {
    const conditions = { child_grade: 2, available_windows: [SAT] }
    const korean = searchPrograms(all, filters({ ...conditions, display_language: 'ko-easy' }), NOW)
    const vietnamese = searchPrograms(all, filters({ ...conditions, display_language: 'vi' }), NOW)
    expect(vietnamese).toEqual(korean)
  })

  it('실제 공고처럼 기간만 있는 공고는 시간을 넣으면 시간 확인 필요, 넣지 않으면 결과에 남는다', () => {
    const taekwon = record({
      program_id: 'taekwon', sessions: [], period_start: '2026-04-30', period_end: '2026-11-04', session_count: 24,
      attendance_rule: 'unknown', application_start: '2026-04-14T09:00', application_end: '2026-11-01T18:00',
    })
    expect(ids(searchPrograms([taekwon], filters({ available_windows: [SAT] }), NOW).needs_confirmation)).toEqual(['taekwon'])
    const browse = searchPrograms([taekwon], filters(), NOW).results[0]
    expect(browse.time_match_status).toBe('not_applied')
    expect(browse.uncertain_items).toContain(MID_JOIN_ITEM)
  })
})

describe('검색 결과 순서', () => {
  const at = (id: string, date: string | null, overrides: Partial<ProgramRecord> = {}) =>
    record({ program_id: id, sessions: [session(`${id}-1`, date, date ? '10:10' : null, date ? '12:00' : null)], ...overrides })
  const unknownApplication = { application_start: null, application_end: null }
  const upcoming = { application_start: '2026-10-16T09:00', application_end: '2026-10-30T18:00' }

  it('신청 중 → 신청 예정 → 신청 기간 미상, 같은 상태에서는 가장 빠른 회차, 날짜 미상은 뒤', () => {
    const records = [
      at('unknown-early', '2026-10-17', unknownApplication),
      at('upcoming', '2026-10-24', upcoming),
      at('open-late', '2026-10-31'),
      at('open-undated', null),
      at('open-early', '2026-10-17'),
    ]
    expect(ids(searchPrograms(records, filters(), NOW).results)).toEqual(['open-early', 'open-late', 'open-undated', 'upcoming', 'unknown-early'])
  })

  it('시간 조건을 적용한 결과는 일치한 회차 중 가장 빠른 것으로 정렬한다', () => {
    const laterMatch = record({ program_id: 'later-match', sessions: [session('x1', '2026-10-17', '13:00', '15:00'), session('x2', '2026-10-31', '10:10', '12:00')] })
    const earlierMatch = record({ program_id: 'earlier-match', sessions: [session('y1', '2026-10-24', '10:10', '12:00')] })
    expect(ids(searchPrograms([laterMatch, earlierMatch], filters(), NOW).results)).toEqual(['later-match', 'earlier-match'])
    const timed = searchPrograms([laterMatch, earlierMatch], filters({ available_windows: [SAT] }), NOW).results
    expect(ids(timed)).toEqual(['earlier-match', 'later-match'])
    expect(timed[1].next_session?.id).toBe('x2')
  })

  it('needs_confirmation도 확인된 다음 회차 날짜 순, 날짜 미상은 뒤', () => {
    const records = [
      record({ program_id: 'nc-undated', attendance_rule: 'unknown', sessions: [] }),
      record({ program_id: 'nc-late', attendance_rule: 'unknown', sessions: [session('l', '2026-10-31', '10:10', '12:00')] }),
      record({ program_id: 'nc-early', attendance_rule: 'unknown', sessions: [session('e', '2026-10-17', '13:00', '15:00')] }),
      record({ program_id: 'nc-upcoming', attendance_rule: 'unknown', ...upcoming, sessions: [session('u', '2026-10-17', '10:10', '12:00')] }),
    ]
    const response = searchPrograms(records, filters({ available_windows: [SAT] }), NOW)
    expect(response.results).toEqual([])
    expect(ids(response.needs_confirmation)).toEqual(['nc-early', 'nc-late', 'nc-undated', 'nc-upcoming'])
    expect(response.needs_confirmation[0].next_session?.id).toBe('e')
  })

  it('회차가 없는 공고는 원문의 공통 장소로 같은 동을 본다', () => {
    const venue = (dong: string) => ({ place_name: '센터', address: null, dong, online: false })
    const records = [
      record({ program_id: 'v-other', sessions: [], period_start: '2026-10-19', period_end: '2026-12-04', venue: venue('대원동') }),
      record({ program_id: 'v-same', sessions: [], period_start: '2026-10-19', period_end: '2026-12-04', venue: venue('남촌동') }),
    ]
    const response = searchPrograms(records, filters({ dong: '남촌동' }), NOW)
    expect(ids(response.results)).toEqual(['v-same', 'v-other'])
    expect(response.results[0].venue).toEqual(venue('남촌동'))
    expect(evaluateProgram(record(), null, NOW).venue).toBeNull()
  })

  it('같은 날짜에서는 대상·자격 확인 → 관심 분야 → 같은 동 순', () => {
    const date = '2026-10-17'
    const records = [
      at('unsure', date, { eligibility_requirements: null, category: 'korean_study' }),
      at('other-dong', date, { category: 'korean_study', sessions: [session('o', date, '10:10', '12:00', '대원동')] }),
      at('same-dong', date, { category: 'korean_study', sessions: [session('s', date, '10:10', '12:00', '세마동')] }),
      at('other-interest', date, { category: 'career', sessions: [session('i', date, '10:10', '12:00', '세마동')] }),
    ]
    expect(ids(searchPrograms(records, filters({ interests: ['korean_study'], dong: '세마동' }), NOW).results))
      .toEqual(['same-dong', 'other-dong', 'other-interest', 'unsure'])
    expect(ids(searchPrograms(records, filters({ interests: ['career'] }), NOW).results)[0]).toBe('other-interest')
  })
})

describe('검색 조건 검증', () => {
  const errorsOf = (body: unknown) => {
    const parsed = parseSearchFilters(body)
    return parsed.ok ? [] : parsed.errors
  }

  it('빈 본문은 조건 없는 탐색이다', () => {
    expect(parseSearchFilters({})).toEqual({ ok: true, filters: { available_windows: [], interests: [], free_only: false } })
    expect(parseSearchFilters(undefined).ok).toBe(true)
  })

  it('명세 6장 예시를 그대로 받는다', () => {
    const parsed = parseSearchFilters({
      child_grade: 2,
      available_windows: [{ day_of_week: 'sat', start_time: '10:05', end_time: '12:10' }],
      interests: ['experience_culture'],
      dong: '중앙동',
      free_only: false,
      display_language: 'vi',
    })
    expect(parsed).toEqual({
      ok: true,
      filters: {
        child_grade: 2,
        available_windows: [{ day_of_week: 'sat', start_time: '10:05', end_time: '12:10' }],
        interests: ['experience_culture'],
        dong: '중앙동',
        free_only: false,
        display_language: 'vi',
      },
    })
  })

  it('나이와 학년은 하나만, 정해진 범위의 정수만 받는다', () => {
    expect(errorsOf({ child_grade: 2, child_age: 8 })).toHaveLength(1)
    for (const grade of [0, 13, 2.5, '2']) expect(errorsOf({ child_grade: grade })).toHaveLength(1)
    for (const age of [-1, 20, 7.5]) expect(errorsOf({ child_age: age })).toHaveLength(1)
    expect(parseSearchFilters({ child_age: 0 }).ok).toBe(true)
    expect(parseSearchFilters({ child_grade: 12 }).ok).toBe(true)
  })

  it('가능 시간 구간의 요일·날짜·시각을 검사한다', () => {
    const window = (overrides: Record<string, unknown>) => ({ available_windows: [{ start_time: '10:05', end_time: '12:10', ...overrides }] })
    expect(errorsOf(window({ day_of_week: 'saturday' }))).toHaveLength(1)
    expect(errorsOf(window({ date: '2026-02-30' }))).toHaveLength(1)
    expect(errorsOf(window({}))).toHaveLength(1)
    expect(errorsOf(window({ day_of_week: 'sat', date: '2026-10-17' }))).toHaveLength(1)
    expect(errorsOf(window({ day_of_week: 'sat', start_time: '9:00' }))).toHaveLength(1)
    expect(errorsOf(window({ day_of_week: 'sat', start_time: '12:10', end_time: '12:10' }))).toHaveLength(1)
    expect(errorsOf(window({ day_of_week: 'sat', start_time: '22:00', end_time: '01:00' }))).toHaveLength(1)
    expect(errorsOf({ available_windows: 'sat' })).toHaveLength(1)
    expect(errorsOf(window({ date: '2026-10-17' }))).toEqual([])
    expect(errorsOf({ available_windows: [{ day_of_week: 'sat', start_time: '10:05', end_time: '12:10' }, 'x'] })[0]).toContain('2번째')
  })

  it('관심 분야·무료·표시 언어·동의 형식을 검사한다', () => {
    expect(errorsOf({ interests: ['music'] })).toHaveLength(1)
    expect(errorsOf({ interests: 'career' })).toHaveLength(1)
    expect(errorsOf({ free_only: 'yes' })).toHaveLength(1)
    expect(errorsOf({ display_language: 'en' })).toHaveLength(1)
    expect(errorsOf({ dong: 3 })).toHaveLength(1)
    expect(errorsOf([])).toHaveLength(1)
    const parsed = parseSearchFilters({ interests: ['career', 'career'], dong: '  ', free_only: true, child_grade: null })
    expect(parsed).toEqual({ ok: true, filters: { available_windows: [], interests: ['career'], free_only: true } })
  })

  it('오류 문구는 한국어다', () => {
    expect(errorsOf({ child_grade: 20 })[0]).toMatch(/학년/)
  })
})
