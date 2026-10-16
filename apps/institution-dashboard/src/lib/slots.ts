import { DAY_PART_HOURS, MIN_SLOT_OVERLAP_MINUTES } from '../data/assumptions'
import type { DayPart, GuardianAvailableWindow, SlotKey, Weekday } from '../types'

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const DAY_PARTS: DayPart[] = ['morning', 'afternoon', 'evening']
/** 21칸. 요일 순서 안에서 오전·오후·저녁 순 */
export const SLOTS: SlotKey[] = WEEKDAYS.flatMap((day) => DAY_PARTS.map((part) => `${day}-${part}` as SlotKey))
export const SLOT_INDEX: Record<SlotKey, number> = Object.fromEntries(SLOTS.map((slot, index) => [slot, index])) as Record<SlotKey, number>

export const WEEKDAY_LABELS: Record<Weekday, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' }
export const DAY_PART_LABELS: Record<DayPart, string> = { morning: '오전', afternoon: '오후', evening: '저녁' }

export const slotParts = (slot: SlotKey): [Weekday, DayPart] => slot.split('-') as [Weekday, DayPart]
/** "토 오전" */
export const slotLabel = (slot: SlotKey): string => { const [day, part] = slotParts(slot); return `${WEEKDAY_LABELS[day]} ${DAY_PART_LABELS[part]}` }
/** "토요일 오전" */
export const slotLongLabel = (slot: SlotKey): string => { const [day, part] = slotParts(slot); return `${WEEKDAY_LABELS[day]}요일 ${DAY_PART_LABELS[part]}` }
export const sortSlots = (slots: Iterable<SlotKey>): SlotKey[] => [...new Set(slots)].sort((a, b) => SLOT_INDEX[a] - SLOT_INDEX[b])

function toMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null
  return hours * 60 + minutes
}

/** YYYY-MM-DD를 달력 날짜 그대로 읽어 요일을 구합니다. Date 객체를 쓰지 않아 시간대와 무관합니다. */
export function weekdayOfDate(date: string): Weekday | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) return null
  // Sakamoto 방식: 0=일요일
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const y = month < 3 ? year - 1 : year
  const sundayFirst = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + offsets[month - 1] + day) % 7
  return WEEKDAYS[(sundayFirst + 6) % 7]
}

/**
 * 보호자 웹의 자유 시간 범위 하나를 21칸으로 바꿉니다.
 * 칸(오전·오후·저녁)과 30분 이상 겹치면 가능으로 셉니다. 모든 범위에 같은 기준을 써서 범위를 넓히면 칸이 늘기만 하고 줄지 않습니다.
 * 06~22시 안의 60분 이상 범위는 항상 1칸 이상이 됩니다. 30분보다 짧거나 대부분 06~22시 밖인 범위는 빈 배열이 될 수 있어,
 * 실제 연결 때는 보호자 웹 입력 단계에서 안내하거나 서버가 저장 전에 걸러야 합니다.
 * 형식이 잘못됐거나 끝이 시작보다 빠르면 빈 배열을 돌려줍니다.
 */
export function toSlots(window: GuardianAvailableWindow): SlotKey[] {
  const day = 'date' in window ? weekdayOfDate(window.date) : window.day_of_week
  const start = toMinutes(window.start_time)
  const end = toMinutes(window.end_time)
  if (!day || !WEEKDAYS.includes(day) || start === null || end === null || end <= start) return []
  return DAY_PARTS.filter((part) => {
    const [partStart, partEnd] = DAY_PART_HOURS[part].map((hour) => hour * 60)
    return Math.min(end, partEnd) - Math.max(start, partStart) >= MIN_SLOT_OVERLAP_MINUTES
  }).map((part) => `${day}-${part}` as SlotKey)
}

/** 여러 시간 범위를 합쳐 중복 없는 칸 목록으로 바꿉니다(실제 연결 시 서버 저장 전에 재사용). */
export const windowsToSlots = (windows: GuardianAvailableWindow[]): SlotKey[] => sortSlots(windows.flatMap(toSlots))
