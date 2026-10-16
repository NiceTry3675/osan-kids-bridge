import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateJson } from '../src/llm/gemini'
import { checkSummary, numberTokens } from '../src/summarize/check'
import { skippedDates, summaryFacts } from '../src/summarize/facts'
import { ageLabel, costLabel, dateLabel, gradeLabel, localizeFacts } from '../src/summarize/format'
import { checkHeading, HEADING_SCHEMA, wantsHeading, withHeading } from '../src/summarize/heading'
import { buildVerifyPrompt, SUMMARY_SCHEMA, summarySystemPrompt } from '../src/summarize/prompt'
import { capitalizeSentences, summarizeRecord } from '../src/summarize/summarize'
import type { DisplayLanguage, LanguageSummary, ProgramRecord, ProgramSession } from '../src/types'

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

/** 위 record()의 머리글 (checkHeading을 통과한다) */
const HEADING = {
  vi: { title: 'Lớp khoa học thứ Bảy cho con em gia đình đa văn hóa', institution: 'Trung tâm Gia đình thành phố Osan (오산시가족센터)', target: 'Con em gia đình đa văn hóa, học sinh lớp 1–4 tiểu học' },
  zh: { title: '多元文化家庭子女周六科学班', institution: '乌山市家庭中心（오산시가족센터）', target: '多元文化家庭小学1～4年级子女' },
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

  it('중도입국을 묻는 확인 항목은 중도 참여 확인을 대신하지 않는다', () => {
    const started = { sessions: [session('a', '2026-10-10'), session('b', '2026-10-24')] }
    expect(factsOf({ ...started, uncertain_items: ['중도입국 자녀 참여 가능 여부'] }).check_items).toContain('중도 참여 가능 여부')
    expect(factsOf({ ...started, uncertain_items: ['중도 포기 시 환불 가능 여부'] }).check_items).toContain('중도 참여 가능 여부')
    expect(factsOf({ ...started, uncertain_items: ['중간에 합류해도 되는지'] }).check_items).not.toContain('중도 참여 가능 여부')
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
    // 원문의 '추후 안내'를 옮긴 말도 받는다
    const later = [GOOD['ko-easy'][0], '11월 중에 열 예정이에요. 날짜와 시간은 나중에 알려 줘요.', GOOD['ko-easy'][2]]
    expect(check(later, 'ko-easy', facts).some((issue) => issue.includes('일정 확인 필요'))).toBe(false)
    expect(check([GOOD['ko-easy'][0], '날짜와 시간은 나중에 알려 줘요.', GOOD['ko-easy'][2]], 'ko-easy', factsOf({ sessions: [], session_count: null })).some((issue) => issue.includes('일정 확인 필요'))).toBe(true)
  })
})

