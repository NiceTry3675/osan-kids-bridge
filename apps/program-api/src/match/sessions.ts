import type { AvailableWindow, MatchStatus, ProgramRecord, ProgramSession } from '../types'
import { isValidDate, isValidTime, seoulNowMinutes, seoulToday, toMinutes, weekdayOf } from './dates'

export interface Clock {
  today: string
  minutes: number
}

export function clockOf(now: Date): Clock {
  return { today: seoulToday(now), minutes: seoulNowMinutes(now) }
}

export type ScheduledSession = ProgramSession & { date: string; start_time: string; end_time: string }

/** 날짜·시작·종료가 모두 확인된 회차. 종료가 시작보다 빠른(자정 넘김·오류) 회차는 미상으로 본다 */
export function isScheduled(session: ProgramSession): session is ScheduledSession {
  return isValidDate(session.date) && isValidTime(session.start_time) && isValidTime(session.end_time)
    && toMinutes(session.start_time) < toMinutes(session.end_time)
}

/** 이미 시작한 회차. 날짜가 없거나, 오늘인데 시작 시각이 없으면 지났다고 하지 않는다 */
export function hasStarted(session: ProgramSession, clock: Clock): boolean {
  if (!isValidDate(session.date)) return false
  if (session.date !== clock.today) return session.date < clock.today
  return isValidTime(session.start_time) && toMinutes(session.start_time) <= clock.minutes
}

/** 이미 끝난 회차. 오늘인데 종료 시각이 없으면 끝났다고 하지 않는다 */
export function hasFinished(session: ProgramSession, clock: Clock): boolean {
  if (!isValidDate(session.date)) return false
  if (session.date !== clock.today) return session.date < clock.today
  return isValidTime(session.end_time) && toMinutes(session.end_time) <= clock.minutes
}

/** 가능 시간 한 구간이 회차 전체를 포함하는가 (분 단위, 반올림 없음) */
/** 가능 시간 구간이 그 날짜에 해당하는가 (특정 날짜 또는 같은 요일) */
export function windowOnDate(window: AvailableWindow, date: string): boolean {
  return 'date' in window ? window.date === date : window.day_of_week === weekdayOf(date)
}

export function windowContains(window: AvailableWindow, session: ProgramSession): boolean {
  if (!isScheduled(session)) return false
  return windowOnDate(window, session.date) && toMinutes(window.start_time) <= toMinutes(session.start_time)
    && toMinutes(session.end_time) <= toMinutes(window.end_time)
}

const sortable = (session: ProgramSession) =>
  `${isValidDate(session.date) ? session.date : '9999-99-99'}T${isValidTime(session.start_time) ? session.start_time : '99:99'}`

/** 날짜·시작 시각 순. 미상은 뒤로 */
export function compareSessions(a: ProgramSession, b: ProgramSession): number {
  const [left, right] = [sortable(a), sortable(b)]
  return left === right ? 0 : left < right ? -1 : 1
}

/** 앞으로 시작할(또는 날짜 미상) 회차 */
export function remainingSessions(record: ProgramRecord, clock: Clock): ProgramSession[] {
  return record.sessions.filter((session) => !hasStarted(session, clock))
}

/** 원문 총 회차보다 적게 적힌 경우: 일정이 빠진 회차가 있다 */
function hasUnlistedSessions(record: ProgramRecord): boolean {
  return record.sessions.length === 0 || (record.session_count !== null && record.session_count > record.sessions.length)
}

/**
 * 운영 종료가 확인됐는가. 운영 기간 종료일이 지났거나,
 * 기간이 없고 모든 회차가 날짜가 있으며 끝났고 적히지 않은 회차도 없을 때만 true.
 */
export function hasOperationEnded(record: ProgramRecord, clock: Clock): boolean {
  if (isValidDate(record.period_end)) return record.period_end < clock.today
  if (!record.sessions.length) return false
  if (record.session_count !== null && record.session_count > record.sessions.length) return false
  return record.sessions.every((session) => hasFinished(session, clock))
}

/** 하루 한 번뿐인 행사 (총 1회, 운영 기간이 그날 하루) */
function isOneTimeEvent(record: ProgramRecord): boolean {
  const samePeriod = !record.period_start || !record.period_end || record.period_start === record.period_end
  return (record.session_count ?? record.sessions.length) === 1 && record.sessions.length <= 1 && samePeriod
}

/** 확인 항목이 중도 참여를 이미 묻는지 ('중도입국', '중도 (수강) 포기 시 환불', '중도 수강료', '중도·중복 장애'는 아니다) */
export const MID_JOIN_MENTION = /(?:중도|중간)\s*(?:에\s*)?(?:참여|참가|참석|출석|수강|합류|신청|등록|접수|들어|입반|입소|가입)(?!료|\s*(?:을\s*)?(?:포기|취소|중단|해지|환불|탈락))/

/** 이미 시작했고 중도 참여 허용이 명시되지 않은 전 회차 참석형(또는 참석 방식 미상) 과정. 한 번뿐인 행사·끝난 과정은 묻지 않는다 */
export function needsMidJoinCheck(record: ProgramRecord, clock: Clock): boolean {
  if (record.attendance_rule === 'choose_one' || record.mid_join_allowed === true) return false
  if (isOneTimeEvent(record) || hasOperationEnded(record, clock)) return false
  const periodStarted = isValidDate(record.period_start) && record.period_start < clock.today
  return periodStarted || record.sessions.some((session) => hasStarted(session, clock))
}

export interface TimeJudgement {
  status: MatchStatus
  /** status가 matched일 때만 채운다. 시간순 */
  matched: ProgramSession[]
}

const judged = (status: MatchStatus, matched: ProgramSession[] = []): TimeJudgement => ({ status, matched })

/** 명세 4장. 지난 회차는 일치 근거로 쓰지 않는다 */
export function judgeTime(record: ProgramRecord, windows: AvailableWindow[], clock: Clock): TimeJudgement {
  if (!windows.length) return judged('not_applied')

  const remaining = remainingSessions(record, clock).sort(compareSessions)
  const fits = (session: ProgramSession) => windows.some((window) => windowContains(window, session))
  // 날짜가 확인됐는데 그날에 해당하는 가능 시간 구간이 없으면 시각을 몰라도 확인된 불일치다
  const offDay = (session: ProgramSession) => !isScheduled(session) && isValidDate(session.date) && !windows.some((window) => windowOnDate(window, session.date!))
  const missingSchedule = hasUnlistedSessions(record) || remaining.some((session) => !isScheduled(session) && !offDay(session))

  // 참석 방식을 몰라도 원문의 총 회차가 모두 일정과 함께 적혔고 남은 회차가 하나도 맞지 않으면 확인된 불일치다
  if (record.attendance_rule === 'unknown') {
    const allListed = record.session_count !== null && record.session_count === record.sessions.length
    return judged(allListed && !missingSchedule && !remaining.some(fits) ? 'not_matched' : 'unknown')
  }

  if (record.attendance_rule === 'choose_one') {
    const matched = remaining.filter((session) => isScheduled(session) && fits(session))
    if (matched.length) return judged('matched', matched)
    return judged(missingSchedule ? 'unknown' : 'not_matched')
  }

  // all_sessions: 남은 필수 회차가 하나라도 확인된 불일치면 not_matched
  if (remaining.some((session) => (isScheduled(session) && !fits(session)) || offDay(session))) return judged('not_matched')
  if (missingSchedule) return judged('unknown')
  if (!remaining.length) return judged('not_matched')
  if (needsMidJoinCheck(record, clock)) return judged('unknown')
  return judged('matched', remaining)
}
