import { describe, expect, it } from 'vitest'
import { serializeFilters } from '../data/api'
import { posterThumbWidth } from '../data/agent'
import { getMockProgram, searchMockPrograms, windowContains } from '../data/mock'
import { emptyFilters } from '../data/types'
import { programText } from '../lib/content'
import { DONGS, dongOption, filterChips, removeChip, validateWindow } from '../lib/filters'
import { parseRoute, programPath } from '../lib/router'
import { parseFilters } from '../lib/session'

const saturday = { day_of_week: 'sat' as const, start_time: '10:05', end_time: '12:10' }

describe('검색 입력', () => {
  it('입력하지 않은 조건은 요청에서 빼고, 표시 언어만 붙인다', () => {
    expect(serializeFilters(emptyFilters())).toEqual({})
    expect(serializeFilters(emptyFilters(), 'vi')).toEqual({ display_language: 'vi' })
  })

  it('분 단위 시간을 반올림하지 않는다', () => {
    expect(serializeFilters({ ...emptyFilters(), child_grade: 2, available_windows: [saturday] })).toEqual({ child_grade: 2, available_windows: [saturday] })
  })

  it('끝이 시작보다 빠르거나 없는 날짜면 막는다', () => {
    expect(validateWindow({ ...saturday, start_time: '12:10', end_time: '10:05' })).not.toBeNull()
    expect(validateWindow({ date: '2026-02-30', start_time: '10:05', end_time: '12:10' })).not.toBeNull()
    expect(validateWindow(saturday)).toBeNull()
  })

  it('관심 분야와 동은 "먼저 보기"로 표시하고, 칩을 빼면 그 조건만 사라진다', () => {
    const filters = { ...emptyFilters(), interests: ['experience_culture' as const], dong: '중앙동', free_only: true }
    expect(filterChips(filters, 'ko-easy').map((chip) => chip.label)).toEqual(['체험·문화 먼저', '중앙동 먼저', '무료만'])
    expect(removeChip(filters, 'dong')).toEqual({ ...filters, dong: undefined })
  })

  it('동 이름은 화면 언어로 보이고(대시보드와 같은 표기), 서버에 보내는 값은 한국어 그대로다', () => {
    const filters = { ...emptyFilters(), dong: '신장동' }
    expect(filterChips(filters, 'vi').map((chip) => chip.label)).toEqual(['Ưu tiên Sinjang-dong (신장동)'])
    expect(filterChips(filters, 'zh').map((chip) => chip.label)).toEqual(['优先新场洞 (신장동)'])
    expect(serializeFilters(filters, 'zh')).toEqual({ dong: '신장동', display_language: 'zh' })
    // 고르는 칸에는 한국어 이름도 함께 적어 주소·간판과 맞춰 볼 수 있게
    expect(DONGS.map((dong) => dongOption(dong, 'zh'))).toEqual(['中央洞 (중앙동)', '大院洞 (대원동)', '南村洞 (남촌동)', '新场洞 (신장동)', '洗马洞 (세마동)', '草坪洞 (초평동)'])
    expect(dongOption('중앙동', 'vi')).toBe('Jungang-dong (중앙동)')
    expect(dongOption('중앙동', 'ko-easy')).toBe('중앙동')
    // 표에 없는 동(예전에 저장된 값)은 한국어 그대로
    expect(filterChips({ ...emptyFilters(), dong: '궐동' }, 'vi').map((chip) => chip.label)).toEqual(['Ưu tiên 궐동'])
  })
})

describe('포스터 썸네일 폭', () => {
  it('화면 폭의 세 배(3배율 휴대폰)를 덮는 가장 작은 서버 폭(128·256·384·512)으로 고르고, 512를 넘지 않는다', () => {
    expect(posterThumbWidth(40)).toBe(128)
    expect(posterThumbWidth(64)).toBe(256)
    expect(posterThumbWidth(72)).toBe(256)
    expect(posterThumbWidth(128)).toBe(384)
    expect(posterThumbWidth(142)).toBe(512)
    expect(posterThumbWidth(400)).toBe(512)
  })
})

