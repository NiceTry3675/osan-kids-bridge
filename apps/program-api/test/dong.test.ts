import { describe, expect, it } from 'vitest'
import { dongFromAddress } from '../src/geo/dong'

const none = { dong: null, outside_osan: false, matched: null }

describe('dongFromAddress', () => {
  it('걸친 법정동(궐동)이라도 확인된 도로명 주소면 행정동을 준다', () => {
    expect(dongFromAddress('경기도 오산시 청학로 80 (궐동)')).toEqual({ dong: '남촌동', outside_osan: false, matched: '청학로 80' })
    expect(dongFromAddress('경기도 오산시 청학로 80 (궐동) 복합청사 2층 오산시가족센터')).toMatchObject({ dong: '남촌동' })
  })

  it('걸친 법정동(오산동)의 확인된 주소', () => {
    expect(dongFromAddress('경기도 오산시 오산천로 271 (오산동)')).toEqual({ dong: '중앙동', outside_osan: false, matched: '오산천로 271' })
  })

  it('한 행정동에 속한 법정동은 법정동으로 판단한다', () => {
    expect(dongFromAddress('경기도 오산시 청학로 45 (청학동)')).toEqual({ dong: '남촌동', outside_osan: false, matched: '청학동' })
    expect(dongFromAddress('경기 오산시 서동로 74-33 (서동)')).toEqual({ dong: '초평동', outside_osan: false, matched: '서동' })
    expect(dongFromAddress('경기도 오산시 남부대로 486-10 (청호동)')).toMatchObject({ dong: '대원동', matched: '청호동' })
    expect(dongFromAddress('경기도 오산시 금암로 8-23 (금암동)')).toMatchObject({ dong: '신장동', matched: '금암동' })
  })

  it('괄호 안에 법정동과 건물명이 함께 있어도 찾는다', () => {
    expect(dongFromAddress('경기도 오산시 내삼미로 109 (내삼미동, 삼미마을)')).toEqual({ dong: '신장동', outside_osan: false, matched: '내삼미로 109' })
    expect(dongFromAddress('경기도 오산시 삼미로 34 (내삼미동, 오산대역세교자이)')).toMatchObject({ dong: '신장동', matched: '내삼미동' })
  })

  it('다른 행정동에 속한 소수 주소는 예외로 처리한다', () => {
    expect(dongFromAddress('경기도 오산시 장서로 6-2 (청학동)')).toMatchObject({ dong: '초평동', matched: '장서로 6-2' })
    expect(dongFromAddress('경기도 오산시 수청로 132-51 (내삼미동)')).toMatchObject({ dong: '세마동' })
    expect(dongFromAddress('경기도 오산시 수목원로 577-15 (세교동, 세마역 에듀파크)')).toMatchObject({ dong: '신장동' })
    expect(dongFromAddress('경기도 오산시 오산천로 9 (누읍동)')).toMatchObject({ dong: '남촌동' })
  })

  it('걸친 법정동만 있으면 추측하지 않는다', () => {
    expect(dongFromAddress('경기도 오산시 궐동로 23 (궐동)')).toEqual({ dong: null, outside_osan: false, matched: '궐동' })
    expect(dongFromAddress('경기도 오산시 경기대로 271 (오산동)')).toEqual({ dong: null, outside_osan: false, matched: '오산동' })
    expect(dongFromAddress('경기도 오산시 가장로 900 (가수동)')).toMatchObject({ dong: null, matched: '가수동' })
    // 번길과 본 도로, 부번을 구분한다
    expect(dongFromAddress('경기도 오산시 청학로5번길 6 (가수동)')).toMatchObject({ dong: '남촌동', matched: '청학로5번길 6' })
    expect(dongFromAddress('경기도 오산시 청학로 80-1 (궐동)')).toMatchObject({ dong: null, matched: '궐동' })
  })

  it('행정동 이름을 직접 쓰면 받는다 (분동된 이름은 묶는다)', () => {
    expect(dongFromAddress('남촌동 행정복지센터')).toEqual({ dong: '남촌동', outside_osan: false, matched: '남촌동' })
    expect(dongFromAddress('초평동행정복지센터')).toMatchObject({ dong: '초평동' })
    expect(dongFromAddress('대원1동 행정복지센터')).toMatchObject({ dong: '대원동', matched: '대원1동' })
    expect(dongFromAddress('오산시 신장2동')).toMatchObject({ dong: '신장동' })
    expect(dongFromAddress('가상 중앙동 도서관')).toMatchObject({ dong: '중앙동' })
    // 걸친 법정동 + 행정동 이름
    expect(dongFromAddress('중앙동 행정복지센터 (경기대로 307, 오산동)')).toMatchObject({ dong: '중앙동', matched: '중앙동' })
  })

  it('주소 없이 시설 이름만 있을 때', () => {
    expect(dongFromAddress('오산시가족센터 2층 교육실')).toMatchObject({ dong: '남촌동', matched: '오산시가족센터' })
    expect(dongFromAddress('오산오색문화체육센터')).toMatchObject({ dong: '중앙동' })
  })

  it('근거끼리 다르면 null', () => {
    expect(dongFromAddress('경기도 오산시 청학로 80 (궐동) 대원동 센터')).toEqual(none)
    expect(dongFromAddress('중앙동·대원동 주민')).toEqual(none)
  })

  it('오산시 밖 주소', () => {
    expect(dongFromAddress('경기도 화성시 동탄구 동탄대로 446 (청계동)')).toEqual({ dong: null, outside_osan: true, matched: '화성시' })
    expect(dongFromAddress('평택시 진위면 진위로 1')).toMatchObject({ outside_osan: true, matched: '평택시' })
    expect(dongFromAddress('서울특별시 강남구 테헤란로 1')).toMatchObject({ dong: null, outside_osan: true })
    expect(dongFromAddress('화성시가족센터 3층')).toMatchObject({ outside_osan: true })
    // 다른 시의 같은 이름 행정동도 오산으로 보지 않는다
    expect(dongFromAddress('경기도 수원시 팔달구 중앙동')).toMatchObject({ dong: null, outside_osan: true, matched: '수원시' })
    // 먼저 나온 시가 기준
    expect(dongFromAddress('경기도 오산시 청학로 80 (궐동), 화성시 경계')).toMatchObject({ dong: '남촌동', outside_osan: false })
  })

  it('시·군처럼 보이는 말은 주소로 보지 않는다', () => {
    expect(dongFromAddress('우천시 실내 체육관')).toEqual(none)
    expect(dongFromAddress('세교신도시 상가동')).toEqual(none)
    expect(dongFromAddress('경기도 오산시 서동탄로 1')).toEqual(none)
    expect(dongFromAddress('상대원동')).toEqual(none)
  })

  it('빈 값과 알 수 없는 문자열', () => {
    expect(dongFromAddress(null)).toEqual(none)
    expect(dongFromAddress(undefined)).toEqual(none)
    expect(dongFromAddress('')).toEqual(none)
    expect(dongFromAddress('   ')).toEqual(none)
    expect(dongFromAddress('어딘가 모르는 곳')).toEqual(none)
    expect(dongFromAddress('오산시청소년수련관')).toEqual(none)
  })
})
