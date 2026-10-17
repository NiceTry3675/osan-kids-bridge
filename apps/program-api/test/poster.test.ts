import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { locateQrBlob } from '../src/poster/qr'
import { checkTable } from '../src/poster/table'
import type { TableSegment } from '../src/poster/table'
import { diffTokens, extractTokens } from '../src/poster/tokens'
import { editPrompt, fixPrompt, outputSize } from '../src/poster/translate'
import { checkHangul, checkTokens } from '../src/poster/verify'

// 모델 호출은 쓰지 않는다. 결정적 검사만 네트워크 없이 확인한다.
vi.mock('../src/llm/gemini', () => ({ generateJson: vi.fn(), generateText: vi.fn(), modelName: () => 'test-model' }))

describe('바뀌면 안 되는 값 뽑기', () => {
  it('한국어 월/일과 베트남어 일/월을 같은 날로 본다', () => {
    const ko = extractTokens('10/19,10/26,11/2, 11/9', 'ko')
    const vi = extractTokens('19/10, 26/10, 02/11, 09/11', 'vi')
    expect(ko.dates).toEqual(['10-19', '10-26', '11-2', '11-9'])
    expect(diffTokens(ko, vi)).toEqual([])
  })

  it('베트남어에서 월/일 순서로 쓰면 다른 날이 되어 걸린다', () => {
    const diff = diffTokens(extractTokens('11/2', 'ko'), extractTokens('11/2', 'vi'))
    expect(diff).toEqual([{ kind: 'dates', missing: ['11-2'], extra: ['2-11'] }])
  })

  it('없는 달은 잘못된 날짜로 남긴다', () => {
    expect(extractTokens('10/19', 'vi').dates).toEqual(['invalid:10/19'])
  })

  it('연·월·일, 범위, 요일을 읽고 요일 약어는 숫자로 세지 않는다', () => {
    const ko = extractTokens(': 2026. 9. 28.(월) ~ 10. 14.(수)', 'ko')
    const vi = extractTokens(': 28/09/2026 (T2) ~ 14/10/2026 (T4)', 'vi')
    expect(ko).toMatchObject({ dates: ['10-14', '9-28'], numbers: ['2026'] })
    expect(diffTokens(ko, vi)).toEqual([])
  })

  it('중국어 年月日과 한국어 연월일을 맞춘다', () => {
    expect(diffTokens(extractTokens('2026.10.31.(토) 10:00~13:00', 'ko'), extractTokens('2026年10月31日（周六）10:00~13:00', 'zh'))).toEqual([])
  })

  it('전화번호·시각·인원·나이가 바뀌면 걸린다', () => {
    const ko = extractTokens('문의 031-376-3428 / 만 5세 ~ 6학년 / 각 반 6명 / 15:30 ~ 17:30', 'ko')
    const vi = extractTokens('Liên hệ 031-376-3482 / từ 5 tuổi ~ lớp 6 / mỗi lớp 8 em / 15:30 ~ 17:00', 'vi')
    expect(diffTokens(ko, vi)).toEqual([
      { kind: 'phones', missing: ['031-376-3428'], extra: ['031-376-3482'] },
      { kind: 'times', missing: ['17:30'], extra: ['17:00'] },
      { kind: 'numbers', missing: [], extra: ['8'] },
    ])
  })

  it('베트남어 천 단위 점은 날짜로 읽지 않는다', () => {
    expect(extractTokens('10.000 đồng', 'vi')).toMatchObject({ dates: [], numbers: ['0', '10'] })
  })
})

describe('번역표 코드 검사', () => {
  const ok: TableSegment = { ko: '문의 031-376-3428', action: 'translate', target: 'Liên hệ 031-376-3428' }

  it('맞는 표는 문제가 없다', () => {
    expect(checkTable([ok, { ko: '오산시 가족센터', action: 'keep', target: '오산시 가족센터' }], 'vi')).toEqual([])
  })

  it('번역에 남은 한국어와 바뀐 숫자를 문구 단위로 알린다', () => {
    const issues = checkTable([ok, { ko: '각 반 6명', action: 'translate', target: 'mỗi lớp 6 명' }, { ko: '10/19', action: 'translate', target: '10/19' }], 'vi')
    expect(issues.map((issue) => [issue.segment, issue.message])).toEqual([
      [1, '번역에 한국어가 남아 있음'],
      [2, '빠진 날짜 10-19 · 원래 없던 날짜 invalid:10/19'],
    ])
  })
})