describe('쉬는 날·남은 회차·신청 이름·신청 안내', () => {
  // 매주 월·금, 11월 9일·13일 휴강, 12회
  const kpopDates = ['2026-10-19', '2026-10-23', '2026-10-26', '2026-10-30', '2026-11-02', '2026-11-06', '2026-11-16', '2026-11-20', '2026-11-23', '2026-11-27', '2026-11-30', '2026-12-04']
  const kpop = () => factsOf({ sessions: kpopDates.map((date, index) => session(`k${index}`, date, '16:00', '17:30')), session_count: 12 })

  it('매주 같은 요일 사이에 빠진 날만 쉬는 날로 본다 (격주는 아니다)', () => {
    expect(kpop().skipped_dates.map((fact) => fact.date)).toEqual(['2026-11-09', '2026-11-13'])
    const biweekly = ['2026-06-24', '2026-07-08', '2026-07-22', '2026-08-05', '2026-08-19', '2026-09-02'].map((date, index) => session(`b${index}`, date))
    expect(factsOf({ sessions: biweekly, session_count: 6 }).skipped_dates).toEqual([])
    // 총 회차가 적힌 회차 수와 다르면 목록이 빠졌을 수 있어 내지 않는다
    expect(factsOf({ sessions: kpopDates.map((date, index) => session(`k${index}`, date)), session_count: 14 }).skipped_dates).toEqual([])
    expect(skippedDates([{ date: '2026-10-05', weekday: 'mon' }, { date: '2026-10-19', weekday: 'mon' }], 2, null, '2026-10-01')).toEqual([])
  })

  it('쉬는 날을 2줄에 쓰지 않으면 문제로 본다', () => {
    const lines = [
      "오산시가족센터가 '다문화가족 자녀 토요 과학교실'을 열어요. 다문화가족 초등 1~4학년 자녀가 대상이에요.",
      '10월 19일(월)부터 12월 4일(금)까지 월·금요일 16:00~17:30에 총 12번 해요. 장소는 오산시가족센터 2층 교육실이에요.',
      GOOD['ko-easy'][2],
    ]
    hasIssue(check(lines, 'ko-easy', kpop()), '쉬는 날(11월 9일)')
    const withBreak = lines.map((line, index) => (index === 1 ? `${line} 11월 9일(월), 11월 13일(금)은 쉬어요.` : line))
    expect(check(withBreak, 'ko-easy', kpop()).filter((issue) => issue.includes('쉬는 날') || issue.includes('날짜'))).toEqual([])
  })

  it('회차가 많아도 남은 회차가 4개 이하면 남은 날짜를 모두 써야 한다', () => {
    const dates = ['2026-09-16', '2026-09-30', '2026-10-14', '2026-10-28', '2026-11-11', '2026-11-25']
    const facts = factsOf({ sessions: dates.map((date, index) => session(`m${index}`, date)), session_count: 6 })
    const localized = localizeFacts(facts, 'ko-easy')
    expect(localized.schedule.remaining_sessions?.map((item) => item.when)).toEqual(['10월 28일(수) 10:00~12:00', '11월 11일(수) 10:00~12:00', '11월 25일(수) 10:00~12:00'])
    const lines = [GOOD['ko-easy'][0], '10월 28일(수)부터 11월 25일(수)까지 수요일 10:00~12:00에 총 6번 해요. 장소는 오산시가족센터 2층 교육실이에요.', GOOD['ko-easy'][2]]
    hasIssue(check(lines, 'ko-easy', facts), '남은 회차 날짜(11월 11일)')
    expect(localizeFacts(factsOf(), 'ko-easy').schedule.remaining_sessions).toBeNull()
  })

  it('온라인 신청은 어디서 신청하는지가 빠지면 문제로 본다', () => {
    const facts = factsOf({ application_methods: [{ type: 'online', label: '오산시가족센터 홈페이지 프로그램 신청' }] })
    const generic = replaced('ko-easy', 2, '온라인이나 전화 031-378-9000으로 신청해요.', '온라인으로 신청해요.')
    hasIssue(check(generic, 'ko-easy', facts), '온라인 신청 이름')
    const named = replaced('ko-easy', 2, '온라인이나 전화 031-378-9000으로 신청해요.', '오산시가족센터 홈페이지에서 신청해요.')
    expect(check(named, 'ko-easy', facts).some((issue) => issue.includes('온라인 신청 이름'))).toBe(false)
  })

  it('문의처가 없으면 null로 주고, 원문의 신청 안내가 있으면 신청 기간 확인 필요라는 말을 묻지 않는다', () => {
    expect(localizeFacts(factsOf({ application_methods: [{ type: 'online', label: '온라인 신청' }] }), 'zh').application.inquiry).toBeNull()
    const facts = factsOf({ application_start: null, application_end: null, application_note: '일정 확정 후 별도 안내' })
    expect(facts.application_note).toBe('일정 확정 후 별도 안내')
    expect(localizeFacts(facts, 'vi').application.note).toBe('일정 확정 후 별도 안내')
    const lines = replaced('ko-easy', 2, '10월 12일(월) 09:00부터 10월 22일(목) 18:00까지 온라인이나 전화 031-378-9000으로', '일정이 정해진 뒤 따로 알려 주면 온라인이나 전화 031-378-9000으로')
    expect(check(lines, 'ko-easy', facts).some((issue) => issue.includes('신청 기간'))).toBe(false)
    expect(factsOf({ application_note: '일정 확정 후 별도 안내' }).application_note).toBeNull()
  })
})

