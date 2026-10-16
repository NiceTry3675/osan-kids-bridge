/**
 * 보호자 질문: 보호자 웹의 AI 상담에서 공고로 답을 찾지 못해 보호자가 '기관에 알리기'를 누른 질문.
 * 서버(program-api GET /agent/questions)가 있으면 그 기록을 쓰고, 시연용 예시 질문을 함께 보여 줍니다.
 */
export type QuestionTopic = 'family_eligibility' | 'companion' | 'korean_level' | 'schedule' | 'age_grade' | 'materials' | 'other'

export interface QuestionEntry {
  program_id: string
  title: string
  total: number
  topics: Partial<Record<QuestionTopic, number>>
  questions: { question_ko: string; topic: QuestionTopic; count: number; last_date: string; live?: boolean }[]
}

export interface QuestionSummary {
  total: number
  live: number
  programs: QuestionEntry[]
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

/** 시연용 예시: 실제 보호자의 질문이 아니라, 오산시가족센터 공고에서 빠지기 쉬운 내용을 가정해 만든 것 */
const DEMO_QUESTIONS: Omit<QuestionEntry, 'total' | 'topics'>[] = [
  {
    program_id: 'osan-fc-sports-day',
    title: '2026년 가족친화문화 프로그램- 우리 zip. 운동회',
    questions: [
      { question_ko: '참가비가 있나요?', topic: 'other', count: 9, last_date: '2026-10-14' },
      { question_ko: '준비물이나 복장 규정이 있나요?', topic: 'materials', count: 7, last_date: '2026-10-14' },
      { question_ko: '형제자매도 함께 참여할 수 있나요?', topic: 'companion', count: 5, last_date: '2026-10-13' },
      { question_ko: '오산시에 살지 않아도 참여할 수 있나요?', topic: 'family_eligibility', count: 3, last_date: '2026-10-12' },
    ],
  },
  {
    program_id: 'osan-fc-kpop-dance',
    title: '다문화가족 자녀성장프로그램 k-pop 방송댄스',
    questions: [
      { question_ko: 'A반과 B반을 모두 신청할 수 있나요?', topic: 'schedule', count: 6, last_date: '2026-10-13' },
      { question_ko: '한국어를 잘 못해도 참여할 수 있나요?', topic: 'korean_level', count: 4, last_date: '2026-10-12' },
      { question_ko: '중간에 하루 빠져도 되나요?', topic: 'schedule', count: 3, last_date: '2026-10-11' },
    ],
  },
  {
    program_id: 'osan-fc-high-school-info',
    title: '고등학교 진학설명회',
    questions: [
      { question_ko: '베트남어 통역이 있나요?', topic: 'korean_level', count: 8, last_date: '2026-10-14' },
      { question_ko: '아이와 함께 가야 하나요?', topic: 'companion', count: 4, last_date: '2026-10-13' },
    ],
  },
]

function merge(live: Omit<QuestionEntry, 'total' | 'topics'>[]): QuestionSummary {
  const programs = new Map<string, QuestionEntry>()
  let liveCount = 0
  for (const [source, isLive] of [[DEMO_QUESTIONS, false], [live, true]] as const) {
    for (const program of source) {
      const entry = programs.get(program.program_id) ?? { program_id: program.program_id, title: program.title, total: 0, topics: {}, questions: [] }
      for (const question of program.questions) {
        if (isLive) liveCount += question.count
        const same = entry.questions.find((item) => item.question_ko === question.question_ko)
        if (same) {
          same.count += question.count
          same.live = same.live || isLive
          if (question.last_date > same.last_date) same.last_date = question.last_date
        } else {
          entry.questions.push({ ...question, live: isLive })
        }
        entry.total += question.count
        entry.topics[question.topic] = (entry.topics[question.topic] ?? 0) + question.count
      }
      programs.set(program.program_id, entry)
    }
  }
  const list = [...programs.values()].sort((a, b) => b.total - a.total)
  for (const entry of list) entry.questions.sort((a, b) => b.count - a.count)
  return { total: list.reduce((sum, entry) => sum + entry.total, 0), live: liveCount, programs: list }
}

export async function loadQuestions(signal?: AbortSignal): Promise<QuestionSummary> {
  if (!apiBaseUrl) return merge([])
  try {
    const response = await fetch(`${apiBaseUrl}/agent/questions`, { signal })
    if (!response.ok) return merge([])
    const body = await response.json() as { programs: Omit<QuestionEntry, 'total' | 'topics'>[] }
    return merge(body.programs)
  } catch {
    return merge([])
  }
}