describe('데모 어댑터의 판정(명세 4·5장)', () => {
  it('10:05~12:10은 10:10~12:00 회차를 포함하고 10:00~11:00은 포함하지 않는다', () => {
    const session = (start: string, end: string) => ({ id: 'x', date: '2026-10-17', start_time: start, end_time: end, place_name: null, dong: null, online: false })
    expect(windowContains(saturday, session('10:10', '12:00'))).toBe(true)
    expect(windowContains(saturday, session('10:00', '11:00'))).toBe(false)
  })

  it('무입력 탐색은 마감 공고를 빼고 시간 확인 목록을 비운다', () => {
    const response = searchMockPrograms(emptyFilters())
    expect(response.results.length).toBeGreaterThan(3)
    expect(response.needs_confirmation).toEqual([])
    expect(response.results.every((program) => program.application_status !== 'closed' && program.time_match_status === 'not_applied')).toBe(true)
  })

  it('전 회차 참석형은 한 회차라도 시간이 안 맞으면 뺀다', () => {
    const response = searchMockPrograms({ ...emptyFilters(), child_grade: 2, available_windows: [saturday] })
    expect(response.results.find((program) => program.program_id === 'demo-craft')?.time_match_status).toBe('matched')
    expect(response.results.some((program) => program.program_id === 'demo-art')).toBe(false)
  })

  it('운영 시간 미상은 확인 목록으로 보내고, 마감 공고는 공유 주소로만 연다', () => {
    const response = searchMockPrograms({ ...emptyFilters(), child_grade: 4, available_windows: [saturday] })
    expect(response.needs_confirmation.map((program) => program.program_id)).toContain('demo-career')
    expect(getMockProgram('demo-closed', emptyFilters())?.application_status).toBe('closed')
    expect(getMockProgram('missing', emptyFilters())).toBeNull()
  })

  it('무료만 보기는 비용 미상 공고를 뺀다', () => {
    const ids = searchMockPrograms({ ...emptyFilters(), free_only: true }).results.map((program) => program.program_id)
    expect(ids).not.toContain('demo-art')
    expect(ids).not.toContain('demo-choir')
  })

  it('다문화가족 대상 공고라도 별도 자격을 자동으로 맞음 처리하지 않는다', () => {
    const program = getMockProgram('demo-korean', { ...emptyFilters(), child_grade: 2 })
    expect(program?.age_grade_match_status).toBe('matched')
    expect(program?.eligibility_status).toBe('unknown')
  })
})

describe('공고 글의 언어', () => {
  it('검수본이 있는 언어는 그 글을, 없는 언어는 원문과 함께 "없음" 표시를 돌려준다', () => {
    const korean = getMockProgram('demo-korean', emptyFilters())!
    const art = getMockProgram('demo-art', emptyFilters())!
    expect(programText(korean, 'zh')).toMatchObject({ reviewed: true, missingTranslation: false, title: '周末韩语游戏班' })
    expect(programText(art, 'vi')).toMatchObject({ reviewed: false, missingTranslation: true, title: art.title })
    expect(programText(art, 'ko-easy').missingTranslation).toBe(false)
    // 자동 대조만 통과한 번역은 그 언어로 보여 주되 검수본이라고 하지 않습니다.
    const machine = { ...korean, summaries_by_language: { zh: { ...korean.summaries_by_language.zh!, status: 'machine_checked' as const } } }
    expect(programText(machine, 'zh')).toMatchObject({ reviewed: false, missingTranslation: false, title: '周末韩语游戏班' })
  })
})

describe('주소와 저장', () => {
  it('공유 주소에는 공고 번호만 들어간다', () => {
    expect(programPath('demo-korean')).toBe('/programs/demo-korean')
    expect(parseRoute('/programs/demo-korean')).toEqual({ name: 'detail', id: 'demo-korean' })
    expect(parseRoute('/anything')).toEqual({ name: 'browse' })
  })

  it('저장된 조건 중 올바른 값만 되살린다', () => {
    const raw = JSON.stringify({ child_grade: 3, child_age: 99, available_windows: [{ day_of_week: 'sat', start_time: '10:00', end_time: '12:00' }, { x: 'bad' }], interests: ['korean_study', 'other', 'korean_study'], free_only: true })
    expect(parseFilters(raw)).toEqual({ child_grade: 3, available_windows: [{ day_of_week: 'sat', start_time: '10:00', end_time: '12:00' }], interests: ['korean_study'], free_only: true })
    expect(parseFilters('{bad')).toEqual(emptyFilters())
  })
})
