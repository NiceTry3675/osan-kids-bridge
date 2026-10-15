import type { ProgramSession } from '../types'
import { isValidDate, isValidTime, koreanDateLabel } from './dates'

// 학년 규칙: 초등 1~6, 중학교 7~9, 고등학교 10~12

function schoolOf(grade: number): { school: string; grade: number } {
  if (grade <= 6) return { school: '초등', grade }
  if (grade <= 9) return { school: '중학교', grade: grade - 6 }
  return { school: '고등학교', grade: grade - 9 }
}

export function gradeLabel(grade: number): string {
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) return `${grade}학년`
  const { school, grade: inSchool } = schoolOf(grade)
  return `${school} ${inSchool}학년`
}

export function gradeRangeLabel([from, to]: [number, number]): string {
  if (from === to) return gradeLabel(from)
  const start = schoolOf(from)
  const end = schoolOf(to)
  if (start.school === end.school) return `${start.school} ${start.grade}~${end.grade}학년`
  return `${gradeLabel(from)}~${gradeLabel(to)}`
}

export function ageRangeLabel([from, to]: [number, number]): string {
  return from === to ? `${from}세` : `${from}~${to}세`
}

/** '10월 17일(토) 10:10~12:00' */
export function sessionLabel(session: ProgramSession): string {
  if (!isValidDate(session.date)) return '일정 확인 필요'
  const time = isValidTime(session.start_time) && isValidTime(session.end_time) ? ` ${session.start_time}~${session.end_time}` : ''
  return `${koreanDateLabel(session.date)}${time}`
}
