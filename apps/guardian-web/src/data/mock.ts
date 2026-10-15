/**
 * 데모 어댑터: 서버(POST /programs/search, GET /programs/{id}, POST /programs/{id}/evaluate)를
 * 브라우저 안에서 흉내 냅니다. 명세 4·5장 판정 규칙을 재현하지만 운영 판정의 근거가 아닙니다.
 * 공고·기관·연락처·번역은 모두 지어낸 시연용 값입니다.
 */
import type { AvailableWindow, MatchStatus, Program, ProgramSession, SearchFilters, SearchResponse, Weekday } from './types'

const dayCodes: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const today = () => new Date()

function offsetDate(days: number): string {
  const date = today()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

function nextWeekday(weekday: number, weeksLater = 0): string {
  const days = ((weekday - today().getDay() + 7) % 7 || 7) + weeksLater * 7
  return offsetDate(days)
}

const SAT = 6
const WED = 3

function session(id: string, date: string | null, start: string | null, end: string | null, place: string | null, dong: string | null): ProgramSession {
  return { id, date, start_time: start, end_time: end, place_name: place, dong, online: false }
}

function base(): Pick<Program, 'age_grade_match_status' | 'time_match_status' | 'matched_reasons' | 'matched_sessions' | 'next_session' | 'source_url' | 'verified_at' | 'review_state' | 'is_demo' | 'summaries_by_language' | 'application_languages' | 'support_languages' | 'guardian_companion' | 'sibling_companion' | 'korean_level_required' | 'inquiry_methods'> {
  return {
    age_grade_match_status: 'not_applied',
    time_match_status: 'not_applied',
    matched_reasons: [],
    matched_sessions: [],
    next_session: null,
    source_url: 'https://example.com/',
    verified_at: offsetDate(-1),
    review_state: 'current',
    is_demo: true,
    summaries_by_language: {},
    application_languages: null,
    support_languages: null,
    guardian_companion: null,
    sibling_companion: null,
    korean_level_required: null,
    inquiry_methods: [],
  }
}

function buildPrograms(): Program[] {
  return [
    {
      ...base(),
      program_id: 'demo-korean',
      title: '주말 한국어 놀이교실',
      institution: '가상 오산 가족센터',
      category: 'korean_study',
      target_raw: '다문화가족 초등 1~4학년',
      target_type: 'multicultural_family',
      description: '놀이와 이야기로 한국어를 익히는 프로그램입니다. 회차 중 하나를 골라 참여합니다. 필기도구를 가져오세요.',
      grade_range: [1, 4], age_range: null, eligibility_status: 'unknown',
      uncertain_items: [{ topic: 'family_eligibility', note_ko: '다문화가족 자녀' }, { topic: 'companion', note_ko: '형제자매 동반은 적혀 있지 않음' }],
      attendance_rule: 'choose_one',
      sessions: [
        session('korean-1', nextWeekday(SAT), '10:30', '12:00', '가상 가족센터 2층 교육실', '중앙동'),
        session('korean-2', nextWeekday(SAT, 1), '10:30', '12:00', '가상 가족센터 2층 교육실', '중앙동'),
      ],
      cost_krw: 0, cost_raw: '무료',
      application_status: 'open', application_start: offsetDate(-3), application_end: offsetDate(6),
      application_methods: [{ type: 'online', url: 'https://example.com/apply' }],
      application_languages: ['ko'],
      inquiry_methods: [{ type: 'phone', phone: '031-000-0001', hours: '평일 10:00~17:00', languages: ['ko', 'vi'], verified_at: offsetDate(-1) }],
      support_languages: ['ko', 'vi'],
      guardian_companion: 'allowed',
      sibling_companion: null,
      korean_level_required: '한국어를 처음 배우는 어린이도 참여할 수 있어요',
      summaries_by_language: {
        'ko-easy': { title: '주말 한국어 놀이교실', institution: '가상 오산 가족센터', target: '다문화가족의 초등학교 1~4학년 어린이', description: '놀면서 한국어를 배워요. 두 번의 수업 중 하나를 골라 오면 돼요. 필기도구를 챙겨 주세요.', reviewed_at: offsetDate(-1) },
        vi: { title: 'Lớp học vui chơi tiếng Hàn cuối tuần', institution: 'Trung tâm Gia đình Osan (mô phỏng)', target: 'Trẻ lớp 1–4 tiểu học thuộc gia đình đa văn hóa', description: 'Trẻ học tiếng Hàn qua trò chơi và kể chuyện. Chọn một trong hai buổi để tham gia. Vui lòng mang theo dụng cụ viết.', reviewed_at: offsetDate(-1) },
        zh: { title: '周末韩语游戏班', institution: '乌山家庭中心（模拟）', target: '多文化家庭的小学1～4年级儿童', description: '通过游戏和故事学习韩语。从两次课程中任选一次参加。请携带书写用具。', reviewed_at: offsetDate(-1) },
      },
    },
    {
      ...base(),
      program_id: 'demo-craft',
      title: '토요 만들기 체험',
      institution: '가상 중앙동 도서관',
      category: 'experience_culture',
      target_raw: '초등 1~3학년',
      target_type: 'all',
      description: '주말에 재료를 만지고 작은 작품을 만드는 체험입니다. 회차마다 장소가 다르니 확인해 주세요.',
      grade_range: [1, 3], age_range: null, eligibility_status: 'matched',
      uncertain_items: [{ topic: 'companion', note_ko: null }],
      attendance_rule: 'choose_one',
      sessions: [
        session('craft-1', nextWeekday(SAT), '10:10', '12:00', '가상 중앙동 도서관', '중앙동'),
        session('craft-2', nextWeekday(SAT, 1), '13:00', '15:00', '가상 대원동 센터', '대원동'),
      ],
      cost_krw: 0, cost_raw: '무료',
      application_status: 'open', application_start: offsetDate(-2), application_end: offsetDate(5),
      application_methods: [{ type: 'online', url: 'https://example.com/apply' }, { type: 'phone', phone: '031-000-0000' }],
      inquiry_methods: [{ type: 'phone', phone: '031-000-0000', hours: '화~일 09:00~18:00', languages: null, verified_at: offsetDate(-1) }],
      summaries_by_language: {
        'ko-easy': { title: '토요 만들기 체험', institution: '가상 중앙동 도서관', target: '초등학교 1~3학년 어린이', description: '재료를 만지며 작은 작품을 만들어요. 두 번 중 하나를 골라요. 두 번의 장소가 서로 달라요.', reviewed_at: offsetDate(-1) },
        vi: { title: 'Trải nghiệm làm đồ thủ công thứ Bảy', institution: 'Thư viện Jungang-dong (mô phỏng)', target: 'Trẻ lớp 1–3 tiểu học', description: 'Trẻ làm một tác phẩm nhỏ bằng nhiều loại vật liệu. Chọn một trong hai buổi. Hai buổi diễn ra ở hai địa điểm khác nhau.', reviewed_at: offsetDate(-1) },
      },
    },
    {
      ...base(),
      program_id: 'demo-choir',
      title: '어린이 합창 교실',
      institution: '가상 문화센터',
      category: 'sports_arts',
      target_raw: '8~12세',
      target_type: 'all',
      description: '노래를 함께 배우고 작은 발표를 준비합니다. 두 번 모두 참여해야 합니다.',
      grade_range: null, age_range: [8, 12], eligibility_status: 'matched',
      uncertain_items: [],
      attendance_rule: 'all_sessions',
      sessions: [
        session('choir-1', nextWeekday(SAT, 2), '14:00', '15:30', '가상 문화센터 소강당', '대원동'),
        session('choir-2', nextWeekday(SAT, 3), '14:00', '15:30', '가상 문화센터 소강당', '대원동'),
      ],
      cost_krw: 10000, cost_raw: '참가비 10,000원',
      application_status: 'upcoming', application_start: offsetDate(4), application_end: offsetDate(12),
      application_methods: [{ type: 'online', url: 'https://example.com/apply' }],
      inquiry_methods: [{ type: 'online', url: 'https://example.com/contact', hours: null, languages: null, verified_at: offsetDate(-9) }],
      review_state: 'recheck',
      verified_at: offsetDate(-9),
    },
    {
      ...base(),
      program_id: 'demo-art',
      title: '주말 미술 4회 과정',
      institution: '가상 청소년문화의집',
      category: 'sports_arts',
      target_raw: '초등 1~6학년',
      target_type: 'all',
      description: '네 번의 수업에 모두 참여하는 미술 과정입니다. 재료비는 공고에 적혀 있지 않습니다.',
      grade_range: [1, 6], age_range: null, eligibility_status: 'matched',
      uncertain_items: [{ topic: 'materials', note_ko: '재료비 별도 여부 미기재' }],
      attendance_rule: 'all_sessions',
      sessions: [0, 1, 2, 3].map((week) => session(`art-${week}`, nextWeekday(SAT, week), '10:00', '12:00', '가상 청소년문화의집', '신장동')),
      cost_krw: null, cost_raw: null,
      application_status: 'open', application_start: offsetDate(-1), application_end: offsetDate(3),
      application_methods: [{ type: 'visit', address: '오산시 신장동 (시연용 주소)' }],
    },
    {
      ...base(),
      program_id: 'demo-reading',
      title: '수요일 그림책 읽기',
      institution: '가상 세마동 작은도서관',
      category: 'korean_study',
      target_raw: '누구나 (초등 저학년 권장)',
      target_type: 'all',
      description: '사서와 함께 그림책을 읽고 이야기를 나눕니다. 신청 없이 와도 되지만 자리가 부족하면 먼저 온 순서로 들어갑니다.',
      grade_range: null, age_range: null, eligibility_status: 'matched',
      uncertain_items: [{ topic: 'age_grade', note_ko: '초등 저학년 권장' }],
      attendance_rule: 'choose_one',
      sessions: [
        session('reading-1', nextWeekday(WED), '16:00', '17:00', '가상 세마동 작은도서관', '세마동'),
        session('reading-2', nextWeekday(WED, 1), '16:00', '17:00', '가상 세마동 작은도서관', '세마동'),
      ],
      cost_krw: 0, cost_raw: '무료',
      application_status: 'unknown', application_start: null, application_end: null,
      application_methods: [],
      inquiry_methods: [{ type: 'visit', address: '오산시 세마동 (시연용 주소)', hours: '화~토 10:00~18:00', languages: ['ko'], verified_at: offsetDate(-2) }],
      verified_at: offsetDate(-2),
    },
    {
      ...base(),
      program_id: 'demo-career',
      title: '가족 진로 탐색',
      institution: '가상 교육지원센터',
      category: 'career',
      target_raw: '초등 3~6학년과 보호자',
      target_type: 'all',
      description: '자녀와 보호자가 함께 관심 분야를 알아보는 시간입니다. 정확한 일시는 추후 공지합니다.',
      grade_range: [3, 6], age_range: null, eligibility_status: 'unknown',
      uncertain_items: [{ topic: 'companion', note_ko: '보호자 동반' }, { topic: 'schedule', note_ko: '일시 추후 공지' }],
      attendance_rule: 'unknown',
      sessions: [session('career-1', null, null, null, '가상 교육지원센터', '중앙동')],
      cost_krw: 0, cost_raw: '무료',
      application_status: 'unknown', application_start: null, application_end: null,
      application_methods: [],
      guardian_companion: 'required',
    },
    {
      ...base(),
      program_id: 'demo-closed',
      title: '가족 요리 체험',
      institution: '가상 가족센터',
      category: 'experience_culture',
      target_raw: '초등학생 가족',
      target_type: 'all',
      description: '가족이 함께 요리하는 체험입니다. 신청이 마감되었습니다.',
      grade_range: null, age_range: null, eligibility_status: 'unknown',
      uncertain_items: [{ topic: 'age_grade', note_ko: '초등학생' }],
      attendance_rule: 'choose_one',
      sessions: [session('closed-1', nextWeekday(SAT), '10:00', '12:00', '가상 가족센터', '중앙동')],
      cost_krw: 0, cost_raw: '무료',
      application_status: 'closed', application_start: offsetDate(-20), application_end: offsetDate(-1),
      application_methods: [],
    },
  ]
}

function weekdayOf(date: string): Weekday {
  const [year, month, day] = date.split('-').map(Number)
  return dayCodes[new Date(year, month - 1, day).getDay()]
}

/** 가능 시간 구간 하나가 회차 전체를 포함하는지(명세 4장) */
export function windowContains(window: AvailableWindow, item: ProgramSession): boolean {
  if (!item.date || !item.start_time || !item.end_time) return false
  const sameDay = 'date' in window ? window.date === item.date : window.day_of_week === weekdayOf(item.date)
  return sameDay && window.start_time <= item.start_time && item.end_time <= window.end_time
}

function timeResult(program: Program, windows: AvailableWindow[]): { status: MatchStatus; matched: string[] } {
  if (!windows.length) return { status: 'not_applied', matched: [] }
  if (program.attendance_rule === 'unknown') return { status: 'unknown', matched: [] }
  const now = offsetDate(0)
  const future = program.sessions.filter((item) => !item.date || item.date >= now)
  const hasPast = program.sessions.some((item) => item.date && item.date < now)
  const hasUnknown = future.some((item) => !item.date || !item.start_time || !item.end_time)
  const matched = future.filter((item) => windows.some((window) => windowContains(window, item))).map((item) => item.id)

  if (program.attendance_rule === 'choose_one') {
    if (matched.length) return { status: 'matched', matched }
    return { status: hasUnknown ? 'unknown' : 'not_matched', matched: [] }
  }
  const confirmed = future.filter((item) => item.date && item.start_time && item.end_time)
  if (confirmed.some((item) => !matched.includes(item.id))) return { status: 'not_matched', matched: [] }
  if (hasUnknown || (hasPast && !program.mid_join_allowed)) return { status: 'unknown', matched }
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
  const now = offsetDate(0)
  const upcoming = program.sessions
    .filter((item) => item.date && item.date >= now)
    .sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
  const matchedSession = upcoming.find((item) => time.matched.includes(item.id))
  const reasons: string[] = []
  if (ageGrade === 'matched') reasons.push('age_grade')
  if (time.status === 'matched') reasons.push('time')
  return {
    ...program,
    age_grade_match_status: ageGrade,
    time_match_status: time.status,
    matched_sessions: time.matched,
    matched_reasons: reasons,
    next_session: matchedSession ?? upcoming[0] ?? program.sessions[0] ?? null,
  }
}

const applicationOrder = { open: 0, upcoming: 1, unknown: 2, closed: 3 }
const isUncertain = (program: Program) => program.age_grade_match_status === 'unknown' || program.eligibility_status === 'unknown'

function compare(a: Program, b: Program, filters: SearchFilters): number {
  return applicationOrder[a.application_status] - applicationOrder[b.application_status]
    || (a.next_session?.date ?? '9999-12-31').localeCompare(b.next_session?.date ?? '9999-12-31')
    || Number(isUncertain(a)) - Number(isUncertain(b))
    || Number(filters.interests.includes(b.category)) - Number(filters.interests.includes(a.category))
    || Number(!!filters.dong && b.next_session?.dong === filters.dong) - Number(!!filters.dong && a.next_session?.dong === filters.dong)
}

export function searchMockPrograms(filters: SearchFilters): SearchResponse {
  const candidates = buildPrograms()
    .filter((program) => program.application_status !== 'closed')
    .filter((program) => !filters.free_only || program.cost_krw === 0)
    .map((program) => evaluate(program, filters))
    .filter((program) => program.age_grade_match_status !== 'not_matched' && program.time_match_status !== 'not_matched' && program.eligibility_status !== 'not_matched')
  const sort = (list: Program[]) => list.sort((a, b) => compare(a, b, filters))
  return {
    results: sort(candidates.filter((program) => program.time_match_status !== 'unknown')),
    needs_confirmation: sort(candidates.filter((program) => program.time_match_status === 'unknown')),
  }
}

export function getMockProgram(id: string, filters: SearchFilters): Program | null {
  const program = buildPrograms().find((item) => item.program_id === id)
  return program ? evaluate(program, filters) : null
}
