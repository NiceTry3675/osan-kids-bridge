import { describe, expect, it } from 'vitest'
import { filterChips, formatSession, validateWindow } from './format'
import { parseSearchSession } from './searchSession'
import { emptyFilters } from './types'

describe('language and search continuity', () => {
  it('changes display text without changing the saved search values', () => {
    const filters = { ...emptyFilters(), child_grade: 3, available_windows: [{ day_of_week: 'sat' as const, start_time: '10:00', end_time: '12:00' }] }
    expect(filterChips(filters, 'vi').map((chip) => chip.label)).toEqual(['Tiểu học lớp 3', 'T7 10:00~12:00'])
    expect(filterChips(filters, 'zh').map((chip) => chip.label)).toEqual(['小学3年级', '周六 10:00~12:00'])
    expect(filters.child_grade).toBe(3)
    expect(filters.available_windows[0].day_of_week).toBe('sat')
  })

  it('localizes dates and validation errors', () => {
    const session = { id: 'one', date: '2026-10-17', start_time: '10:00', end_time: '12:00', place_name: null, dong: null, online: false }
    expect(formatSession(session, 'vi')).toBe('17/10 T7 · 10:00~12:00')
    expect(formatSession(session, 'zh')).toBe('10月17日 周六 · 10:00~12:00')
    expect(validateWindow({ day_of_week: 'sat', start_time: '12:00', end_time: '10:00' }, 'vi')).toBe('Giờ kết thúc phải sau giờ bắt đầu.')
  })

  it('restores valid session filters and rejects malformed storage', () => {
    const raw = JSON.stringify({ version: 1, hasApplied: true, filters: { child_grade: 3, child_age: 99, available_windows: [{ day_of_week: 'sat', start_time: '10:00', end_time: '12:00' }, { x: 'bad' }], interests: ['korean_study', 'other'], free_only: true } })
    expect(parseSearchSession(raw)).toEqual({ hasApplied: true, filters: { child_grade: 3, available_windows: [{ day_of_week: 'sat', start_time: '10:00', end_time: '12:00' }], interests: ['korean_study'], free_only: true } })
    expect(parseSearchSession('{bad json')).toEqual({ hasApplied: false, filters: emptyFilters() })
  })
})
