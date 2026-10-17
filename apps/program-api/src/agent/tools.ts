import type { FunctionDeclaration } from '@google/genai'
import { evaluateProgram, parseSearchFilters, searchPrograms, seoulToday } from '../match'
import { koreanDateLabel } from '../match/dates'
import { ageRangeLabel, gradeRangeLabel, sessionLabel } from '../match/labels'
import type { ProgramRecord, ProgramResponse, UncertainTopic } from '../types'

// 상담 에이전트가 쓰는 도구. 모두 검수·게시된 공고의 사실과 기존 판정 로직(명세 4·5장)만 쓴다.
// 도구 결과는 한국어 사실이고, 보호자 언어로 옮기는 일은 모델이 한다.

export const UNANSWERED_TOPICS: UncertainTopic[] = ['family_eligibility', 'companion', 'korean_level', 'schedule', 'age_grade', 'materials', 'other']

const WINDOW_SCHEMA = {
  type: 'array',
  description: '보호자가 아이를 보낼 수 있는 시간. 요일(day_of_week) 또는 날짜(date) 하나와 시작·종료 시각',
  items: {
    type: 'object',
    properties: {
      day_of_week: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
      date: { type: 'string', description: 'YYYY-MM-DD' },
      start_time: { type: 'string', description: 'HH:MM' },
      end_time: { type: 'string', description: 'HH:MM' },
    },
    required: ['start_time', 'end_time'],
  },
}

const CHILD_PROPERTIES = {
  child_grade: { type: 'integer', description: '학년. 초등 1~6, 중학교 7~9, 고등학교 10~12. 나이와 함께 보내지 않는다' },
  child_age: { type: 'integer', description: '만 나이 0~19. 학년을 모를 때만' },
  windows: WINDOW_SCHEMA,
}

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_programs',
    description: '게시된 오산 자녀 프로그램을 찾는다. 조건을 넣으면 기존 판정 규칙으로 맞는 공고만 남긴다. 마감·종료된 공고와 보호자만 참여하는 공고는 나오지 않는다.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        ...CHILD_PROPERTIES,
        interests: { type: 'array', items: { type: 'string', enum: ['experience_culture', 'korean_study', 'sports_arts', 'career'] } },
        free_only: { type: 'boolean' },
        keyword: { type: 'string', description: '제목·소개에서 찾을 한국어 낱말 (예: 댄스, 운동회, 진학)' },
      },
    },
  },
  {
    name: 'get_program',
    description: '공고 한 건의 검수된 사실 전부: 대상, 회차, 장소, 비용, 신청 기간·방법, 문의처, 동반, 언어 지원, 안내 문장, 기관 추가 안내, 기관에 확인할 점, 원문 근거 인용.',
    parametersJsonSchema: { type: 'object', properties: { program_id: { type: 'string' } }, required: ['program_id'] },
  },
  {
    name: 'check_fit',
    description: '아이의 학년·나이와 가능한 시간을 공고와 비교한다 (기존 판정 로직). 맞는 회차와 아직 확인할 점을 돌려준다. 참여 자격을 확정하지는 않는다.',
    parametersJsonSchema: { type: 'object', properties: { program_id: { type: 'string' }, ...CHILD_PROPERTIES }, required: ['program_id'] },
  },
  {
    name: 'draft_inquiry',
    description: '공고에 답이 없는 질문을 기관에 보낼 한국어 문의문으로 만들고, 공고에서 확인된 문의처만 돌려준다.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        program_id: { type: 'string' },
        questions_ko: { type: 'array', items: { type: 'string' }, description: '기관에 물을 질문 1~5개. 정중한 한국어, 개인정보 없이' },
      },
      required: ['program_id', 'questions_ko'],
    },
  },
  {
    name: 'flag_unanswered',
    description: '공고에서 답을 찾을 수 없었던 질문을 표시한다. 보호자가 동의하면 이름 없이 기관에 전달되어 공고 보완에 쓰인다 (이 도구는 저장하지 않는다).',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        program_id: { type: 'string' },
        topic: { type: 'string', enum: UNANSWERED_TOPICS },
        question_ko: { type: 'string', description: '개인정보를 빼고 일반화한 한국어 질문 한 문장 (예: 준비물이 있나요?)' },
      },
      required: ['program_id', 'topic', 'question_ko'],
    },
  },
  {
    name: 'respond',
    description: '보호자에게 답한다. 대화를 마칠 때 반드시 이 도구로 답한다.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        answer: { type: 'string', description: '보호자 언어로 쓴 답' },
        citations: {
          type: 'array',
          description: '답의 근거가 된 원문 인용. get_program의 evidence·notices·institution_addenda에 있는 한국어 문장을 글자 그대로',
          items: { type: 'object', properties: { program_id: { type: 'string' }, quote: { type: 'string' } }, required: ['program_id', 'quote'] },
        },
        follow_ups: { type: 'array', items: { type: 'string' }, description: '보호자가 이어서 물을 만한 짧은 질문 0~3개 (보호자 언어)' },
      },
      required: ['answer'],
    },
  },
]

