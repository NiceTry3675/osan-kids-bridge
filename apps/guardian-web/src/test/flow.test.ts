import { describe, expect, it } from 'vitest'
import { getMockProgram, searchMockPrograms } from '../data/mock'
import { emptyFilters } from '../data/types'
import type { Program } from '../data/types'
import { classNames, groupSessions, inquiryMessage, itemsToCheck, splitSessions, timeUnknownReason } from '../lib/content'
import { filterChips } from '../lib/filters'
import { placeName } from '../lib/format'
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
