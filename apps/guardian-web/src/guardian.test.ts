import { describe, expect, it } from 'vitest'
import { filterChips, serializeFilters, validateWindow } from './format'
import { getMockProgram, searchMockPrograms } from './mockPrograms'
import { emptyFilters } from './types'

describe('보호자 검색 입력', () => {
  it('입력하지 않은 조건은 요청에서 생략한다', () => {
    expect(serializeFilters(emptyFilters())).toEqual({})
  })

  it('분 단위 가능 시간을 반올림하지 않는다', () => {
    const filters = { ...emptyFilters(), child_grade: 2, available_windows: [{ day_of_week: 'sat' as const, start_time: '10:05', end_time: '12:10' }] }
    expect(serializeFilters(filters)).toEqual({ child_grade: 2, available_windows: [{ day_of_week: 'sat', start_time: '10:05', end_time: '12:10' }] })
  })

  it('끝이 시작보다 빠르거나 날짜가 잘못되면 적용하지 않는다', () => {
    expect(validateWindow({ day_of_week: 'sat', start_time: '12:10', end_time: '10:05' })).not.toBeNull()
    expect(validateWindow({ date: '2026-02-30', start_time: '10:05', end_time: '12:10' })).not.toBeNull()
    expect(validateWindow({ day_of_week: 'sat', start_time: '10:05', end_time: '12:10' })).toBeNull()
  })

  it('관심 분야와 동은 제외 필터가 아닌 먼저 보기 조건으로 표시한다', () => {
    const filters = { ...emptyFilters(), interests: ['experience_culture' as const], dong: '중앙동' }
    expect(filterChips(filters).map(({ label }) => label)).toEqual(['체험·문화 먼저', '중앙동 먼저'])
  })
})

describe('백엔드 연결 전 가상 공고 어댑터', () => {
  it('무입력 탐색에서 마감 공고를 제외하고 시간 확인 목록은 비운다', () => {
    const response = searchMockPrograms(emptyFilters())
    expect(response.results.length).toBeGreaterThan(0)
    expect(response.needs_confirmation).toEqual([])
    expect(response.results.every((program) => program.application_status !== 'closed' && program.time_match_status === 'not_applied')).toBe(true)
  })

  it('토요일 10:05~12:10에는 10:10~12:00 회차가 맞고 10:00 시작 회차는 제외한다', () => {
    const filters = { ...emptyFilters(), child_grade: 2, available_windows: [{ day_of_week: 'sat' as const, start_time: '10:05', end_time: '12:10' }] }
    const response = searchMockPrograms(filters)
    expect(response.results.find((program) => program.program_id === 'demo-craft')?.time_match_status).toBe('matched')
    expect(response.results.some((program) => program.program_id === 'demo-art')).toBe(false)
  })

  it('운영 시간이 미상인 공고는 확인 필요 목록으로 보내고, 마감 공고는 공유 주소에서 조회한다', () => {
    const filters = { ...emptyFilters(), child_grade: 4, available_windows: [{ day_of_week: 'sat' as const, start_time: '10:05', end_time: '12:10' }] }
    const response = searchMockPrograms(filters)
    expect(response.needs_confirmation.find((program) => program.program_id === 'demo-unknown-time')?.time_match_status).toBe('unknown')
    expect(getMockProgram('demo-closed', emptyFilters())?.application_status).toBe('closed')
    expect(getMockProgram('missing', emptyFilters())).toBeNull()
  })
})
