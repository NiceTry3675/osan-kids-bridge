import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateJson } from '../src/llm/gemini'
import { checkSummary, numberTokens } from '../src/summarize/check'
import { summaryFacts } from '../src/summarize/facts'
import { ageLabel, costLabel, dateLabel, gradeLabel, localizeFacts } from '../src/summarize/format'
import { buildVerifyPrompt, SUMMARY_SCHEMA, summarySystemPrompt } from '../src/summarize/prompt'
import { capitalizeSentences, summarizeRecord } from '../src/summarize/summarize'
import type { DisplayLanguage, ProgramRecord, ProgramSession } from '../src/types'

// 모델 호출은 가짜로 바꾼다. 결정적 검사는 네트워크 없이 돈다.
vi.mock('../src/llm/gemini', () => ({ generateJson: vi.fn(), generateText: vi.fn() }))
const mockedJson = vi.mocked(generateJson)

// 2026-10-15(목) 12:00, Asia/Seoul
const NOW = new Date('2026-10-15T03:00:00Z')

function session(id: string, date: string | null, start: string | null = '10:00', end: string | null = '12:00'): ProgramSession {
  return { id, date, start_time: start, end_time: end, place_name: '오산시가족센터 2층 교육실', dong: '중앙동', online: false, address: null }
}

/** 다문화가족 초등 1~4학년, 토요일 4회, 무료 */
function record(overrides: Partial<ProgramRecord> = {}): ProgramRecord {
  return {
    program_id: 'p-science',
    title: '다문화가족 자녀 토요 과학교실',
    institution: '오산시가족센터',
    category: 'experience_culture',
    audience: 'child',
    target_type: 'multicultural_family',
    target_raw: '다문화가족 초등 1~4학년 자녀',
    description: '원문 소개 (요약에 쓰지 않음)',
    grade_range: [1, 4],
    age_range: null,
    eligibility_requirements: ['다문화가족'],
    guardian_companion: 'unknown',
    sibling_companion: 'unknown',
    korean_level_required: null,
    support_languages: null,
    application_languages: null,
    sessions: [session('s4', '2026-11-14'), session('s1', '2026-10-24'), session('s2', '2026-10-31'), session('s3', '2026-11-07')],
    period_start: null,
    period_end: null,
    session_count: 4,
    attendance_rule: 'all_sessions',
    mid_join_allowed: null,
    cost_krw: 0,
    cost_raw: '무료',
    capacity: 15,
    application_start: '2026-10-12T09:00',
    application_end: '2026-10-22T18:00',
    application_methods: [
      { type: 'online', label: '온라인 신청', url: 'https://example.org/apply' },
      { type: 'phone', label: '전화 신청·문의', phone: '031-378-9000' },
    ],
    uncertain_items: ['형제자매 동반 가능 여부'],
    evidence: [{ field: 'title', quote: '다문화가족 자녀 토요 과학교실', verified: true }],
    summaries_by_language: {},
    source: { url: 'https://example.org/notice', retrieved_at: '2026-10-14', files: [], content_hash: 'hash' },
    extracted_at: '2026-10-14T00:00:00Z',
    model: 'test',
    warnings: [],
    review: { status: 'pending', reviewed_at: null, reviewer: null, notes: null, facts_hash: null },
    ...overrides,
  }
}

/** 기간·횟수만 있고 비용 미상 */
const periodOnly = () => record({
  title: '함께 배우는 한국어 교실',
  institution: '오산시청소년수련관',
  target_type: 'all',
  target_raw: '초등 3학년~중학교 2학년 누구나',
  grade_range: [3, 8],
  eligibility_requirements: [],
  sessions: [],
  period_start: '2026-11-02',
  period_end: '2026-12-21',
  session_count: 8,
  cost_krw: null,
  cost_raw: null,
  application_start: '2026-10-19',
  application_end: '2026-10-30T18:00',
  application_methods: [{ type: 'phone', label: '전화 문의', phone: '031-372-1000' }],
  uncertain_items: ['회차별 요일과 시간', '장소'],
})

const GOOD: Record<DisplayLanguage, string[]> = {
  'ko-easy': [
    "'다문화가족 자녀 토요 과학교실'은 오산시가족센터에서 해요. 다문화가족 초등 1~4학년 자녀가 대상이에요.",
    '10월 24일(토), 10월 31일(토), 11월 7일(토), 11월 14일(토) 10:00~12:00에 해요. 장소는 오산시가족센터 2층 교육실이에요.',
    '무료예요. 10월 12일(월) 09:00부터 10월 22일(목) 18:00까지 온라인이나 전화 031-378-9000으로 신청해요. 형제자매도 같이 가도 되는지 물어보세요.',
  ],
  vi: [
    'Chương trình “다문화가족 자녀 토요 과학교실” (Lớp khoa học thứ Bảy cho con em gia đình đa văn hóa) của 오산시가족센터, dành cho con em gia đình đa văn hóa là học sinh tiểu học lớp 1–4.',
    'Học vào 24/10 (Thứ Bảy), 31/10 (Thứ Bảy), 7/11 (Thứ Bảy) và 14/11 (Thứ Bảy), 10:00–12:00, tại 오산시가족센터 2층 교육실.',
    'Miễn phí. Đăng ký từ 12/10 (Thứ Hai) 09:00 đến 22/10 (Thứ Năm) 18:00, trực tuyến hoặc qua điện thoại 031-378-9000. Hãy hỏi đơn vị tổ chức xem anh chị em có được đi cùng không.',
  ],
  zh: [
    '“다문화가족 자녀 토요 과학교실”（多元文化家庭子女周六科学班）由오산시가족센터举办，对象为多元文化家庭小学1至4年级子女。',
    '10月24日（周六）、10月31日（周六）、11月7日（周六）、11月14日（周六）10:00–12:00，地点：오산시가족센터 2층 교육실。',
    '免费。报名时间：10月12日（周一）09:00至10月22日（周四）18:00，可网上报名或拨打电话031-378-9000。兄弟姐妹能否同行，请向机构确认。',
  ],
}