export interface Step {
  tool: string
  program_id?: string
  title?: string
  count?: number
  ok: boolean
}

export interface Unanswered {
  program_id: string
  title: string
  topic: UncertainTopic
  question_ko: string
}

export interface Inquiry {
  program_id: string
  title: string
  message_ko: string
  contacts: { type: 'phone' | 'visit' | 'online'; phone?: string; url?: string; address?: string }[]
  /** 시연용 가상 공고면 화면이 실제 전화로 연결하지 않는다 */
  is_demo: boolean
}

export interface ToolContext {
  records: ProgramRecord[]
  now: Date
  /** 번역 포스터가 있는 언어 (get_program에서 알려 준다) */
  posterLanguages?: (id: string) => string[]
}

export interface ToolState {
  steps: Step[]
  programs: Map<string, string>
  unanswered: Unanswered[]
  inquiry: Inquiry | null
}

const STATUS_KO: Record<string, string> = { matched: '맞음', not_matched: '맞지 않음', unknown: '확인 필요', not_applied: '판정 안 함' }
const APPLICATION_KO: Record<string, string> = { open: '신청 중', upcoming: '신청 예정', closed: '마감', unknown: '신청 기간 미상' }

const cost = (program: Pick<ProgramResponse, 'cost_raw' | 'cost_krw'>) =>
  program.cost_raw ?? (program.cost_krw === 0 ? '무료' : program.cost_krw !== null ? `${program.cost_krw.toLocaleString('ko-KR')}원` : '공고에 없음')

function place(program: ProgramResponse): string | null {
  const session = program.next_session
  const name = session?.place_name ?? program.venue?.place_name ?? null
  return name ?? (session?.online || program.venue?.online ? '온라인' : null)
}

function compact(program: ProgramResponse) {
  return {
    program_id: program.program_id,
    title: program.title,
    institution: program.institution,
    target: program.target_raw,
    next_session: program.next_session ? `${sessionLabel(program.next_session)} ${place(program) ?? ''}`.trim() : program.schedule_note ?? '일정 공고에 없음',
    cost: cost(program),
    application: `${APPLICATION_KO[program.application_status]}${program.application_end ? ` (~${koreanDateLabel(program.application_end)})` : ''}`,
    match: { age_grade: STATUS_KO[program.age_grade_match_status], time: STATUS_KO[program.time_match_status], eligibility: STATUS_KO[program.eligibility_status] },
  }
}

function filtersFrom(args: Record<string, unknown>) {
  return parseSearchFilters({
    child_grade: args.child_grade,
    child_age: args.child_age,
    available_windows: args.windows,
    interests: args.interests,
    free_only: args.free_only === true ? true : undefined,
  })
}

