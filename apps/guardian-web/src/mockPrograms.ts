import type { AvailableWindow, MatchStatus, Program, ProgramSession, SearchFilters, SearchResponse, Weekday } from './types'

const dayCodes: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function offsetDate(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function nextWeekday(weekday: number, weeksLater = 0): string {
  const today = new Date().getDay()
  const days = ((weekday - today + 7) % 7 || 7) + weeksLater * 7
  return offsetDate(days)
}

function session(id: string, date: string | null, start: string | null, end: string | null, place: string | null, dong: string | null): ProgramSession {
  return { id, date, start_time: start, end_time: end, place_name: place, dong, online: false }
}

const base = {
  age_grade_match_status: 'not_applied' as MatchStatus,
  time_match_status: 'not_applied' as MatchStatus,
  matched_reasons: [] as string[],
  matched_sessions: [] as string[],
  next_session: null as ProgramSession | null,
  source_url: 'https://example.com/',
  verified_at: offsetDate(-1),
}

const programs: Program[] = [
  {
    ...base,
    program_id: 'demo-craft', title: '토요 만들기 체험', institution: '가상 중앙동 도서관',
    category: 'experience_culture', target_raw: '초등 1~3학년',
    description: '주말에 재료를 만지고 작은 작품을 만드는 체험입니다. 회차별 장소를 확인해 주세요.',
    grade_range: [1, 3], age_range: null, eligibility_status: 'unknown',
    uncertain_items: ['보호자·형제자매 동반 가능 여부'], attendance_rule: 'choose_one',
    sessions: [
      session('craft-1', nextWeekday(6), '10:10', '12:00', '중앙동 도서관', '중앙동'),
      session('craft-2', nextWeekday(6, 1), '13:00', '15:00', '대원동 센터', '대원동'),
    ],
    cost_krw: 0, cost_raw: '무료', application_status: 'open',
    application_start: offsetDate(-2), application_end: offsetDate(5),
    application_methods: [{ type: 'online', label: '시연용 외부 링크', url: 'https://example.com/' }, { type: 'phone', label: '기관에 전화하기', phone: '031-000-0000' }],
  },
  {
    ...base,
    program_id: 'demo-korean', title: '주말 한국어 놀이교실', institution: '가상 오산 가족센터',
    category: 'korean_study', target_raw: '다문화가족 초등 1~4학년',
    description: '놀이와 이야기로 한국어를 익히는 프로그램입니다.',
    grade_range: [1, 4], age_range: null, eligibility_status: 'unknown',
    uncertain_items: ['다문화가족 자격 확인', '동반 가능 여부'], attendance_rule: 'choose_one',
    sessions: [session('korean-1', nextWeekday(6, 1), '10:30', '12:00', '가상 센터 교육실', '중앙동')],
    cost_krw: 0, cost_raw: '무료', application_status: 'unknown',
    application_start: null, application_end: null,
    application_methods: [{ type: 'phone', label: '기관에 전화하기', phone: '031-000-0001' }],
  },
  {
    ...base,
    program_id: 'demo-choir', title: '어린이 합창 교실', institution: '가상 문화센터',
    category: 'sports_arts', target_raw: '8~12세',
    description: '노래를 함께 배우고 작은 발표를 준비합니다.',
    grade_range: null, age_range: [8, 12], eligibility_status: 'matched',
    uncertain_items: [], attendance_rule: 'all_sessions',
    sessions: [session('choir-1', nextWeekday(6, 2), '14:00', '15:30', '가상 문화센터', '대원동'), session('choir-2', nextWeekday(6, 3), '14:00', '15:30', '가상 문화센터', '대원동')],
    cost_krw: 10000, cost_raw: '참가비 10,000원', application_status: 'upcoming',
    application_start: offsetDate(4), application_end: offsetDate(12),
    application_methods: [{ type: 'online', label: '시연용 외부 링크', url: 'https://example.com/' }],
  },
  {
    ...base,
    program_id: 'demo-art', title: '주말 미술 4회 과정', institution: '가상 청소년문화의집',
    category: 'sports_arts', target_raw: '초등 1~6학년',
    description: '네 번의 수업에 모두 참여하는 미술 과정입니다.',
    grade_range: [1, 6], age_range: null, eligibility_status: 'matched',
    uncertain_items: [], attendance_rule: 'all_sessions',
    sessions: [0, 1, 2, 3].map((week) => session(`art-${week}`, nextWeekday(6, week), '10:00', '12:00', '가상 청소년문화의집', '신장동')),
    cost_krw: null, cost_raw: null, application_status: 'open',
    application_start: offsetDate(-1), application_end: offsetDate(3),
    application_methods: [{ type: 'visit', label: '방문해서 문의하기', address: '오산시 신장동 (시연용 주소)' }],
  },
  {
    ...base,
    program_id: 'demo-unknown-time', title: '가족 진로 탐색', institution: '가상 교육지원센터',
    category: 'career', target_raw: '초등 3~6학년',
    description: '자녀와 함께 관심 분야를 알아보는 시간입니다. 정확한 일시는 공고에서 확인해 주세요.',
    grade_range: [3, 6], age_range: null, eligibility_status: 'unknown',
    uncertain_items: ['동반 대상', '운영 일시'], attendance_rule: 'unknown',
    sessions: [session('career-1', null, null, null, '가상 교육지원센터', '중앙동')],
    cost_krw: 0, cost_raw: '무료', application_status: 'unknown',
    application_start: null, application_end: null, application_methods: [],
  },
  {
    ...base,
    program_id: 'demo-closed', title: '가족 요리 체험', institution: '가상 가족센터',
    category: 'experience_culture', target_raw: '초등학생 가족',
    description: '가족이 함께 요리하는 체험입니다. 신청은 마감되었습니다.',
    grade_range: null, age_range: null, eligibility_status: 'unknown',
    uncertain_items: ['대상 학년'], attendance_rule: 'choose_one',
    sessions: [session('closed-1', nextWeekday(6), '10:00', '12:00', '가상 가족센터', '중앙동')],
    cost_krw: 0, cost_raw: '무료', application_status: 'closed',
    application_start: offsetDate(-20), application_end: offsetDate(-1), application_methods: [],
  },
]

function weekdayOf(date: string): Weekday {
  const [year, month, day] = date.split('-').map(Number)
  return dayCodes[new Date(year, month - 1, day).getDay()]
}

function windowContains(window: AvailableWindow, item: ProgramSession): boolean {
  if (!item.date || !item.start_time || !item.end_time) return false
  const correctDay = 'date' in window ? window.date === item.date : window.day_of_week === weekdayOf(item.date)
  return correctDay && window.start_time <= item.start_time && item.end_time <= window.end_time
}

function timeResult(program: Program, windows: AvailableWindow[]): { status: MatchStatus; matched: string[] } {
  if (!windows.length) return { status: 'not_applied', matched: [] }
  if (program.attendance_rule === 'unknown') return { status: 'unknown', matched: [] }
  const today = offsetDate(0)
  const future = program.sessions.filter((item) => !item.date || item.date >= today)
  const past = program.sessions.some((item) => item.date && item.date < today)
  const unknown = future.some((item) => !item.date || !item.start_time || !item.end_time)
  const matched = future.filter((item) => windows.some((window) => windowContains(window, item))).map((item) => item.id)

  if (program.attendance_rule === 'choose_one') {
    if (matched.length) return { status: 'matched', matched }
    return { status: unknown ? 'unknown' : 'not_matched', matched: [] }
  }
  const confirmed = future.filter((item) => item.date && item.start_time && item.end_time)
  if (confirmed.some((item) => !matched.includes(item.id))) return { status: 'not_matched', matched: [] }
  if (unknown || (past && !program.mid_join_allowed)) return { status: 'unknown', matched }
  return { status: matched.length ? 'matched' : 'not_matched', matched }
}

function ageGradeStatus(program: Program, filters: SearchFilters): MatchStatus {
  if (filters.child_grade !== undefined) {
    if (!program.grade_range) return 'unknown'
    return filters.child_grade >= program.grade_range[0] && filters.child_grade <= program.grade_range[1] ? 'matched' : 'not_matched'
  }
  if (filters.child_age !== undefined) {
    if (!program.age_range) return 'unknown'
    return filters.child_age >= program.age_range[0] && filters.child_age <= program.age_range[1] ? 'matched' : 'not_matched'
  }
  return 'not_applied'
}

function evaluate(program: Program, filters: SearchFilters): Program {
  const ageGrade = ageGradeStatus(program, filters)
  const time = timeResult(program, filters.available_windows)
  const next = program.sessions
    .filter((item) => item.date && item.date >= offsetDate(0))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0] ?? program.sessions[0] ?? null
  const matchedSession = program.sessions.find((item) => time.matched.includes(item.id))
  const reasons: string[] = []
  if (ageGrade === 'matched') reasons.push('입력한 나이·학년 조건과 맞아요')
  if (time.status === 'matched') reasons.push('입력한 시간 안에 운영 회차가 있어요')
  return {
    ...program, age_grade_match_status: ageGrade, time_match_status: time.status,
    matched_sessions: time.matched, matched_reasons: reasons,
    next_session: matchedSession ?? next,
  }
}

