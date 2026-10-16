import type { Weekday } from '../types'

// 모든 날짜·시각은 Asia/Seoul. 한국은 일광절약시간이 없어 UTC+9로 고정한다.
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export const WEEKDAY_CODES: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function seoulIso(now: Date): string {
  return new Date(now.getTime() + SEOUL_OFFSET_MS).toISOString()
}

/** 서울 기준 오늘 (YYYY-MM-DD) */
export function seoulToday(now: Date): string {
  return seoulIso(now).slice(0, 10)
}

/** 서울 기준 현재 시각 (HH:MM, 초는 버림) */
export function seoulNowTime(now: Date): string {
  return seoulIso(now).slice(11, 16)
}

/** 서울 기준 자정부터 지난 분 */
export function seoulNowMinutes(now: Date): number {
  return toMinutes(seoulNowTime(now))
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** HH:MM → 분. isValidTime을 통과한 값만 넘긴다 */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

export interface DateTimeValue {
  date: string
  /** 원문에 시각이 없으면 null (임의로 만들지 않는다) */
  time: string | null
}

/** 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM'. 형식이 틀리면 null */
export function parseDateTime(value: string): DateTimeValue | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/)
  if (!match || !isValidDate(match[1])) return null
  if (match[2] !== undefined && !isValidTime(match[2])) return null
  return { date: match[1], time: match[2] ?? null }
}

/** 시간대가 붙은 ISO 시각은 서울 날짜로, 그 밖에는 앞의 날짜 부분만 쓴다 */
export function seoulDateOf(value: string | null): string | null {
  if (!value) return null
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value) && value.includes('T')) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : seoulToday(parsed)
  }
  const date = value.slice(0, 10)
  return isValidDate(date) ? date : null
}

/** 하루 전 날짜 (YYYY-MM-DD) */
export function previousDate(date: string): string {
  const previous = new Date(`${date}T00:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return previous.toISOString().slice(0, 10)
}

/** 마감 시각이 이보다 이르면(새벽) 그 전날이 신청할 수 있는 마지막 날이다 ('10-17 00:00까지', '10-30 01:00까지') */
const EARLY_CUTOFF = '06:00'

/** 신청할 수 있는 마지막 날 (YYYY-MM-DD). 마감이 새벽이면 전날 */
export function lastApplicationDay(value: string | null): string | null {
  const date = seoulDateOf(value)
  const time = value ? parseDateTime(value)?.time ?? null : null
  return date && time && time < EARLY_CUTOFF ? previousDate(date) : date
}

/** '10월 17일(토)' */
export function koreanDateLabel(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${month}월 ${day}일(${KOREAN_WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]})`
}
