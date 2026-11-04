import { describe, expect, it } from 'vitest'
import { getMockProgram, searchMockPrograms } from '../data/mock'
import { emptyFilters } from '../data/types'
import type { Program } from '../data/types'
import { classNames, groupSessions, inquiryMessage, isPreferred, isUnlikelyBasis, itemsToCheck, nextByClass, splitSessions, timeUnknownReason } from '../lib/content'
import { filterChips, selectionFrom, uniqueWindows, windowsFrom } from '../lib/filters'
import { formatListStatus, periodText, placeName } from '../lib/format'
import { parseFilters } from '../lib/session'

const mock = (id: string): Program => getMockProgram(id, emptyFilters())!
const session = (id: string, date: string | null, start = '15:30', end = '17:30') => ({ id, date, start_time: start, end_time: end, place_name: '센터', dong: null, online: false })
const companion = { topic: 'companion' as const, note_ko: '■ 대상: 만 4~7세 자녀와 부모' }

describe('기관에 확인할 점의 동반 항목', () => {
  it('공고로 확인된 쪽은 다시 묻지 않는다', () => {
    const topics = (guardian: Program['guardian_companion'], sibling: Program['sibling_companion']) =>
      itemsToCheck({ ...mock('demo-korean'), uncertain_items: [companion], guardian_companion: guardian, sibling_companion: sibling }).map((item) => item.topic)
    expect(topics('required', null)).toEqual(['sibling'])
    expect(topics(null, 'allowed')).toEqual(['guardian'])
    expect(topics('allowed', 'not_allowed')).toEqual([])
    expect(topics(null, null)).toEqual(['companion'])
  })

  it('동반을 말하지 않는 원문은 근거로 붙이지 않는다', () => {
    const [item] = itemsToCheck({ ...mock('demo-korean'), uncertain_items: [companion], guardian_companion: null, sibling_companion: null })
    expect(item.note_ko).toBeNull()
  })
})

describe('회차', () => {
  const program = (sessions: Program['sessions'], extra: Partial<Program> = {}): Program => ({ ...mock('demo-korean'), sessions, as_of: '2026-10-15', ...extra })

  it('판정 기준일로 지난 회차와 앞으로의 회차를 가른다', () => {
    const { past, upcoming } = splitSessions(program([session('a', '2026-10-14'), session('b', '2026-10-15'), session('c', null)]))
    expect(past.map((item) => item.id)).toEqual(['a'])
    expect(upcoming.map((item) => item.id)).toEqual(['b', 'c'])
  })

  it('월·금 두 반이 번갈아 나오면 공고에 적힌 반 이름으로 묶는다', () => {
    const sessions = [session('m1', '2026-10-19'), session('f1', '2026-10-23'), session('m2', '2026-10-26'), session('f2', '2026-10-30')]
    const target = program(sessions, { description: 'A반(월요일)은 10월 19일부터, B반(금요일)은 10월 23일부터 해요.' })
    expect(classNames(target)).toEqual([{ name: 'A반', day: 'mon' }, { name: 'B반', day: 'fri' }])
    expect(groupSessions(target, sessions)?.map((group) => [group.className, group.sessions.map((item) => item.id)])).toEqual([['A반', ['m1', 'm2']], ['B반', ['f1', 'f2']]])
  })

  it('요일과 시간이 같아도 장소가 다르면 따로 묶어 장소를 잃지 않는다', () => {
    const at = (id: string, date: string, place_name: string) => ({ ...session(id, date), place_name })
    const sessions = [
      at('a1', '2026-10-05', '가 센터'), at('b1', '2026-10-12', '나 센터'), at('a2', '2026-10-19', '가 센터'),
      at('b2', '2026-10-26', '나 센터'), at('a3', '2026-11-02', '가 센터'), at('b3', '2026-11-09', '나 센터'),
    ]
    const groups = groupSessions(program(sessions), sessions)!
    expect(groups.map((group) => [group.sessions[0].place_name, group.sessions.length])).toEqual([['가 센터', 3], ['나 센터', 3]])
  })

  it('쉬는 주가 있으면 매주라고 하지 않는다', () => {
    const description = 'A반(월요일)과 B반(금요일)이 있어요.'
    const monday = ['2026-10-19', '2026-10-26', '2026-11-02'].map((date, index) => session(`m${index}`, date))
    const friday = ['2026-10-23', '2026-10-30', '2026-11-13'].map((date, index) => session(`f${index}`, date))
    const groups = groupSessions(program([...monday, ...friday], { description }), [...monday, ...friday])!
    expect(groups.map((group) => [group.className, group.weekly])).toEqual([['A반', true], ['B반', false]])
  })

  it('반 없이 회차가 적으면 묶지 않고 날짜를 그대로 보인다', () => {
    const sessions = ['2026-10-15', '2026-10-20', '2026-10-22', '2026-10-27'].map((date, index) => session(`s${index}`, date))
    expect(groupSessions(program(sessions), sessions)).toBeNull()
  })

  it('반이 나뉘면 반마다 다음 회차를 알려 준다', () => {
    const sessions = [session('m1', '2026-10-05'), session('m2', '2026-10-19'), session('f1', '2026-10-23')]
    const next = nextByClass(program(sessions, { description: 'A반(월요일) B반(금요일)' }))!
    expect(next.map((item) => [item.name, item.session.id])).toEqual([['A반', 'm2'], ['B반', 'f1']])
    expect(nextByClass(program(sessions))).toBeNull()
  })

  it('회차 날짜가 없으면 공고의 기간과 횟수를 보여 준다', () => {
    expect(periodText({ period_start: '2026-06-08', period_end: '2026-12-01', session_count: 3 }, 'ko-easy')).toBe('6월 8일 (월) ~ 12월 1일 (화) · 총 3회')
    expect(periodText({ period_start: '2026-06-08', period_end: '2026-06-08', session_count: null }, 'ko-easy')).toBe('6월 8일 (월)')
    expect(periodText({ period_start: null, period_end: null, session_count: 3 }, 'ko-easy')).toBeNull()
  })

  it('동 먼저 보기는 지난 회차나 시간이 안 맞는 회차로 판단하지 않는다', () => {
    const at = (id: string, date: string, dong: string) => ({ ...session(id, date), dong })
    const filters = { ...emptyFilters(), dong: '세마동', interests: [] }
    const past = at('past', '2026-10-01', '세마동')
    const later = at('later', '2026-10-20', '대원동')
    expect(isPreferred(program([past, later], { category: 'korean_study' }), filters)).toBe(false)
    expect(isPreferred(program([later, at('next', '2026-10-27', '세마동')], { category: 'korean_study' }), filters)).toBe(true)
    // 시간을 넣었으면 맞는 회차의 동만 본다
    const matched = { category: 'korean_study' as const, time_match_status: 'matched' as const, matched_sessions: ['later'] }
    expect(isPreferred(program([later, at('next', '2026-10-27', '세마동')], matched), filters)).toBe(false)
  })

  it('되풀이되지 않는 회차는 묶지 않는다', () => {
    const sessions = [session('a', '2026-10-19'), session('b', '2026-10-20'), session('c', '2026-10-21')]
    expect(groupSessions(program(sessions), sessions)).toBeNull()
  })

  it('시간이 맞는지 모르는 이유를 공고 사정대로 고른다', () => {
    const unknown = { time_match_status: 'unknown' as const }
    expect(timeUnknownReason(program([session('a', '2026-10-19')], { ...unknown, attendance_rule: 'unknown' }))).toBe('timeWhyAttendance')
    expect(timeUnknownReason(program([session('a', null)], { ...unknown, attendance_rule: 'unknown' }))).toBe('timeWhyMissing')
    expect(timeUnknownReason(program([session('a', '2026-10-01'), session('b', '2026-10-19')], { ...unknown, attendance_rule: 'all_sessions' }))).toBe('timeWhyMidJoin')
    expect(timeUnknownReason(program([session('a', '2026-10-19')]))).toBeNull()
  })
})