/** get_program이 돌려주는 공고 사실 (공고 보완 도우미도 같은 사실을 읽는다) */
export function noticeFacts(program: ProgramResponse, record: ProgramRecord, today: string, posters: string[]) {
  return {
    today,
    program_id: program.program_id,
    title: program.title,
    institution: program.institution,
    target: program.target_raw,
    grade_range: program.grade_range ? gradeRangeLabel(program.grade_range) : '공고에 없음',
    age_range: program.age_range ? ageRangeLabel(program.age_range) : '공고에 없음',
    eligibility_requirements: program.eligibility_requirements ?? '공고에 없음(확인 필요)',
    who_attends: program.audience,
    description: program.description,
    sessions: program.sessions.slice(0, 16).map((session) => `${sessionLabel(session)} ${session.place_name ?? ''}`.trim()),
    session_count: program.session_count,
    schedule_note: program.schedule_note,
    attendance_rule: { all_sessions: '모든 회차 참여', choose_one: '회차 중 하나 선택', unknown: '공고에 없음' }[program.attendance_rule],
    mid_join_allowed: program.mid_join_allowed ?? '공고에 없음',
    venue: program.venue?.place_name ?? null,
    address: program.venue?.address ?? program.next_session?.address ?? null,
    cost: cost(program),
    capacity: program.capacity ?? '공고에 없음',
    application: {
      status: APPLICATION_KO[program.application_status],
      start: program.application_start_at,
      /** 신청할 수 있는 마지막 날 (마감이 새벽이면 전날) */
      last_day: program.application_end,
      end_at: program.application_end_at,
      methods: program.application_methods.map((method) => ({ type: method.type, label: method.label, phone: method.phone, url: method.url })),
      note: program.application_note,
    },
    inquiry: program.inquiry_methods.map((method) => ({ type: method.type, phone: method.phone, url: method.url, address: method.address })),
    guardian_companion: program.guardian_companion ?? '공고에 없음',
    sibling_companion: program.sibling_companion ?? '공고에 없음',
    korean_level_required: program.korean_level_required ?? '공고에 없음',
    support_languages: program.support_languages ?? '공고에 없음',
    support_is_interpretation: program.support_interpretation,
    application_page_languages: program.application_languages ?? '공고에 없음',
    notices: program.notices,
    /** 공고가 나온 뒤 기관 담당자가 보호자 질문을 보고 확정해 덧붙인 안내 */
    institution_addenda: (record.addenda ?? []).map((addendum) => ({ text: addendum.text, confirmed_on: seoulToday(new Date(addendum.added_at)) })),
    to_confirm_with_institution: program.uncertain_items_ko,
    evidence: program.source_evidence,
    source_url: program.source_url,
    verified_at: program.verified_at,
    translated_poster_languages: posters,
    is_demo_notice: record.source.demo === true,
  }
}

function inquiryMessage(title: string, questions: string[]): string {
  return [
    '안녕하세요.',
    `${title} 프로그램에 관심이 있는 보호자입니다. 공고에서 확인하지 못한 점을 여쭤봅니다.`,
    '',
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    '',
    '답변 부탁드립니다. 감사합니다.',
  ].join('\n')
}

