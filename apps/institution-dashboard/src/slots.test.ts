import { afterEach, describe, expect, it } from 'vitest'
import { SLOTS, slotLabel, slotLongLabel, toSlots, weekdayOfDate, windowsToSlots, WEEKDAYS } from './lib/slots'

// @types/node 없이 시간대 환경 변수만 바꿉니다.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const originalTz = env.TZ
afterEach(() => { env.TZ = originalTz })

describe('21칸 격자', () => {
  it('7요일 × 오전·오후·저녁 21칸을 요일 순으로 둔다', () => {
    expect(SLOTS).toHaveLength(21)
    expect(new Set(SLOTS).size).toBe(21)
    expect(SLOTS.slice(0, 3)).toEqual(['mon-morning', 'mon-afternoon', 'mon-evening'])
    expect(slotLabel('sat-morning')).toBe('토 오전')
    expect(slotLongLabel('wed-evening')).toBe('수요일 저녁')
  })
})

describe('보호자 시간 범위를 21칸으로 바꾸기', () => {
  const sat = (start_time: string, end_time: string) => toSlots({ day_of_week: 'sat', start_time, end_time })

  it('30분 이상 겹치는 칸만 센다', () => {
    expect(sat('10:05', '12:10')).toEqual(['sat-morning'])
    expect(sat('11:00', '13:00')).toEqual(['sat-morning', 'sat-afternoon'])
    expect(sat('11:31', '13:00')).toEqual(['sat-afternoon'])
    expect(sat('11:30', '13:00')).toEqual(['sat-morning', 'sat-afternoon'])
    expect(sat('11:01', '12:59')).toEqual(['sat-morning', 'sat-afternoon'])
    expect(sat('17:00', '21:00')).toEqual(['sat-afternoon', 'sat-evening'])
    expect(sat('06:00', '22:00')).toEqual(['sat-morning', 'sat-afternoon', 'sat-evening'])
  })

  it('경계 시각 06·12·18·22시를 정확히 나눈다', () => {
    expect(sat('05:00', '06:29')).toEqual([])
    expect(sat('05:00', '06:30')).toEqual(['sat-morning'])
    expect(sat('21:00', '23:00')).toEqual(['sat-evening'])
    expect(sat('21:31', '23:30')).toEqual([])
    expect(sat('22:00', '23:30')).toEqual([])
    expect(sat('12:00', '13:00')).toEqual(['sat-afternoon'])
  })

  it('짧은 범위도 같은 기준(30분 이상 겹침)으로 센다', () => {
    expect(sat('10:00', '10:40')).toEqual(['sat-morning'])
    expect(sat('11:20', '12:00')).toEqual(['sat-morning'])
    expect(sat('10:00', '10:20')).toEqual([])
    expect(sat('11:40', '12:20')).toEqual([])
    expect(sat('05:30', '06:10')).toEqual([])
    expect(sat('22:10', '22:50')).toEqual([])
  })

  it('리뷰에서 나온 범위: 넓혀도 칸을 잃지 않고 퇴근 무렵 1시간도 1칸 이상이 된다', () => {
    expect(sat('11:20', '12:20')).toEqual(['sat-morning'])
    expect(sat('11:30', '12:30')).toEqual(['sat-morning', 'sat-afternoon'])
    expect(sat('17:30', '18:30')).toEqual(['sat-afternoon', 'sat-evening'])
  })

  it('범위를 넓히면 칸이 늘기만 한다(단조성)', () => {
    const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    for (let start = 300; start < 1380; start += 10) {
      for (let end = start + 10; end <= 1380; end += 10) {
        const inner = sat(time(start), time(end))
        for (const [wideStart, wideEnd] of [[start - 10, end], [start, end + 10], [start - 25, end + 35]]) {
          if (wideStart < 0 || wideEnd > 1439) continue
          const outer = sat(time(wideStart), time(wideEnd))
          for (const slot of inner) expect(outer, `${time(start)}~${time(end)} ⊂ ${time(wideStart)}~${time(wideEnd)}`).toContain(slot)
        }
      }
    }
  })

  it('06~22시 안의 60분 이상 범위는 항상 1칸 이상이 된다', () => {
    const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    for (let start = 360; start + 60 <= 1320; start += 5) {
      for (let end = start + 60; end <= 1320; end += 5) expect(sat(time(start), time(end)).length, `${time(start)}~${time(end)}`).toBeGreaterThan(0)
    }
  })

  it('잘못된 시간이나 거꾸로 된 범위는 빈 배열이다', () => {
    expect(sat('12:00', '12:00')).toEqual([])
    expect(sat('13:00', '12:00')).toEqual([])
    expect(sat('9:00', '12:00')).toEqual([])
    expect(sat('10:61', '12:00')).toEqual([])
  })

  it('날짜 범위는 그 날짜의 요일로 바꾼다', () => {
    expect(toSlots({ date: '2026-10-17', start_time: '10:00', end_time: '12:00' })).toEqual(['sat-morning'])
    expect(toSlots({ date: '2026-10-14', start_time: '18:30', end_time: '20:00' })).toEqual(['wed-evening'])
    expect(toSlots({ date: '2024-02-29', start_time: '13:00', end_time: '15:00' })).toEqual(['thu-afternoon'])
    expect(toSlots({ date: '2026-02-30', start_time: '10:00', end_time: '12:00' })).toEqual([])
    expect(toSlots({ date: '2026-13-01', start_time: '10:00', end_time: '12:00' })).toEqual([])
    expect(toSlots({ date: '2026/10/17', start_time: '10:00', end_time: '12:00' })).toEqual([])
  })

  it('날짜의 요일은 실행 환경의 시간대와 무관하다', () => {
    for (const tz of ['Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
      env.TZ = tz
      expect(weekdayOfDate('2026-10-17')).toBe('sat')
      expect(weekdayOfDate('2026-01-01')).toBe('thu')
    }
  })

  it('날짜 → 요일 계산이 UTC 달력과 일치한다', () => {
    for (let day = 0; day < 3000; day++) {
      const date = new Date(Date.UTC(2020, 0, 1 + day))
      const text = date.toISOString().slice(0, 10)
      expect(weekdayOfDate(text)).toBe(WEEKDAYS[(date.getUTCDay() + 6) % 7])
    }
  })

  it('여러 범위를 합치면 중복 없이 칸 순서대로 돌려준다', () => {
    expect(windowsToSlots([
      { day_of_week: 'sat', start_time: '10:00', end_time: '14:00' },
      { day_of_week: 'mon', start_time: '18:00', end_time: '20:00' },
      { date: '2026-10-17', start_time: '09:00', end_time: '11:00' },
    ])).toEqual(['mon-evening', 'sat-morning', 'sat-afternoon'])
  })
})
