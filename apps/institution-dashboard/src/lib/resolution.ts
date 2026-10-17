import type { Addendum, ProgramRow } from '../data/admin'
import type { QuestionEntry, QuestionSummary } from '../data/questions'

// 보호자 질문 중 기관 추가 안내로 이미 답한 것 (질문 문장이 안내의 resolves_questions에 있는 것)

/** 공고 ID → (질문 문장 → 그 질문에 답한 추가 안내) */
export function answeredQuestions(rows: ProgramRow[]): Map<string, Map<string, Addendum>> {
  const result = new Map<string, Map<string, Addendum>>()
  for (const row of rows) {
    const byQuestion = new Map<string, Addendum>()
    for (const addendum of row.addenda) for (const question of addendum.resolves_questions) if (!byQuestion.has(question)) byQuestion.set(question, addendum)
    if (byQuestion.size) result.set(row.program_id, byQuestion)
  }
  return result
}

/** 아직 답하지 않은 질문들 */
export function openQuestions(entry: QuestionEntry, rows: ProgramRow[]): QuestionEntry['questions'] {
  const answered = answeredQuestions(rows).get(entry.program_id)
  return entry.questions.filter((question) => !answered?.has(question.question_ko))
}

/** 메뉴 배지: 아직 답하지 않은 질문 문장 수 */
export function unresolvedCount(summary: QuestionSummary, rows: ProgramRow[]): number {
  return summary.programs.reduce((sum, entry) => sum + openQuestions(entry, rows).length, 0)
}