describe('결과 포스터 검증 (판독문 대조)', () => {
  const table: TableSegment[] = [
    { ko: '문의 031-376-3428', action: 'translate', target: 'Liên hệ 031-376-3428' },
    { ko: '10/19, 10/26', action: 'translate', target: '19/10, 26/10' },
    { ko: '오산시 가족센터', action: 'keep', target: '오산시 가족센터' },
  ]

  it('판독문이 번역표와 같으면 문제가 없다', () => {
    const readback = 'Liên hệ 031-376-3428\n19/10, 26/10\n오산시\n가족센터'
    expect(checkTokens(table, readback, 'vi')).toEqual([])
    expect(checkHangul(table, readback)).toEqual([])
  })

  it('빠진 날짜·바뀐 전화번호·남은 한국어를 잡는다', () => {
    const readback = 'Liên hệ 031-376-3482\n19/10\n신청 기간\n오산시 가족센터'
    expect(checkTokens(table, readback, 'vi').map((issue) => issue.message)).toEqual([
      '빠진 전화번호 031-376-3428 · 원래 없던 전화번호 031-376-3482',
      '빠진 날짜 10-26',
    ])
    expect(checkHangul(table, readback)).toEqual([{ kind: 'hangul', message: '한국어가 남아 있음: 신청, 기간' }])
  })

  it('옮겨야 할 문구의 한국어가 남으면 막고, 로고를 비슷한 말로 잘못 읽은 것은 넘긴다', () => {
    const withLogo: TableSegment[] = [
      { ko: '고등학교 과정 신청', action: 'translate', target: 'Đăng ký khóa trung học phổ thông' },
      { ko: '성평등가족부 지원 | 경기도 오산시 위탁', action: 'keep', target: '성평등가족부 지원 | 경기도 오산시 위탁' },
    ]
    expect(checkHangul(withLogo, 'Đăng ký khóa trung học phổ thông\n여성가족부 지원')).toEqual([])
    expect(checkHangul(withLogo, '고등학교 과정 Đăng ký')).toEqual([{ kind: 'hangul', message: '한국어가 남아 있음: 고등학교, 과정' }])
    expect(checkHangul(withLogo, 'Đăng ký\n무료 간식 제공')).toEqual([{ kind: 'hangul', message: '한국어가 남아 있음: 무료, 간식, 제공' }])
  })
})

describe('이미지 편집 지시', () => {
  const table: TableSegment[] = [
    { ko: '문의', action: 'translate', target: 'Liên hệ' },
    { ko: '오산시 가족센터', action: 'keep', target: '오산시 가족센터' },
  ]

  it('바꿀 문구와 그대로 둘 로고를 나눠 적는다', () => {
    const prompt = editPrompt(table, 'vi')
    expect(prompt).toContain('- "문의" -> "Liên hệ"')
    expect(prompt).toContain('Keep these logo/brand texts exactly as they are: "오산시 가족센터"')
    expect(prompt).not.toContain('- "오산시 가족센터" ->')
  })

  it('다시 고칠 때는 지적받은 문제만 고치게 한다', () => {
    expect(fixPrompt(table, 'zh', [{ kind: 'tokens', message: '빠진 전화번호 031-376-3428' }])).toContain('- 빠진 전화번호 031-376-3428')
  })

  it('원본 비율에 가까운 크기를 고른다', async () => {
    const make = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#fff' } }).png().toBuffer()
    expect(await outputSize(await make(891, 1260))).toBe('1024x1536')
    expect(await outputSize(await make(1080, 1080))).toBe('1024x1024')
    expect(await outputSize(await make(1600, 900))).toBe('1536x1024')
  })
})

describe('번역본의 QR 자리 찾기', () => {
  it('기대 위치 둘레에서 가장 큰 검은 무늬 덩어리를 QR로 본다', () => {
    const width = 200
    const height = 200
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    const paint = (x0: number, y0: number, size: number, step: number) => {
      for (let y = y0; y < y0 + size; y += 1) {
        for (let x = x0; x < x0 + size; x += 1) {
          if ((Math.floor((x - x0) / step) + Math.floor((y - y0) / step)) % 2) continue
          const i = (y * width + x) * 4
          data[i] = data[i + 1] = data[i + 2] = 0
        }
      }
    }
    paint(120, 110, 50, 3) // QR처럼 촘촘한 무늬
    paint(20, 20, 8, 8) // 작은 글자 조각
    const box = locateQrBlob({ data, width, height }, { x: 110, y: 100, width: 50, height: 50 })
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(118)
    expect(box!.width).toBeGreaterThanOrEqual(45)
  })

  it('정사각형이 아닌 덩어리는 QR로 보지 않는다', () => {
    const width = 100
    const height = 100
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let y = 40; y < 50; y += 1) for (let x = 10; x < 90; x += 1) { const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0 }
    expect(locateQrBlob({ data, width, height }, { x: 30, y: 30, width: 40, height: 40 })).toBeNull()
  })
})