/** 도구 하나를 실행한다. 결과는 모델에 돌려줄 JSON, 상태(steps·unanswered·inquiry)는 state에 쌓는다 */
export function runTool(name: string, args: Record<string, unknown>, context: ToolContext, state: ToolState): unknown {
  const byId = new Map(context.records.map((record) => [record.program_id, record]))
  const lookup = (id: unknown) => (typeof id === 'string' ? byId.get(id) : undefined)
  const remember = (record: ProgramRecord) => state.programs.set(record.program_id, record.title)
  const notFound = (step: string) => {
    state.steps.push({ tool: step, ok: false })
    return { error: '게시된 공고 중에 그 program_id가 없습니다. search_programs로 먼저 찾으세요.' }
  }

  switch (name) {
    case 'search_programs': {
      const parsed = filtersFrom(args)
      if (!parsed.ok) {
        state.steps.push({ tool: name, ok: false })
        return { error: parsed.errors }
      }
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : ''
      const found = searchPrograms(context.records, parsed.filters, context.now)
      const match = (program: ProgramResponse) => !keyword || `${program.title} ${program.description}`.includes(keyword)
      const results = found.results.filter(match)
      const needsTimeCheck = found.needs_confirmation.filter(match)
      state.steps.push({ tool: name, count: results.length + needsTimeCheck.length, ok: true })
      return {
        today: seoulToday(context.now),
        results: results.slice(0, 6).map(compact),
        needs_time_check: needsTimeCheck.slice(0, 3).map(compact),
        total: results.length + needsTimeCheck.length,
      }
    }
    case 'get_program': {
      const record = lookup(args.program_id)
      if (!record) return notFound(name)
      remember(record)
      state.steps.push({ tool: name, program_id: record.program_id, title: record.title, ok: true })
      return noticeFacts(evaluateProgram(record, null, context.now), record, seoulToday(context.now), context.posterLanguages?.(record.program_id) ?? [])
    }
    case 'check_fit': {
      const record = lookup(args.program_id)
      if (!record) return notFound(name)
      const parsed = filtersFrom(args)
      if (!parsed.ok) {
        state.steps.push({ tool: name, program_id: record.program_id, title: record.title, ok: false })
        return { error: parsed.errors }
      }
      remember(record)
      const program = evaluateProgram(record, parsed.filters, context.now)
      state.steps.push({ tool: name, program_id: record.program_id, title: record.title, ok: true })
      return {
        age_grade: STATUS_KO[program.age_grade_match_status],
        time: STATUS_KO[program.time_match_status],
        family_eligibility: STATUS_KO[program.eligibility_status],
        matched_sessions: program.sessions.filter((session) => program.matched_sessions.includes(session.id)).map(sessionLabel),
        reasons: program.matched_reasons,
        still_to_confirm: program.uncertain_items_ko,
        application: APPLICATION_KO[program.application_status],
        note: '판정은 공고에 적힌 학년·나이·시간 기준이다. 가족 자격이나 선발 여부는 기관이 정한다.',
      }
    }
    case 'draft_inquiry': {
      const record = lookup(args.program_id)
      if (!record) return notFound(name)
      const questions = (Array.isArray(args.questions_ko) ? args.questions_ko : []).filter((question): question is string => typeof question === 'string' && question.trim() !== '').slice(0, 5).map((question) => question.trim())
      const program = evaluateProgram(record, null, context.now)
      const phones = program.application_methods.filter((method) => method.type === 'phone' && method.phone)
      const contacts = [
        ...program.inquiry_methods.map((method) => ({ type: method.type, phone: method.phone, url: method.url, address: method.address })),
        ...phones.filter((method) => !program.inquiry_methods.some((inquiry) => inquiry.phone === method.phone)).map((method) => ({ type: 'phone' as const, phone: method.phone })),
      ]
      remember(record)
      state.inquiry = { program_id: record.program_id, title: record.title, message_ko: inquiryMessage(record.title, questions), contacts, is_demo: record.source.demo === true }
      state.steps.push({ tool: name, program_id: record.program_id, title: record.title, count: questions.length, ok: true })
      return { message_ko: state.inquiry.message_ko, contacts: contacts.length ? contacts : '공고에서 확인된 문의처가 없음' }
    }
    case 'flag_unanswered': {
      const record = lookup(args.program_id)
      if (!record) return notFound(name)
      const topic = UNANSWERED_TOPICS.includes(args.topic as UncertainTopic) ? args.topic as UncertainTopic : 'other'
      const question = typeof args.question_ko === 'string' ? args.question_ko.trim().slice(0, 200) : ''
      if (question && !state.unanswered.some((item) => item.program_id === record.program_id && item.question_ko === question)) {
        state.unanswered.push({ program_id: record.program_id, title: record.title, topic, question_ko: question })
      }
      state.steps.push({ tool: name, program_id: record.program_id, title: record.title, ok: true })
      return { ok: true, note: '저장하지 않았다. 보호자가 동의하면 화면에서 기관에 전달된다.' }
    }
    default:
      return { error: `알 수 없는 도구: ${name}` }
  }
}