describe('끝난 공고·중국어 동 이름', () => {
  it('끝났거나 신청이 마감된 공고는 그렇게 알리고 확인할 점을 넘기지 않는다', () => {
    const facts = factsOf({ sessions: [session('s1', '2026-06-10')], session_count: 1, uncertain_items: ['신청 방법', '참여 대상·자격'] })
    expect(facts.operation_ended).toBe(true)
    expect(facts.check_items).toEqual([])
    const closed = factsOf({ application_end: '2026-10-14T18:00', uncertain_items: ['신청 방법', '형제자매 동반 가능 여부'] })
    expect([closed.operation_ended, closed.application_closed, closed.check_items]).toEqual([false, true, []])
    expect(localizeFacts(closed, 'zh').application.closed).toBe(true)
    expect(localizeFacts(facts, 'ko-easy').schedule.ended).toBe(true)
    expect(factsOf({ uncertain_items: ['신청 방법'] }).check_items).toContain('신청 방법')
    // 끝난 프로그램이 끝났다고 쓰는 것은 현재 신청 상태 단정이 아니다
    const ended = replaced('vi', 2, 'Miễn phí.', 'Miễn phí. Chương trình đã kết thúc.')
    expect(check(ended, 'vi', facts).some((issue) => issue.includes('단정'))).toBe(false)
    hasIssue(check(ended, 'vi'), '단정')
  })

  it('중국어 요약이 동 이름을 한자로 옮기면 문제로 본다 (제목 원문 따옴표 안은 괜찮다)', () => {
    const lines = replaced('zh', 0, '（多元文化家庭子女周六科学班）', '（南村洞多元文化家庭子女周六科学班）')
    hasIssue(check(lines, 'zh'), '동 이름을 한자로 옮김: 南村洞')
    expect(check(GOOD.zh, 'zh').some((issue) => issue.includes('동 이름'))).toBe(false)
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
  const isHeading = (options: Options) => options.schema === HEADING_SCHEMA
  const languageOf = (options: Options) => (['vi', 'zh'] as const).find((code) => options.system.includes(code === 'vi' ? '언어: 베트남어' : '언어: 중국어')) ?? 'ko-easy'
  const textOf = (options: Options) => options.parts.map((part) => part.text ?? '').join('\n')

  // 화살표 함수가 mock을 돌려주면 vitest가 정리 함수로 불러 버린다
  beforeEach(() => {
    mockedJson.mockReset()
  })

  it('검사와 모델 대조를 모두 통과하면 machine_checked (언어마다 생성 1회 + 대조 1회, 베트남어·중국어는 머리글 생성 1회 + 대조 1회 더)', async () => {
    mockedJson.mockImplementation(async (options) => {
      if (isHeading(options)) return HEADING[languageOf(options) as 'vi' | 'zh']
      if (!isDraft(options)) return { issues: [] }
      return draft(GOOD[languageOf(options)])
    })
    const summaries = await summarizeRecord(record(), { now: NOW })
    expect(Object.keys(summaries).sort()).toEqual(['ko-easy', 'vi', 'zh'])
    for (const summary of Object.values(summaries)) {
      expect(summary.status).toBe('machine_checked')
      expect(summary.issues).toEqual([])
      expect(summary.generated_at).toBe(NOW.toISOString())
    }
    expect(summaries.vi?.lines).toEqual(GOOD.vi)
    expect(summaries.vi?.heading).toEqual(HEADING.vi)
    expect(summaries.zh?.heading).toEqual(HEADING.zh)
    expect(summaries['ko-easy']).not.toHaveProperty('heading')
    expect(mockedJson).toHaveBeenCalledTimes(10)
    // 머리글은 첫 줄의 제목 번역에 맞추도록 첫 줄을 받는다
    const headingCall = mockedJson.mock.calls.find(([options]) => isHeading(options) && languageOf(options) === 'vi')![0]
    expect(textOf(headingCall)).toContain(GOOD.vi[0])
    // 원문 소개·근거는 모델에게 가지 않는다
    for (const [options] of mockedJson.mock.calls) {
      expect(textOf(options)).not.toContain('원문 소개')
      expect(textOf(options)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it('결정적 검사에 걸리면 문제를 알려 주고 한 번 다시 쓰게 한다', async () => {
    const drafts = [draft(replaced('vi', 2, 'Miễn phí. ', '')), draft(GOOD.vi)]
    mockedJson.mockImplementation(async (options) => (isHeading(options) ? HEADING.vi : isDraft(options) ? drafts.shift() : { issues: [] }))
    const { vi: summary } = await summarizeRecord(record(), { languages: ['vi'], now: NOW })
    expect(summary?.status).toBe('machine_checked')
    expect(summary?.lines).toEqual(GOOD.vi)
    const retry = mockedJson.mock.calls.filter(([options]) => isDraft(options))[1][0]
    expect(textOf(retry)).toContain('<이전 초안의 문제>')
    expect(textOf(retry)).toContain('무료라는 말')
  })

  it('문제가 남으면 machine_draft와 문제 목록. approved는 쓰지 않는다', async () => {
    mockedJson.mockImplementation(async (options) => (isHeading(options)
      ? HEADING.zh
      : isDraft(options)
        ? draft(GOOD.zh)
        : options.system.includes('번역 검수자') ? { issues: [] } : { issues: [{ line: 2, kind: 'addition', quote: '地点', detail: '없는 장소' }] }))
    const { zh: summary } = await summarizeRecord(record(), { languages: ['zh'], now: NOW })
    expect(summary?.status).toBe('machine_draft')
    expect(summary?.issues).toEqual(['모델 대조 2줄 사실에 없는 내용: "地点" 없는 장소'])
    expect(mockedJson).toHaveBeenCalledTimes(6)
  })

  it('머리글에 문제가 남으면 그 언어 요약 전체가 machine_draft', async () => {
    const wrong = { ...HEADING.vi, target: 'Học sinh lớp 1–6 tiểu học' }
    mockedJson.mockImplementation(async (options) => (isHeading(options) ? wrong : isDraft(options) ? draft(GOOD.vi) : { issues: [] }))
    const { vi: summary } = await summarizeRecord(record(), { languages: ['vi'], now: NOW })
    expect(summary?.status).toBe('machine_draft')
    expect(summary?.heading).toEqual(wrong)
    hasIssue(summary?.issues ?? [], '머리글 대상: 숫자가 원문 대상과 다름')
    // 머리글은 문제를 알려 주고 한 번 다시 쓰게 한다
    const retry = mockedJson.mock.calls.filter(([options]) => isHeading(options))[1][0]
    expect(textOf(retry)).toContain('<이전 번역의 문제>')
  })

  it('머리글 값 전체를 감싼 따옴표만 걷어내고 부제를 닫는 따옴표는 남긴다', async () => {
    const quoted = { ...HEADING.vi, title: 'Lớp khoa học thứ Bảy: “Em là nhà khoa học?”', institution: `"${HEADING.vi.institution}"` }
    mockedJson.mockImplementation(async (options) => (isHeading(options) ? quoted : isDraft(options) ? draft(GOOD.vi) : { issues: [] }))
    const { vi: summary } = await summarizeRecord(record(), { languages: ['vi'], now: NOW })
    expect(summary?.heading).toEqual({ ...HEADING.vi, title: 'Lớp khoa học thứ Bảy: “Em là nhà khoa học?”' })
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

describe('머리글 검사 (보호자 웹의 제목·기관·대상)', () => {
  const facts = () => factsOf()
  const issuesOf = (language: 'vi' | 'zh', overrides: Partial<typeof HEADING.vi>) => checkHeading({ ...HEADING[language], ...overrides }, facts(), language)

  it('원문과 맞는 머리글은 통과한다', () => {
    expect(checkHeading(HEADING.vi, facts(), 'vi')).toEqual([])
    expect(checkHeading(HEADING.zh, facts(), 'zh')).toEqual([])
  })

  it('비었거나, 숫자·학교급·다문화가족 조건이 원문과 다르면 문제', () => {
    hasIssue(issuesOf('vi', { title: '' }), '머리글 제목: 비어 있음')
    hasIssue(issuesOf('vi', { target: 'Con em gia đình đa văn hóa, lớp 1–6 tiểu học' }), '머리글 대상: 숫자가 원문 대상과 다름')
    hasIssue(issuesOf('vi', { target: 'Con em gia đình đa văn hóa lớp 1–4' }), '원문의 학교급(초등)이 빠짐')
    hasIssue(issuesOf('zh', { target: '小学1～4年级子女' }), '원문의 다문화가족 조건이 빠짐')
    hasIssue(issuesOf('zh', { target: '多元文化家庭初中1～4年级子女' }), '원문에 없는 학교급(중학교)을 씀')
    hasIssue(issuesOf('vi', { target: 'Bất kỳ ai, con em gia đình đa văn hóa lớp 1–4 tiểu học' }), '원문에 없는 누구나')
  })

  it('학교급을 묶어 쓴 대상(중고등학생·초·중학생·중고생)과 초등 중학년을 바르게 읽는다', () => {
    const teens = factsOf({ title: '다문화가족 진로 캠프', target_raw: '다문화가족 중고등학생', grade_range: [7, 12] })
    expect(checkHeading({ ...HEADING.vi, title: 'Trại hướng nghiệp gia đình đa văn hóa', target: 'Học sinh trung học cơ sở và trung học phổ thông thuộc gia đình đa văn hóa' }, teens, 'vi')).toEqual([])
    expect(checkHeading({ ...HEADING.zh, title: '多元文化家庭职业营', target: '多元文化家庭初中生和高中生' }, teens, 'zh')).toEqual([])
    hasIssue(checkHeading({ ...HEADING.zh, title: '多元文化家庭职业营', target: '多元文化家庭高中生' }, teens, 'zh'), '원문의 학교급(중학교)이 빠짐')
    const short = factsOf({ title: '다문화가족 진로 캠프', target_raw: '다문화가족 중고생', grade_range: [7, 12] })
    expect(checkHeading({ ...HEADING.zh, title: '多元文化家庭职业营', target: '多元文化家庭初高中生' }, short, 'zh')).toEqual([])
    const mixed = factsOf({ target_raw: '다문화가족 초·중학생', grade_range: [1, 9] })
    expect(checkHeading({ ...HEADING.vi, target: 'Học sinh tiểu học và trung học cơ sở thuộc gia đình đa văn hóa' }, mixed, 'vi')).toEqual([])
    const middleGrades = factsOf({ target_raw: '다문화가족 초등 중학년(3~4학년)', grade_range: [3, 4] })
    expect(checkHeading({ ...HEADING.zh, target: '多元文化家庭小学中年级（3～4年级）' }, middleGrades, 'zh')).toEqual([])
    hasIssue(checkHeading({ ...HEADING.zh, target: '多元文化家庭初中3～4年级' }, middleGrades, 'zh'), '원문에 없는 학교급(중학교)을 씀')
  })

  it('중·고등, 중고등, 고교, 초중고 표기를 읽고, 빈칸으로 떨어진 중·고나 학교가 아닌 중고는 학교급으로 읽지 않는다', () => {
    const teens = (target_raw: string, grade_range: [number, number] | null = [7, 12]) => factsOf({ target_raw, grade_range })
    const both = { ...HEADING.zh, target: '多元文化家庭初中和高中子女' }
    for (const target of ['다문화가족 중·고등 자녀', '다문화가족 중고등 청소년', '다문화가족 중·고교생', '다문화가족 중고교 학생', '다문화가족 중/고등학생', '다문화가족 중, 고등학생', '다문화가족 중,고생', '다문화중고생', '다문화중·고생', '관내중·고등학생 다문화가족 자녀', '중·고에 다니는 다문화가족 자녀']) {
      expect([target, checkHeading(both, teens(target, null), 'zh')]).toEqual([target, []])
      hasIssue(checkHeading({ ...HEADING.zh, target: '多元文化家庭高中子女' }, teens(target), 'zh'), '원문의 학교급(중학교)이 빠짐')
    }
    const allLevels = { ...HEADING.zh, target: '多元文化家庭小学、初中和高中学生' }
    for (const target of ['다문화가족 초·중·고교생', '다문화가족 초중고 자녀', '다문화가족 유초중고 자녀', '다문화가족 초 중 고등학생', '관내초중고 다문화가족 학생', '관내 초·중·고에 재학 중인 다문화가족 자녀']) {
      expect([target, checkHeading(allLevels, teens(target, null), 'zh')]).toEqual([target, []])
      hasIssue(checkHeading({ ...HEADING.zh, target: '多元文化家庭高中学生' }, teens(target, [1, 12]), 'zh'), '원문의 학교급(초등)이 빠짐')
    }
    const elementaryMiddle = { ...HEADING.zh, target: '辖区内多元文化家庭小学和初中子女' }
    for (const target of ['관내초·중학생 다문화가족 자녀', '다문화초중학생']) {
      expect([target, checkHeading(elementaryMiddle, teens(target, null), 'zh')]).toEqual([target, []])
      hasIssue(checkHeading({ ...HEADING.zh, target: '辖区内多元文化家庭初中子女' }, teens(target, [1, 9]), 'zh'), '원문의 학교급(초등)이 빠짐')
    }
    // '다문화가족 중 고등학생'은 다문화가족 가운데 고등학생이다
    const among = teens('다문화가족 중 고등학생', [10, 12])
    expect(checkHeading({ ...HEADING.zh, target: '多元文化家庭高中生' }, among, 'zh')).toEqual([])
    hasIssue(checkHeading({ ...HEADING.zh, target: '多元文化家庭初中生和高中生' }, among, 'zh'), '원문에 없는 학교급(중학교)을 씀')
    expect(checkHeading({ ...HEADING.zh, target: '育儿辛苦的多元文化家庭父母' }, teens('육아 중 고생하는 다문화가족 부모', null), 'zh')).toEqual([])
    expect(checkHeading({ ...HEADING.zh, target: '参加二手生活用品分享的多元文化家庭' }, teens('중고생활용품 나눔에 참여하는 다문화가족', null), 'zh')).toEqual([])
  })

  it('초등 중·고학년, 한국어 중·고급, 중·고령은 학교급이 아니다', () => {
    const upper = factsOf({ target_raw: '다문화가족 초등 중·고학년 자녀', grade_range: [3, 6] })
    expect(checkHeading({ ...HEADING.zh, target: '多元文化家庭小学中高年级子女' }, upper, 'zh')).toEqual([])
    hasIssue(checkHeading({ ...HEADING.zh, target: '多元文化家庭小学、初中和高中子女' }, upper, 'zh'), '원문에 없는 학교급(중학교)을 씀')
    hasIssue(checkHeading({ ...HEADING.zh, target: '多元文化家庭小学、初中和高中子女' }, upper, 'zh'), '원문에 없는 학교급(고등학교)을 씀')
    const adults = (target_raw: string) => factsOf({ target_raw, grade_range: null, age_range: null })
    expect(checkHeading({ ...HEADING.zh, target: '韩语中高级水平的多元文化家庭结婚移民者' }, adults('한국어 중·고급 수준의 다문화가족 결혼이민자'), 'zh')).toEqual([])
    expect(checkHeading({ ...HEADING.vi, target: 'Người nhập cư kết hôn thuộc gia đình đa văn hóa, trình độ tiếng Hàn trung và cao cấp' }, adults('한국어 초·중·고급 과정 다문화가족 결혼이민자'), 'vi')).toEqual([])
    expect(checkHeading({ ...HEADING.zh, target: '多元文化家庭中老年结婚移民者' }, adults('다문화가족 중·고령 결혼이민자'), 'zh')).toEqual([])
  })

  it('대상 원문이 비고 나이만 열린 범위면 0·99를 요구하지 않는다', () => {
    const over8 = factsOf({ target_raw: '', target_type: 'all', eligibility_requirements: [], grade_range: null, age_range: [8, 99] })
    expect(checkHeading({ ...HEADING.vi, target: 'Trẻ từ 8 tuổi trở lên' }, over8, 'vi')).toEqual([])
    hasIssue(checkHeading({ ...HEADING.vi, target: 'Trẻ 8–99 tuổi' }, over8, 'vi'), '숫자가 원문 대상과 다름 (원문 8)')
    const under7 = factsOf({ target_raw: '', target_type: 'all', eligibility_requirements: [], grade_range: null, age_range: [0, 7] })
    expect(checkHeading({ ...HEADING.zh, target: '7岁以下儿童' }, under7, 'zh')).toEqual([])
  })

  it('원문이 한글로 쓴 수는 아라비아 숫자나 같은 값의 중국어 글자로 옮길 수 있다', () => {
    const zhTitle = (source: string, title: string) => checkHeading({ ...HEADING.zh, title }, factsOf({ title: source }), 'zh')
    const zhTarget = (target_raw: string, target: string) => checkHeading({ ...HEADING.zh, target }, factsOf({ target_raw, grade_range: null, age_range: null }), 'zh')
    expect(zhTitle('엄마와 함께하는 하루 캠프', '妈妈陪伴的一日营')).toEqual([])
    hasIssue(zhTitle('엄마와 함께하는 하루 캠프', '妈妈陪伴的三日营'), '원문에 없는 수를 씀: "三"')
    expect(zhTitle('두 가족이 함께하는 요리 교실', '两个家庭一起做饭')).toEqual([])
    expect(zhTitle('한 학기 동안 함께하는 독서 교실', '一个学期的亲子阅读课')).toEqual([])
    expect(zhTitle('한두 번 참여하는 체험', '参加一两次的体验')).toEqual([])
    expect(zhTitle('삼일절 기념 태극기 만들기', '三一节纪念太极旗制作')).toEqual([])
    expect(zhTitle('정월대보름 전통놀이 체험', '正月十五元宵节传统游戏体验')).toEqual([])
    expect(zhTitle('매월 첫째·셋째 주 토요일 가족 독서 모임', '每月第一、三周周六家庭读书会')).toEqual([])
    expect(zhTarget('세 자녀 이상 다문화가족', '三个子女以上的多元文化家庭')).toEqual([])
    expect(zhTarget('세 자녀 이상 다문화가족', '3个子女以上的多元文化家庭')).toEqual([])
    expect(zhTarget('돌 전 아기와 다문화가족 보호자', '一岁以下婴儿和多元文化家庭家长')).toEqual([])
    // 같은 수를 원문이 숫자로도, 한글로도 적었으면 한글 수는 글자로 옮겨도 된다
    expect(zhTitle('1인가구 하루 요리교실', '1人家庭一日烹饪课')).toEqual([])
  })

  it('다른 낱말 속 글자나 학년·나이가 아닌 수로 원문에 없는 학년·나이를 허락하지 않는다', () => {
    const zhTarget = (target_raw: string, target: string) => checkHeading({ ...HEADING.zh, target }, factsOf({ target_raw, grade_range: null, age_range: null }), 'zh')
    hasIssue(zhTarget('인터넷 과의존 위험 다문화가족 초등학생', '有网络依赖风险的多元文化家庭小学四年级以上学生'), '원문에 없는 수를 씀: "四"')
    hasIssue(zhTarget('인터넷 과의존 위험 다문화가족 초등학생', '有网络依赖风险的多元文化家庭小学4年级以上学生'), '숫자가 원문 대상과 다름 (원문 없음)')
    hasIssue(zhTarget('아이돌봄 서비스를 이용하는 다문화가족 영아와 보호자', '使用儿童照护服务的多元文化家庭1岁以下婴儿及家长'), '숫자가 원문 대상과 다름 (원문 없음)')
    hasIssue(zhTarget('한국어 첫걸음 다문화가족 초등학생 자녀', '韩语入门多元文化家庭小学一年级子女'), '원문에 없는 수를 씀: "一"')
    hasIssue(zhTarget('세 자녀 이상 다문화가족', '三岁以上子女的多元文化家庭'), '원문에 없는 수를 씀: "三"')
    hasIssue(zhTarget('두 자녀 이상 다문화가족', '有2岁以上子女的多元文化家庭'), '숫자가 원문 대상과 다름 (원문 없음)')
    expect(zhTarget('여섯 살 다문화가족 자녀', '6岁多元文化家庭子女')).toEqual([])
    expect(zhTarget('여섯 살 다문화가족 자녀', '六岁多元文化家庭子女')).toEqual([])
  })

  it('수가 아닌 一은 두고, 원문에 없는 학년·나이·횟수를 글자 숫자로 지어내면 문제', () => {
    expect(checkHeading({ ...HEADING.zh, title: '和孩子度过一个快乐的周末' }, factsOf({ title: '아이와 함께하는 즐거운 주말' }), 'zh')).toEqual([])
    expect(checkHeading({ ...HEADING.zh, title: '减少一次性用品的环保生活课堂' }, factsOf({ title: '일회용품 줄이기 친환경 생활 교실' }), 'zh')).toEqual([])
    hasIssue(checkHeading({ ...HEADING.zh, title: '多元文化家庭子女三日营' }, facts(), 'zh'), '원문에 없는 수를 씀: "三"')
    hasIssue(checkHeading({ ...HEADING.zh, target: '多元文化家庭初中一年级学生' }, factsOf({ target_raw: '다문화가족 중학생', grade_range: null }), 'zh'), '원문에 없는 수를 씀: "一"')
    hasIssue(checkHeading({ ...HEADING.zh, target: '多元文化家庭五岁以下子女' }, factsOf({ target_raw: '다문화가족 자녀', grade_range: null, age_range: null }), 'zh'), '원문에 없는 수를 씀: "五"')
    hasIssue(checkHeading({ ...HEADING.vi, target: 'Con em gia đình đa văn hóa từ 5 tuổi trở xuống' }, factsOf({ target_raw: '다문화가족 자녀', grade_range: null, age_range: null }), 'vi'), '숫자가 원문 대상과 다름 (원문 없음)')
    // 원문이 아라비아 숫자로 쓴 수는 아라비아 숫자로
    const single = factsOf({ title: '1인가구 반찬 만들기' })
    expect(checkHeading({ ...HEADING.zh, title: '1人家庭小菜制作' }, single, 'zh')).toEqual([])
    hasIssue(checkHeading({ ...HEADING.zh, title: '一人家庭小菜制作' }, single, 'zh'), '숫자를 글자로 씀: "一"')
  })

  it('중국어에서 한국어로 둘 수 있는 말은 오산의 동 이름뿐이다', () => {
    const child = factsOf({ title: '다문화가족 아동 체험활동' })
    hasIssue(checkHeading({ ...HEADING.zh, title: '多元文化家庭아동체험활동' }, child, 'zh'), '한국어를 번역하지 않고 씀: 아동체험활동')
    const dong = factsOf({ title: '신장1동 토요 과학교실' })
    expect(checkHeading({ ...HEADING.zh, title: '신장1동周六科学班' }, dong, 'zh')).toEqual([])
  })

  it('베트남어의 중도입국 표현도 이주 배경 조건으로 본다', () => {
    const midEntry = factsOf({ target_raw: '중도입국 청소년', grade_range: null, age_range: null, eligibility_requirements: ['중도입국'] })
    expect(checkHeading({ ...HEADING.vi, target: 'Thanh thiếu niên nhập cảnh giữa chừng' }, midEntry, 'vi')).toEqual([])
  })

  it('중도입국만 대상인 공고는 중국어 대상에 多元文化家庭을 붙이지 않아도 된다', () => {
    const midEntry = factsOf({ target_raw: '중도입국 중학생 (중학교 1~3학년)', grade_range: [7, 9], eligibility_requirements: ['중도입국'] })
    expect(checkHeading({ ...HEADING.zh, target: '中途入国初中生（初中1～3年级）' }, midEntry, 'zh')).toEqual([])
  })

  it('기관은 한국어 원문 이름을 괄호 안에 그대로 붙이고, 제목·대상에는 한국어를 쓰지 않는다 (중국어의 동 이름만 예외)', () => {
    hasIssue(issuesOf('vi', { institution: 'Trung tâm Gia đình thành phố Osan' }), '한국어 원문 이름(오산시가족센터)을 괄호 안에 그대로 붙이지 않음')
    hasIssue(issuesOf('vi', { title: 'Lớp khoa học 토요 cho con em' }), '머리글 제목: 한국어를 번역하지 않고 씀: 토요')
    hasIssue(issuesOf('zh', { title: '多元文化家庭子女周六科学班 서울' }), '원문에 없는 한국어: 서울')
    const dongFacts = factsOf({ title: '대원동 토요 과학교실' })
    expect(checkHeading({ ...HEADING.zh, title: '대원동周六科学班' }, dongFacts, 'zh')).toEqual([])
    hasIssue(checkHeading({ ...HEADING.zh, title: '大院洞周六科学班' }, dongFacts, 'zh'), '동 이름을 한자로 옮김')
    hasIssue(checkHeading({ ...HEADING.vi, title: 'Lớp khoa học thứ Bảy 대원동' }, dongFacts, 'vi'), '한국어를 번역하지 않고 씀: 대원동')
  })

  it('중국어 번체자와 글자로 쓴 숫자는 문제', () => {
    hasIssue(issuesOf('zh', { title: '多元文化家庭子女週六科學班' }), '번체자를 씀')
    hasIssue(issuesOf('zh', { target: '多元文化家庭小学一至四年级子女' }), '숫자를 글자로 씀')
  })

  it('대상 원문이 비어 있으면 학년·나이로 숫자를 대조한다', () => {
    const blank = factsOf({ target_raw: '', target_type: 'all', eligibility_requirements: [] })
    expect(checkHeading({ ...HEADING.vi, target: 'Học sinh lớp 1–4 tiểu học' }, blank, 'vi')).toEqual([])
    hasIssue(checkHeading({ ...HEADING.vi, target: 'Học sinh lớp 1–5 tiểu học' }, blank, 'vi'), '숫자가 원문 대상과 다름')
  })
})

describe('이미 만든 요약에 머리글 채우기 (npm run headings)', () => {
  const base: LanguageSummary = { lines: GOOD.vi, status: 'machine_checked', generated_at: NOW.toISOString(), issues: [] }
  const headingIssue = '머리글 대상: 숫자가 원문 대상과 다름 (원문 1, 4)'

  it('머리글이 없거나 머리글 검사에 걸린 검수 전 요약만 다시 만들고, 승인된 요약은 force일 때만', () => {
    expect(wantsHeading(base, false)).toBe(true)
    expect(wantsHeading({ ...base, heading: HEADING.vi }, false)).toBe(false)
    expect(wantsHeading({ ...base, heading: HEADING.vi, status: 'machine_draft', issues: [headingIssue] }, false)).toBe(true)
    expect(wantsHeading({ ...base, heading: HEADING.vi, status: 'machine_draft', issues: ['모델 대조 실패: 503'] }, false)).toBe(false)
    const approved: LanguageSummary = { ...base, heading: HEADING.vi, status: 'approved', reviewer: '검수자', approved_at: NOW.toISOString(), approved_hash: 'x' }
    expect(wantsHeading(approved, false)).toBe(false)
    expect(wantsHeading(approved, true)).toBe(true)
  })

  it('새 머리글은 이전 머리글 문제만 바꾸고 다른 문제는 남기며, 승인을 거둔다', () => {
    const approved: LanguageSummary = { ...base, heading: HEADING.vi, status: 'approved', reviewer: '검수자', approved_at: NOW.toISOString(), approved_hash: 'x' }
    const clean = withHeading(approved, HEADING.vi, [])
    expect(clean).toEqual({ ...base, heading: HEADING.vi, status: 'machine_checked' })
    const draft = withHeading({ ...base, status: 'machine_draft', issues: ['1줄에 제목 원문이 없음', headingIssue] }, HEADING.vi, ['머리글 제목: 비어 있음'])
    expect(draft.status).toBe('machine_draft')
    expect(draft.issues).toEqual(['1줄에 제목 원문이 없음', '머리글 제목: 비어 있음'])
  })
})