describe('먼저 보기와 학교급', () => {
  it('고른 분야가 신청 상태와 날짜보다 먼저 온다', () => {
    const results = searchMockPrograms({ ...emptyFilters(), interests: ['career'] }).results
    expect(results[0].category).toBe('career')
  })

  it('시연 공고의 신청 마감은 첫 일정보다 늦지 않다', () => {
    for (const program of searchMockPrograms(emptyFilters()).results) {
      const first = program.sessions.map((item) => item.date).filter(Boolean).sort()[0]
      if (first && program.application_status === 'open') expect(program.application_end! <= first).toBe(true)
    }
  })

  it('중학생·고등학생도 조건으로 넣고 되살릴 수 있다', () => {
    expect(filterChips({ ...emptyFilters(), child_grade: 8 }, 'ko-easy')[0].label).toBe('중학교 2학년')
    expect(filterChips({ ...emptyFilters(), child_grade: 12 }, 'ko-easy')[0].label).toBe('고등학교 3학년')
    expect(parseFilters(JSON.stringify({ child_grade: 8 })).child_grade).toBe(8)
  })
})

describe('기관에 물을 한국어 문장', () => {
  it('공고에 없는 내용과 비용을 문장으로 만든다', () => {
    const message = inquiryMessage({ ...mock('demo-korean'), cost_krw: null, uncertain_items: [{ topic: 'materials', note_ko: null }] })!
    expect(message).toContain('‘주말 한국어 놀이교실’')
    expect(message).toContain('준비물이나 추가 비용이 있나요?')
    expect(message).toContain('참가비가 있나요?')
  })

  it('물을 것이 없으면 만들지 않는다', () => {
    expect(inquiryMessage({ ...mock('demo-korean'), uncertain_items: [], eligibility_status: 'matched', cost_krw: 0 })).toBeNull()
  })
})

describe('장소 이름', () => {
  it('층을 뒤로 보내고, 여러 곳을 적은 이름은 그대로 둔다', () => {
    expect(placeName('2층 가족센터')).toBe('가족센터 2층')
    expect(placeName('2층 오산시가족센터 내')).toBe('오산시가족센터 2층')
    expect(placeName('2층 오산시가족센터 및 대호중학교')).toBe('2층 오산시가족센터 및 대호중학교')
    expect(placeName('오산시가족센터 2층')).toBe('오산시가족센터 2층')
  })
})