const factsOf = (overrides: Partial<ProgramRecord> = {}) => summaryFacts(record(overrides), NOW)
const check = (lines: string[], language: DisplayLanguage, facts = factsOf()) => checkSummary(lines, facts, language)
const replaced = (language: DisplayLanguage, index: number, from: string, to: string) =>
  GOOD[language].map((line, at) => (at === index ? line.replace(from, to) : line))
const hasIssue = (issues: string[], text: string) => expect(issues.some((issue) => issue.includes(text)), `${text} 없음: ${JSON.stringify(issues)}`).toBe(true)

describe('summaryFacts', () => {
  it('요약에 쓸 사실만 담고 원문 소개·근거·출처는 넣지 않는다', () => {
    const facts = factsOf()
    expect(facts).not.toHaveProperty('description')
    expect(facts).not.toHaveProperty('evidence')
    expect(facts).not.toHaveProperty('source')
    expect(JSON.stringify(facts)).not.toContain('example.org')
    expect(facts.application_methods).toEqual([
      { type: 'online', purpose: 'apply', phone: null, address: null, label: '온라인 신청' },
      { type: 'phone', purpose: 'apply', phone: '031-378-9000', label: null, address: null },
    ])
    expect(facts.venue).toBeNull()
  })

  it('회차를 시간순으로 정렬하고 요일·다음 회차를 계산한다', () => {
    const facts = factsOf()
    expect(facts.today).toBe('2026-10-15')
    expect(facts.sessions.map((item) => item.date)).toEqual(['2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14'])
    expect(facts.sessions.every((item) => item.weekday === 'sat')).toBe(true)
    expect(facts.next_session?.date).toBe('2026-10-24')
    expect(facts.application_start).toEqual({ date: '2026-10-12', weekday: 'mon', time: '09:00' })
    expect(facts.application_end).toEqual({ date: '2026-10-22', weekday: 'thu', time: '18:00' })
  })

  it('지난 회차가 있으면 다음 회차는 앞으로 시작할 회차이고 중도 참여를 확인할 점에 넣는다', () => {
    const facts = factsOf({ sessions: [session('a', '2026-10-10'), session('b', '2026-10-24'), session('c', null)] })
    expect(facts.next_session?.date).toBe('2026-10-24')
    expect(facts.undated_sessions).toBe(1)
    expect(facts.check_items).toContain('중도 참여 가능 여부')
    expect(factsOf().check_items).toEqual(['형제자매 동반 가능 여부'])
  })

  it('새벽 마감은 보호자 웹과 같이 전날까지로 둔다', () => {
    expect(factsOf({ application_end: '2026-10-17T00:00' }).application_end).toEqual({ date: '2026-10-16', weekday: 'fri', time: null })
    expect(factsOf({ application_end: '2026-10-30T01:00' }).application_end).toEqual({ date: '2026-10-29', weekday: 'thu', time: null })
    expect(factsOf({ application_end: '2026-10-22T18:00' }).application_end).toEqual({ date: '2026-10-22', weekday: 'thu', time: '18:00' })
  })

  it('동반 규칙·중도 참여·오산시 밖 장소·온라인 신청처를 모델에게 넘긴다', () => {
    const facts = factsOf({
      guardian_companion: 'not_allowed', sibling_companion: 'allowed', attendance_rule: 'all_sessions', mid_join_allowed: true,
      sessions: [{ ...session('a', '2026-10-24'), address: '경기도 화성시 동탄대로 446', dong: null }],
      application_methods: [{ type: 'online', label: '오산시가족센터 홈페이지 프로그램 신청' }],
    })
    expect(facts.outside_osan).toBe('경기도 화성시 동탄대로 446')
    const view = localizeFacts(facts, 'vi')
    expect(view.target).toMatchObject({ guardian_companion: 'not_allowed', sibling_companion: 'allowed' })
    expect(view.schedule).toMatchObject({ mid_join_allowed: true, outside_osan: '경기도 화성시 동탄대로 446' })
    expect(view.application.methods).toEqual(['đăng ký trực tuyến (오산시가족센터 홈페이지 프로그램 신청)'])
    expect(factsOf().outside_osan).toBeNull()
  })

  it('날짜만 있는 신청 마감, 기간만 있는 공고, 미상 비용을 그대로 둔다', () => {
    const facts = summaryFacts(periodOnly(), NOW)
    expect(facts.sessions).toEqual([])
    expect(facts.next_session).toBeNull()
    expect(facts.period_start).toEqual({ date: '2026-11-02', weekday: 'mon' })
    expect(facts.application_start).toEqual({ date: '2026-10-19', weekday: 'mon', time: null })
    expect(facts.cost_krw).toBeNull()
  })
})