const applicationOrder = { open: 0, upcoming: 1, unknown: 2, closed: 3 }

function comparePrograms(a: Program, b: Program, filters: SearchFilters): number {
  const application = applicationOrder[a.application_status] - applicationOrder[b.application_status]
  if (application) return application
  const date = (a.next_session?.date ?? '9999-12-31').localeCompare(b.next_session?.date ?? '9999-12-31')
  if (date) return date
  const certainty = Number(a.age_grade_match_status === 'unknown' || a.eligibility_status === 'unknown') - Number(b.age_grade_match_status === 'unknown' || b.eligibility_status === 'unknown')
  if (certainty) return certainty
  const interest = Number(filters.interests.includes(b.category)) - Number(filters.interests.includes(a.category))
  if (interest) return interest
  return Number(b.next_session?.dong === filters.dong) - Number(a.next_session?.dong === filters.dong)
}

export function searchMockPrograms(filters: SearchFilters): SearchResponse {
  const candidates = programs
    .filter((program) => program.application_status !== 'closed')
    .filter((program) => !filters.free_only || program.cost_krw === 0)
    .map((program) => evaluate(program, filters))
    .filter((program) => program.age_grade_match_status !== 'not_matched' && program.time_match_status !== 'not_matched' && program.eligibility_status !== 'not_matched')
  const results = candidates.filter((program) => program.time_match_status !== 'unknown').sort((a, b) => comparePrograms(a, b, filters))
  const needs_confirmation = candidates.filter((program) => program.time_match_status === 'unknown').sort((a, b) => comparePrograms(a, b, filters))
  return { results, needs_confirmation }
}

export function getMockProgram(id: string, filters: SearchFilters): Program | null {
  const program = programs.find((item) => item.program_id === id)
  return program ? evaluate(program, filters) : null
}