describe('목록의 신청 표시', () => {
  const open = { application_status: 'open' as const, application_start: '2026-10-01', application_end: '2026-10-22', application_issue: null, as_of: '2026-10-15' }

  it('신청 중이면 마감일을 적는다', () => {
    expect(formatListStatus(open, 'ko-easy')).toBe('10월 22일 (목)까지 신청')
    expect(formatListStatus({ ...open, as_of: '2026-10-22' }, 'ko-easy')).toBe('오늘까지 신청')
  })

  it('신청 기간을 믿기 어려우면 날짜를 단정하지 않는다', () => {
    expect(formatListStatus({ ...open, application_issue: { kind: 'conflict', note_ko: null, event_date: null } }, 'ko-easy')).toBe('신청 받는 중')
  })

  it('신청 중이 아니면 그 상태를 그대로 적는다', () => {
    expect(formatListStatus({ ...open, application_status: 'closed' }, 'ko-easy')).toBe('신청 마감')
  })
})

describe('요일과 시간대 고르기', () => {
  const keys = (windows: ReturnType<typeof windowsFrom>) => windows.map((window) => `${'day_of_week' in window ? window.day_of_week : window.date} ${window.start_time}~${window.end_time}`)

  it('요일과 시간대를 곱해 구간을 만든다', () => {
    expect(keys(windowsFrom(['sat', 'sun'], ['morning']))).toEqual(['sat 09:00~13:00', 'sun 09:00~13:00'])
  })

  it('이어진 시간대는 합쳐 경계에 걸친 수업도 맞게 한다', () => {
    expect(keys(windowsFrom(['sat'], ['morning', 'afternoon']))).toEqual(['sat 09:00~18:00'])
    expect(keys(windowsFrom(['sat'], ['morning', 'afternoon', 'evening']))).toEqual(['sat 09:00~22:00'])
    expect(keys(windowsFrom(['sat'], ['morning', 'evening']))).toEqual(['sat 09:00~13:00', 'sat 17:00~22:00'])
  })

  it('요일만 고르면 종일, 시간대만 고르면 모든 요일, 둘 다 없으면 조건 없음', () => {
    expect(keys(windowsFrom(['mon'], []))).toEqual(['mon 06:00~22:00'])
    expect(windowsFrom([], ['evening'])).toHaveLength(7)
    expect(windowsFrom([], [])).toEqual([])
  })

  it('저장된 조건을 다시 열면 고른 그대로 되살린다', () => {
    expect(selectionFrom(windowsFrom(['sat', 'sun'], ['morning']))).toEqual({ days: ['sat', 'sun'], parts: ['morning'], custom: [] })
    expect(selectionFrom(windowsFrom(['sat'], ['morning', 'afternoon']))).toMatchObject({ days: ['sat'], parts: ['morning', 'afternoon'] })
    expect(selectionFrom(windowsFrom([], ['evening']))).toEqual({ days: [], parts: ['evening'], custom: [] })
  })

  it('직접 넣은 시간은 그대로 남기고 겹치는 구간은 하나로 둔다', () => {
    const custom = { day_of_week: 'sat' as const, start_time: '10:05', end_time: '12:10' }
    expect(selectionFrom([...windowsFrom(['mon'], ['morning']), custom])).toEqual({ days: ['mon'], parts: ['morning'], custom: [custom] })
    const window = windowsFrom(['mon'], ['morning'])
    expect(uniqueWindows([...window, ...window])).toHaveLength(1)
  })
})

describe('기준이 다른 공고 접기', () => {
  const unknown = { ...mock('demo-korean'), age_grade_match_status: 'unknown' as const }
  const middle = { ...unknown, grade_range: [7, 9] as [number, number], age_range: null }
  const elementary = { ...unknown, grade_range: [1, 6] as [number, number], age_range: null }
  const byAge = { ...unknown, grade_range: null, age_range: [8, 12] as [number, number] }

  it('차이가 크면 접는다: 만 8세와 중학생', () => {
    expect(isUnlikelyBasis(middle, { ...emptyFilters(), child_age: 8 })).toBe(true)
  })

  it('두 살의 여유 안이면 접지 않는다', () => {
    expect(isUnlikelyBasis(elementary, { ...emptyFilters(), child_age: 8 })).toBe(false)
    expect(isUnlikelyBasis(middle, { ...emptyFilters(), child_age: 10 })).toBe(false)
    expect(isUnlikelyBasis(byAge, { ...emptyFilters(), child_grade: 8 })).toBe(false)
  })

  it('고등학생과 8~12세처럼 벌어지면 접는다', () => {
    expect(isUnlikelyBasis(byAge, { ...emptyFilters(), child_grade: 12 })).toBe(true)
  })

  it('같은 기준으로 판정된 공고는 건드리지 않는다', () => {
    expect(isUnlikelyBasis({ ...middle, age_grade_match_status: 'not_matched' }, { ...emptyFilters(), child_age: 8 })).toBe(false)
  })
})
