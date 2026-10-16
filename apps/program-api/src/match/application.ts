import type { ApplicationStatus, ProgramRecord } from '../types'
import { parseDateTime, seoulNowTime, seoulToday } from './dates'
import type { DateTimeValue } from './dates'

// 신청 상태는 저장하지 않고 요청 시점(now)에 계산한다 (명세 5.2).
// - 시각이 있는 경계는 분 단위로 비교한다. 시작 시각부터 접수, 마감 시각까지 접수(양 끝 포함).
// - 날짜만 있는 경계는 시각을 지어내지 않는다. 그 날짜 당일에는 열렸는지·닫혔는지 판단하지 않는다.
// - 마감이 지났으면 시작일이 없어도 closed. 시작 전이면 마감일이 없어도 upcoming.
// - 시작이 지났어도 마감일이 없으면, 마감 전이어도 시작일이 없으면 접수 중을 확인할 수 없어 unknown.
// - 형식이 틀리거나 시작이 마감보다 늦으면 unknown.

function stampOf(value: DateTimeValue): string {
  return value.time ? `${value.date}T${value.time}` : value.date
}

function contradicts(start: DateTimeValue, end: DateTimeValue): boolean {
  if (start.time && end.time) return stampOf(start) > stampOf(end)
  return start.date > end.date
}

/** 시작했는가. 날짜만 있는 시작일 당일은 null */
function hasOpened(start: DateTimeValue, today: string, now: string): boolean | null {
  if (start.time) return now >= stampOf(start)
  return start.date === today ? null : today > start.date
}

/** 마감됐는가. 날짜만 있는 마감일 당일은 null */
function hasClosed(end: DateTimeValue, today: string, now: string): boolean | null {
  if (end.time) return now > stampOf(end)
  return end.date === today ? null : today > end.date
}

export function applicationStatus(record: ProgramRecord, now: Date): ApplicationStatus {
  const { application_start: rawStart, application_end: rawEnd } = record
  const start = rawStart ? parseDateTime(rawStart) : null
  const end = rawEnd ? parseDateTime(rawEnd) : null
  if ((rawStart && !start) || (rawEnd && !end)) return 'unknown'
  if (!start && !end) return 'unknown'
  if (start && end && contradicts(start, end)) return 'unknown'

  const today = seoulToday(now)
  const stamp = `${today}T${seoulNowTime(now)}`
  if (end && hasClosed(end, today, stamp) === true) return 'closed'
  const opened = start ? hasOpened(start, today, stamp) : null
  if (opened === false) return 'upcoming'
  if (opened === true && end && hasClosed(end, today, stamp) === false) return 'open'
  return 'unknown'
}