describe('언어별 표기', () => {
  const sat = { date: '2026-10-24', weekday: 'sat' as const }

  it('날짜는 언어별 순서·요일로, 올해가 아니면 연도를 붙인다', () => {
    expect(dateLabel(sat, 'ko-easy', '2026-10-15')).toBe('10월 24일(토)')
    expect(dateLabel(sat, 'vi', '2026-10-15')).toBe('24/10 (Thứ Bảy)')
    expect(dateLabel(sat, 'zh', '2026-10-15')).toBe('10月24日（周六）')
    const nextYear = { date: '2027-01-09', weekday: 'sat' as const }
    expect(dateLabel(nextYear, 'ko-easy', '2026-10-15')).toBe('2027년 1월 9일(토)')
    expect(dateLabel(nextYear, 'vi', '2026-10-15')).toBe('9/1/2027 (Thứ Bảy)')
    expect(dateLabel(nextYear, 'zh', '2026-10-15')).toBe('2027年1月9日（周六）')
  })

  it('학년은 한국 학제 그대로 옮긴다 (중1을 베트남 lớp 7로 바꾸지 않는다)', () => {
    expect(gradeLabel([1, 4], 'ko-easy')).toBe('초등 1~4학년')
    expect(gradeLabel([1, 4], 'vi')).toBe('học sinh tiểu học lớp 1–4')
    expect(gradeLabel([7, 9], 'vi')).toBe('học sinh trung học cơ sở năm 1–3')
    expect(gradeLabel([5, 8], 'vi')).toBe('học sinh từ tiểu học lớp 5 đến trung học cơ sở năm 2')
    expect(gradeLabel([1, 4], 'zh')).toBe('小学1至4年级')
    expect(gradeLabel([5, 8], 'zh')).toBe('小学5年级至初中2年级')
    expect(gradeLabel([10, 10], 'zh')).toBe('高中1年级')
  })

  it('비용: 무료·금액·미상(null)', () => {
    expect(costLabel(0, 'ko-easy')).toBe('무료')
    expect(costLabel(0, 'vi')).toBe('miễn phí')
    expect(costLabel(0, 'zh')).toBe('免费')
    expect(costLabel(30000, 'ko-easy')).toBe('30,000원')
    expect(costLabel(30000, 'vi')).toBe('30.000 won')
    expect(costLabel(30000, 'zh')).toBe('30,000韩元')
    expect(costLabel(null, 'vi')).toBeNull()
  })

  it('비용: 원문의 가족당·재료비 같은 기준을 붙인다', () => {
    expect(costLabel(8000, 'ko-easy', '가족당 재료비 8,000원')).toBe('가족당 재료비 8,000원')
    expect(costLabel(8000, 'vi', '가족당 재료비 8,000원')).toBe('8.000 won mỗi gia đình (tiền nguyên liệu)')
    expect(costLabel(8000, 'zh', '가족당 재료비 8,000원')).toBe('每个家庭材料费8,000韩元')
    expect(costLabel(10000, 'vi', '1인당 10,000원')).toBe('10.000 won mỗi người')
    expect(costLabel(10000, 'ko-easy', '10,000원 (악보·간식 포함)')).toBe('10,000원')
    expect(costLabel(0, 'zh', '가족당 무료')).toBe('免费')
  })

  it('열린 나이 범위', () => {
    expect(ageLabel([8, 99], 'ko-easy')).toBe('8세 이상')
    expect(ageLabel([0, 7], 'vi')).toBe('từ 7 tuổi trở xuống')
    expect(ageLabel([8, 12], 'zh')).toBe('8至12岁')
  })

  it('모델에게 주는 사실에는 ISO 날짜가 없고 미상은 null이다', () => {
    const view = localizeFacts(summaryFacts(periodOnly(), NOW), 'vi')
    expect(JSON.stringify(view)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(view.cost.label).toBeNull()
    expect(view.schedule.period_start).toBe('2/11 (Thứ Hai)')
    expect(view.application.end).toBe('30/10 (Thứ Sáu) 18:00')
    expect(view.support_languages).toBeNull()
    const supported = localizeFacts(factsOf({ support_languages: ['vi', 'zh'] }), 'zh')
    expect(supported.support_languages).toEqual(['越南语', '中文'])
    const science = localizeFacts(factsOf(), 'ko-easy')
    expect(science.schedule.same_time).toBe('10:00~12:00')
    expect(science.schedule.weekdays).toEqual(['토'])
  })

  it("원문의 '만 N세'를 살린다", () => {
    expect(ageLabel([4, 7], 'ko-easy', true)).toBe('만 4~7세')
    expect(ageLabel([4, 7], 'vi', true)).toBe('4–7 tuổi (tuổi tròn)')
    expect(ageLabel([4, 7], 'zh', true)).toBe('4至7周岁')
    expect(ageLabel([8, 99], 'zh', true)).toBe('8周岁以上')
    expect(factsOf({ grade_range: null, age_range: [4, 7], target_raw: '만 4~7세 자녀와 부모' }).age_completed).toBe(true)
    expect(factsOf({ grade_range: null, age_range: [4, 7], target_raw: '4~7세 자녀' }).age_completed).toBe(false)
  })

  it('요일은 앞으로 남은 회차에서 월요일부터 순서대로 뽑는다 (지난 첫날만의 요일은 넣지 않는다)', () => {
    const taekwon = factsOf({ sessions: [session('s1', '2026-04-30'), session('s2', '2026-10-21'), session('s3', '2026-10-28')], session_count: 3 })
    expect(localizeFacts(taekwon, 'ko-easy').schedule.weekdays).toEqual(['수'])
    const twoDays = factsOf({ sessions: [session('s1', '2026-10-22'), session('s2', '2026-10-27')], session_count: 2 })
    expect(localizeFacts(twoDays, 'zh').schedule.weekdays).toEqual(['周二', '周四'])
  })

  it('대략의 일정·통역·안내 문장을 사실로 넘긴다', () => {
    const career = localizeFacts(factsOf({ sessions: [], session_count: null, schedule_note: '11월 중 운영 예정' }), 'vi')
    expect(career.schedule.note).toBe('11월 중 운영 예정')
    expect(localizeFacts(factsOf({ schedule_note: '11월 중 운영 예정' }), 'vi').schedule.note).toBeNull()
    const interpreted = factsOf({
      support_languages: ['vi', 'zh'], notices: ['보호자는 수업 중 2층 가족 쉼터에서 기다릴 수 있습니다.'],
      evidence: [{ field: 'support_languages', quote: '■ 통역: 베트남어·중국어 통역 지원', verified: true }],
    })
    expect(interpreted.support_interpretation).toBe(true)
    expect(localizeFacts(interpreted, 'zh').notices).toEqual(['보호자는 수업 중 2층 가족 쉼터에서 기다릴 수 있습니다.'])
    expect(factsOf({ support_languages: ['vi'] }).support_interpretation).toBe(false)
  })

  it('베트남어 문장은 대문자로 시작한다 (금액의 점은 건드리지 않는다)', () => {
    expect(capitalizeSentences('miễn phí. đăng ký 10.000 won.')).toBe('Miễn phí. Đăng ký 10.000 won.')
  })
})

describe('numberTokens', () => {
  it('천 단위 구분과 만·万 표기를 한 수로 읽는다', () => {
    expect(numberTokens('30,000원')).toEqual([30000])
    expect(numberTokens('30.000 won')).toEqual([30000])
    expect(numberTokens('3만 원')).toEqual([30000])
    expect(numberTokens('1万5千韩元')).toEqual([15000])
    expect(numberTokens('초등 1~4학년')).toEqual([1, 4])
  })
})

describe('checkSummary: 결정적 검사', () => {
  it('사실과 맞는 3줄은 세 언어 모두 통과한다', () => {
    for (const language of ['ko-easy', 'vi', 'zh'] as const) expect(check(GOOD[language], language), language).toEqual([])
  })

  it('정확히 3줄, 빈 줄 없이, 적당한 길이', () => {
    hasIssue(check(GOOD.vi.slice(0, 2), 'vi'), '줄 수가 3이 아님')
    hasIssue(check([GOOD.vi[0], '  ', GOOD.vi[2]], 'vi'), '2줄이 비어 있음')
    hasIssue(check([GOOD.vi[0], GOOD.vi[1], `${GOOD.vi[2]} ${'Hãy hỏi thêm. '.repeat(20)}`], 'vi'), '3줄이 너무 김')
  })

  it('사실에 없는 날짜·요일·시각·숫자·전화번호를 찾는다', () => {
    hasIssue(check(replaced('vi', 1, '31/10', '30/10'), 'vi'), '사실에 없는 날짜 10월 30일')
    hasIssue(check(replaced('vi', 1, '24/10 (Thứ Bảy)', '24/10 (Chủ Nhật)'), 'vi'), '10월 24일의 요일이 틀림')
    hasIssue(check(replaced('zh', 1, '10:00–12:00', '10:30–12:00'), 'zh'), '사실에 없는 시각 10:30')
    hasIssue(check(replaced('ko-easy', 1, '해요.', '해요. 20명까지 받아요.'), 'ko-easy'), '사실에 없는 숫자 20')
    hasIssue(check(replaced('ko-easy', 2, '031-378-9000', '031-378-9001'), 'ko-easy'), '사실에 없는 전화번호')
    hasIssue(check(replaced('zh', 1, '11月14日（周六）', '11月14日（周日）'), 'zh'), '11월 14일의 요일이 틀림')
  })

  it('정원·학년·횟수처럼 사실에서 나온 숫자와 베트남어 요일 숫자는 허용한다', () => {
    expect(check(replaced('ko-easy', 1, '해요.', '모두 4번 해요. 15명을 받아요.'), 'ko-easy')).toEqual([])
    expect(check(replaced('vi', 1, '24/10 (Thứ Bảy)', '24/10 (Thứ 7)'), 'vi')).toEqual([])
    hasIssue(check(replaced('vi', 1, 'Học vào', 'Thứ 6:'), 'vi'), '사실에 없는 요일 fri')
  })

  it('알려진 핵심 사실(다음 회차·시각·신청 마감·전화·제목·대상)이 빠지면 알린다', () => {
    hasIssue(check(replaced('ko-easy', 1, '10월 24일(토), ', ''), 'ko-easy'), '다음 회차 날짜(10월 24일)가 없음')
    hasIssue(check(replaced('vi', 1, '10:00–12:00, ', ''), 'vi'), '다음 회차 시작 시각(10:00)이 없음')
    hasIssue(check(replaced('zh', 2, '至10月22日（周四）18:00', ''), 'zh'), '신청 마감 날짜(10월 22일)가 없음')
    hasIssue(check(replaced('vi', 2, ' hoặc qua điện thoại 031-378-9000', ''), 'vi'), '전화번호(031-378-9000)가 없음')
    hasIssue(check(replaced('zh', 0, '“다문화가족 자녀 토요 과학교실”', '多元文化家庭科学班'), 'zh'), '1줄에 제목 원문이 없음')
    hasIssue(check(replaced('vi', 0, '“다문화가족 자녀 토요 과학교실”', '다문화가족 자녀 토요 과학교실'), 'vi'), '따옴표로 감싸지 않음')
    hasIssue(check(replaced('vi', 0, 'lớp 1–4', 'lớp 1–3'), 'vi'), '1줄에 대상 학년이 없음')
    hasIssue(check(replaced('zh', 0, '小学1至4年级', '初中1至4年级'), 'zh'), '1줄에 대상 학교급이 없음')
    hasIssue(check(replaced('zh', 0, '小学1至4年级', '初中1至4年级'), 'zh'), '없는 학교급을 씀')
    hasIssue(check(replaced('ko-easy', 0, '다문화가족 초등', '초등'), 'ko-easy'), '다문화가족 대상이라는 말이 없음')
  })

  it('제목이 다른 학교급을 다루면 제목 번역에 그 학교급이 나와도 된다', () => {
    const title = '다문화가족 자녀 중학교 준비 과학교실'
    const lines = replaced('vi', 0, '다문화가족 자녀 토요 과학교실” (Lớp khoa học thứ Bảy', `${title}” (Lớp khoa học chuẩn bị lên trung học cơ sở`)
    expect(check(lines, 'vi', factsOf({ title }))).toEqual([])
    hasIssue(check(lines, 'vi'), '1줄에 제목 원문이 없음')
    hasIssue(check(replaced('vi', 0, 'học sinh tiểu học', 'học sinh trung học cơ sở'), 'vi', factsOf({ title: '다문화가족 자녀 고등학교 준비 과학교실' })), '없는 학교급을 씀')
  })

  it('무료는 그 언어의 무료로, 금액은 금액으로, 미상은 미상으로 쓴다', () => {
    hasIssue(check(replaced('vi', 2, 'Miễn phí. ', ''), 'vi'), '무료라는 말')
    const paid = factsOf({ cost_krw: 30000, cost_raw: '재료비 30,000원' })
    expect(check(replaced('vi', 2, 'Miễn phí.', 'Chi phí 30.000 won.'), 'vi', paid)).toEqual([])
    expect(check(replaced('ko-easy', 2, '무료예요.', '비용은 3만 원이에요.'), 'ko-easy', paid)).toEqual([])
    expect(check(replaced('zh', 2, '免费。', '费用3万韩元。'), 'zh', paid)).toEqual([])
    hasIssue(check(replaced('vi', 2, 'Miễn phí.', 'Chi phí 20.000 won.'), 'vi', paid), '비용 30000원이 없음')
    hasIssue(check(GOOD.vi, 'vi', paid), '비용이 있는데 무료라고 씀')
    const unknown = factsOf({ cost_krw: null, cost_raw: null })
    hasIssue(check(GOOD.zh, 'zh', unknown), '비용이 확인되지 않았는데 무료라고 씀')
    hasIssue(check(replaced('zh', 2, '免费。', '').map((line) => line.replace('兄弟姐妹能否同行，请向机构确认。', '')), 'zh', unknown), '3줄에 비용 확인 필요라는 말이 없음')
    expect(check(replaced('zh', 2, '免费。', '公告未注明费用，请向机构确认。'), 'zh', unknown)).toEqual([])
  })

  it('기간만 있는 공고: 기간 날짜와 요일·시간 미상, 비용 미상, 신청 시작을 확인한다', () => {
    const facts = summaryFacts(periodOnly(), NOW)
    const lines = [
      'Chương trình “함께 배우는 한국어 교실” (Lớp học tiếng Hàn cùng nhau) của 오산시청소년수련관, dành cho học sinh từ tiểu học lớp 3 đến trung học cơ sở năm 2.',
      'Có 8 buổi, từ 2/11 (Thứ Hai) đến 21/12 (Thứ Hai). Hãy hỏi đơn vị tổ chức về thứ, giờ học và địa điểm.',
      'Hãy hỏi đơn vị tổ chức về chi phí. Thời gian đăng ký từ 19/10 (Thứ Hai) đến 30/10 (Thứ Sáu) 18:00. Hỏi thông tin qua điện thoại 031-372-1000.',
    ]
    expect(check(lines, 'vi', facts)).toEqual([])
    hasIssue(check([lines[0], 'Có 8 buổi, từ 2/11 (Thứ Hai) đến 21/12 (Thứ Hai).', lines[2]], 'vi', facts), '요일·시간 확인 필요라는 말이 없음')
    hasIssue(check([lines[0], lines[1].replace(' đến 21/12 (Thứ Hai)', ''), lines[2]], 'vi', facts), '운영 기간 날짜(12월 21일)가 없음')
    hasIssue(check([lines[0], lines[1], lines[2].replace('từ 19/10 (Thứ Hai) ', '')], 'vi', facts), '신청 시작 날짜(10월 19일)가 없음')
    hasIssue(check([lines[0], lines[1], lines[2].replace('Hãy hỏi đơn vị tổ chức về chi phí. ', '')], 'vi', facts), '비용 확인 필요')
  })

  it('확인되지 않은 언어 지원, 신청 상태·참여 가능 단정, 누구나를 막는다', () => {
    hasIssue(check(replaced('vi', 2, 'Miễn phí.', 'Miễn phí, có phiên dịch tiếng Việt.'), 'vi'), '통역·언어 지원을 언급함')
    hasIssue(check(replaced('zh', 2, '免费。', '免费，提供越南语服务。'), 'zh'), '확인되지 않은 언어 지원(vi)')
    const supported = factsOf({ support_languages: ['vi'] })
    expect(check(replaced('vi', 2, 'Miễn phí.', 'Miễn phí, có phiên dịch tiếng Việt.'), 'vi', supported)).toEqual([])
    hasIssue(check(replaced('vi', 2, 'Miễn phí.', 'Miễn phí, đang nhận đăng ký.'), 'vi'), '신청 상태나 참여 가능 여부를 단정함')
    hasIssue(check(replaced('ko-easy', 0, '대상이에요', '참여할 수 있어요'), 'ko-easy'), '참여 가능 여부를 단정함')
    hasIssue(check(replaced('zh', 0, '对象为', '任何人都可报名，'), 'zh'), '누구나')
  })

  it('베트남어·중국어에 사실 밖 한국어, 번체자, 한자 숫자를 쓰면 알린다', () => {
    hasIssue(check(replaced('vi', 2, 'Miễn phí.', 'Miễn phí (무료).'), 'vi'), '사실에 없는 한국어 문구: 무료')
    hasIssue(check(replaced('zh', 2, '报名时间', '報名時間'), 'zh'), '번체자를 씀')
    hasIssue(check(replaced('zh', 0, '小学1至4年级', '小学1至4年级（一至四年级）'), 'zh'), '숫자를 글자로 씀')
    hasIssue(check(replaced('ko-easy', 1, '해요.', '네 번 해요.'), 'ko-easy'), '숫자를 글자로 씀')
  })
})

describe('지원 언어·대략의 일정 누락', () => {
  it('기관 지원 언어가 있는데 쓰지 않으면 문제로 본다', () => {
    hasIssue(check(GOOD['ko-easy'], 'ko-easy', factsOf({ support_languages: ['vi'] })), '기관 지원 언어(vi)')
    expect(check(replaced('ko-easy', 2, '무료예요.', '무료예요. 베트남어 통역이 있어요.'), 'ko-easy', factsOf({ support_languages: ['vi'] }))
      .some((issue) => issue.includes('기관 지원 언어'))).toBe(false)
  })

  it('회차·기간이 없으면 원문의 대략의 일정(월)을 2줄에 써야 한다', () => {
    const facts = factsOf({ sessions: [], session_count: null, schedule_note: '11월 중 운영 예정 (날짜·시간 추후 안내)' })
    const lines = [GOOD['ko-easy'][0], '날짜와 시간은 기관에 물어보세요.', GOOD['ko-easy'][2]]
    hasIssue(check(lines, 'ko-easy', facts), '대략의 일정')
    const withNote = [GOOD['ko-easy'][0], '11월 중에 열 예정이에요. 날짜와 시간은 기관에 물어보세요.', GOOD['ko-easy'][2]]
    expect(check(withNote, 'ko-easy', facts).some((issue) => issue.includes('대략의 일정') || issue.includes('숫자 11'))).toBe(false)
  })
})

describe('문의 전화와 신청 방법 (F1)', () => {
  // 원문: '신청 : 홈페이지에서 온라인 신청', '문의 : 031-000-0004 (신청은 전화로 받지 않습니다)'
  const inquiryOnly = () => factsOf({
    application_methods: [
      { type: 'online', label: '온라인 신청', url: 'https://example.org/apply' },
      { type: 'phone', label: '전화 문의', phone: '031-000-0004' },
    ],
  })
  const withPhone = (language: DisplayLanguage, phone: string) => GOOD[language].map((line) => line.replace('031-378-9000', phone))

  it('라벨로 신청 방법과 문의처를 나눠 모델에게 따로 준다', () => {
    const facts = inquiryOnly()
    expect(facts.application_methods.map((method) => method.purpose)).toEqual(['apply', 'inquiry'])
    expect(localizeFacts(facts, 'ko-easy').application).toMatchObject({ methods: ['온라인 신청'], inquiry: ['문의 전화 031-000-0004'] })
    expect(localizeFacts(facts, 'vi').application).toMatchObject({ methods: ['đăng ký trực tuyến'], inquiry: ['điện thoại hỏi thông tin 031-000-0004'] })
    expect(localizeFacts(facts, 'zh').application).toMatchObject({ methods: ['网上报名'], inquiry: ['咨询电话 031-000-0004'] })
    // 신청인지 밝히지 않은 전화번호는 문의처로 본다
    expect(factsOf({ application_methods: [{ type: 'phone', label: '전화', phone: '031-000-0004' }] }).application_methods[0].purpose).toBe('inquiry')
    expect(summarySystemPrompt('ko-easy')).toContain('application.inquiry는 문의만 받는 연락처다')
  })

  it('문의 전화로 신청한다고 쓴 요약은 세 언어 모두 걸린다', () => {
    const facts = inquiryOnly()
    hasIssue(check(withPhone('ko-easy', '031-000-0004'), 'ko-easy', facts), '문의 전화(0310000004)를 신청 방법처럼 씀')
    hasIssue(check(withPhone('vi', '031-000-0004'), 'vi', facts), '문의 전화(0310000004)를 신청 방법처럼 씀')
    hasIssue(check(withPhone('zh', '031-000-0004'), 'zh', facts), '문의 전화(0310000004)를 신청 방법처럼 씀')
    const live = ['Đăng ký qua đăng ký trực tuyến hoặc điện thoại 031-000-0004']
    hasIssue(check([GOOD.vi[0], GOOD.vi[1], `${GOOD.vi[2].split('. ')[0]}. ${live[0]}.`], 'vi', facts), '신청 방법처럼 씀')
  })

  it('신청 방법과 문의처를 나눠 쓰면 통과한다', () => {
    const facts = inquiryOnly()
    const ko = replaced('ko-easy', 2, '온라인이나 전화 031-378-9000으로 신청해요.', '온라인으로 신청해요. 궁금한 점은 문의 전화 031-000-0004로 물어보세요.')
    expect(check(ko, 'ko-easy', facts)).toEqual([])
    const vi = replaced('vi', 2, ', trực tuyến hoặc qua điện thoại 031-378-9000.', ', trực tuyến. Hỏi thông tin qua điện thoại 031-000-0004.')
    expect(check(vi, 'vi', facts)).toEqual([])
    const zh = replaced('zh', 2, '，可网上报名或拨打电话031-378-9000。', '，可网上报名。咨询电话031-000-0004。')
    expect(check(zh, 'zh', facts)).toEqual([])
    // 신청 전화이기도 하면 신청 문장에 써도 된다
    expect(check(GOOD['ko-easy'], 'ko-easy')).toEqual([])
  })
})

describe('기간만 있는 공고의 장소 (F3)', () => {
  const VENUE_QUOTE = '장소 : 경기도 오산시 청학로 80 (궐동) 오산시가족센터 2층'
  const withVenue = () => periodOnly().evidence.concat({ field: 'venue', quote: VENUE_QUOTE, verified: true })

  it('회차가 없으면 원문에서 찾은 공통 장소를 사실로 넘긴다', () => {
    const facts = summaryFacts({ ...periodOnly(), evidence: withVenue() }, NOW)
    expect(facts.venue).toBe('경기도 오산시 청학로 80 (궐동) 오산시가족센터 2층')
    expect(localizeFacts(facts, 'vi').schedule.venue).toBe('경기도 오산시 청학로 80 (궐동) 오산시가족센터 2층')
    // 원문에서 찾지 못한 인용은 쓰지 않는다
    const unverified = periodOnly().evidence.concat({ field: 'venue', quote: VENUE_QUOTE, verified: false })
    expect(summaryFacts({ ...periodOnly(), evidence: unverified }, NOW).venue).toBeNull()
    // 회차가 있으면 회차의 장소를 쓴다
    expect(summaryFacts({ ...record(), evidence: withVenue() }, NOW).venue).toBeNull()
  })

  it('장소를 원문 그대로 옮긴 요약은 사실 밖 한국어·숫자로 보지 않는다', () => {
    const facts = summaryFacts({ ...periodOnly(), evidence: withVenue() }, NOW)
    const lines = [
      'Chương trình “함께 배우는 한국어 교실” (Lớp học tiếng Hàn cùng nhau) của 오산시청소년수련관, dành cho học sinh từ tiểu học lớp 3 đến trung học cơ sở năm 2.',
      'Có 8 buổi, từ 2/11 (Thứ Hai) đến 21/12 (Thứ Hai), tại 경기도 오산시 청학로 80 (궐동) 오산시가족센터 2층. Hãy hỏi đơn vị tổ chức về thứ và giờ học.',
      'Hãy hỏi đơn vị tổ chức về chi phí. Thời gian đăng ký từ 19/10 (Thứ Hai) đến 30/10 (Thứ Sáu) 18:00. Hỏi thông tin qua điện thoại 031-372-1000.',
    ]
    expect(check(lines, 'vi', facts)).toEqual([])
  })

  it('지시문은 미상 값을 공고에 없다고 단정하게 하지 않고, 대조는 그런 문장을 잡게 한다', () => {
    for (const language of ['ko-easy', 'vi', 'zh'] as const) {
      const prompt = summarySystemPrompt(language)
      expect(prompt).not.toMatch(/'[^']*공고에 나와 있지 않아요[^']*'처럼 쓴다|'Thông báo không ghi[^']*'처럼 쓴다|'公告未注明[^']*'처럼 쓴다/)
      expect(prompt).toContain('schedule.venue')
    }
    expect(buildVerifyPrompt(GOOD.vi, factsOf(), 'vi')).toContain('<사실>')
  })
})

describe('베트남어 서수와 요일 (F8)', () => {
  it("'lần thứ 3'(제3회)은 화요일이 아니다", () => {
    const facts = factsOf({ title: '제 3회 다문화가족 자녀 토요 과학교실' })
    const lines = replaced('vi', 0, '“다문화가족 자녀 토요 과학교실” (Lớp khoa học thứ Bảy cho con em gia đình đa văn hóa)', '“제 3회 다문화가족 자녀 토요 과학교실” (Lớp khoa học thứ Bảy lần thứ 3 cho con em gia đình đa văn hóa)')
    expect(check(lines, 'vi', facts)).toEqual([])
    hasIssue(check(replaced('vi', 1, 'Học vào', 'Thứ 3, 23/10:'), 'vi', facts), '사실에 없는 요일 tue')
    hasIssue(check(replaced('vi', 1, '24/10 (Thứ Bảy)', '24/10 (Thứ 3)'), 'vi', facts), '10월 24일의 요일이 틀림')
  })
})

describe('summarizeRecord (모델 호출은 가짜)', () => {
  const draft = (lines: string[]) => ({ line1: lines[0], line2: lines[1], line3: lines[2] })
  type Options = Parameters<typeof generateJson>[0]
  const isDraft = (options: Options) => options.schema === SUMMARY_SCHEMA
  const textOf = (options: Options) => options.parts.map((part) => part.text ?? '').join('\n')

  // 화살표 함수가 mock을 돌려주면 vitest가 정리 함수로 불러 버린다
  beforeEach(() => {
    mockedJson.mockReset()
  })

  it('검사와 모델 대조를 모두 통과하면 machine_checked (언어마다 생성 1회 + 대조 1회)', async () => {
    mockedJson.mockImplementation(async (options) => {
      if (!isDraft(options)) return { issues: [] }
      const language = (['vi', 'zh'] as const).find((code) => options.system.includes(code === 'vi' ? '언어: 베트남어' : '언어: 중국어')) ?? 'ko-easy'
      return draft(GOOD[language])
    })
    const summaries = await summarizeRecord(record(), { now: NOW })
    expect(Object.keys(summaries).sort()).toEqual(['ko-easy', 'vi', 'zh'])
    for (const summary of Object.values(summaries)) {
      expect(summary.status).toBe('machine_checked')
      expect(summary.issues).toEqual([])
      expect(summary.generated_at).toBe(NOW.toISOString())
    }
    expect(summaries.vi?.lines).toEqual(GOOD.vi)
    expect(mockedJson).toHaveBeenCalledTimes(6)
    // 원문 소개·근거는 모델에게 가지 않는다
    for (const [options] of mockedJson.mock.calls) {
      expect(textOf(options)).not.toContain('원문 소개')
      expect(textOf(options)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it('결정적 검사에 걸리면 문제를 알려 주고 한 번 다시 쓰게 한다', async () => {
    const drafts = [draft(replaced('vi', 2, 'Miễn phí. ', '')), draft(GOOD.vi)]
    mockedJson.mockImplementation(async (options) => (isDraft(options) ? drafts.shift() : { issues: [] }))
    const { vi: summary } = await summarizeRecord(record(), { languages: ['vi'], now: NOW })
    expect(summary?.status).toBe('machine_checked')
    expect(summary?.lines).toEqual(GOOD.vi)
    const retry = mockedJson.mock.calls.filter(([options]) => isDraft(options))[1][0]
    expect(textOf(retry)).toContain('<이전 초안의 문제>')
    expect(textOf(retry)).toContain('무료라는 말')
  })

  it('문제가 남으면 machine_draft와 문제 목록. approved는 쓰지 않는다', async () => {
    mockedJson.mockImplementation(async (options) => (isDraft(options)
      ? draft(GOOD.zh)
      : { issues: [{ line: 2, kind: 'addition', quote: '地点', detail: '없는 장소' }] }))
    const { zh: summary } = await summarizeRecord(record(), { languages: ['zh'], now: NOW })
    expect(summary?.status).toBe('machine_draft')
    expect(summary?.issues).toEqual(['모델 대조 2줄 사실에 없는 내용: "地点" 없는 장소'])
    expect(mockedJson).toHaveBeenCalledTimes(4)
  })

  it('모델 대조가 실패하면 통과로 보지 않는다', async () => {
    mockedJson.mockImplementation(async (options) => {
      if (isDraft(options)) return draft(GOOD['ko-easy'])
      throw new Error('503 UNAVAILABLE')
    })
    const { 'ko-easy': summary } = await summarizeRecord(record(), { languages: ['ko-easy'], now: NOW })
    expect(summary?.status).toBe('machine_draft')
    hasIssue(summary?.issues ?? [], '모델 대조 실패')
    expect(mockedJson).toHaveBeenCalledTimes(2)
  })
})
