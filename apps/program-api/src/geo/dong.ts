import type { OsanDong } from '../types'

// 주소 → 오산시 행정동. 근거 자료 (2026-10-15 확인):
// - 행정동 8개·법정동 24개, 2024-01-01 대원동→대원1·2동, 신장동→신장1·2동 분동
//   https://ko.wikipedia.org/wiki/오산시의_행정_구역
//   https://github.com/vuski/admdongkor (README ver20240101)
// - 행정동별 도로명주소 목록 (도로명주소 DB 기반, 페이지 기준일 2026-10-15).
//   법정동 집합과 아래 주소별 표의 근거. 목록이 법정동 코드 순이라 법정동이 바뀌는 페이지로 집합을 확인했다
//   https://dorojuso.kr/경기도/오산시/{중앙동,대원1동,대원2동,남촌동,신장1동,신장2동,세마동,초평동}?page=N
// - 교차 확인용 (2024-05-01·2025-03-01 세교2지구 경계 조정 언급): https://namu.wiki/w/오산시/행정
// - 청학로 80 = 남촌동 복합청사(남촌동 행정복지센터·가족센터·청학도서관, 2026-02-27 개청)
//   https://daily.hankooki.com/news/articleView.html?idxno=1341725
//   https://www.vision21.kr/news/article.html?no=557400 (청학도서관 '청학로 80, 궐동')
// - 오산천로 271 = 오산오색문화체육센터 https://www.osansports.or.kr/fmcs/106
// OSAN_DONGS는 분동 전 6개 이름이라 대원1·2동은 대원동, 신장1·2동은 신장동으로 묶는다.

export interface DongLookup {
  /** 오산시 행정동. 오산 밖이거나 판단할 수 없으면 null */
  dong: OsanDong | null
  /** 주소가 오산시 밖이면 true */
  outside_osan: boolean
  /** 판단 근거가 된 법정동·도로명 등 */
  matched: string | null
}

/**
 * 법정동 → 행정동. 두 행정동에 걸치면 null (도로명 주소 표로만 판단).
 * 청학동·내삼미동·세교동·누읍동은 다른 행정동 쪽 주소가 1~2곳뿐이라 그 주소만 ADDRESSES에 예외로 둔다.
 */
const LEGAL_DONGS: Record<string, OsanDong | null> = {
  오산동: null, // 남촌동·대원1동·중앙동
  부산동: null, // 중앙동·대원2동
  원동: '대원동', // 대원1·2동
  궐동: null, // 남촌동·신장1·2동
  청학동: '남촌동', // 초평동 1곳 예외
  가장동: '남촌동',
  금암동: '신장동', // 신장1동
  수청동: '신장동', // 신장1·2동
  은계동: null, // 중앙동·신장2동
  내삼미동: '신장동', // 신장1·2동, 세마동 1곳 예외
  외삼미동: '세마동',
  양산동: '세마동',
  세교동: '세마동', // 신장1동 2곳 예외
  지곶동: '세마동',
  서랑동: '세마동',
  서동: '초평동',
  벌음동: '초평동',
  두곡동: '초평동',
  탑동: '초평동',
  누읍동: '초평동', // 남촌동 2곳 예외
  가수동: null, // 남촌동·초평동 (세교2지구 경계 조정 지역)
  고현동: '대원동', // 대원1·2동
  청호동: '대원동', // 대원2동
  갈곶동: null, // 남촌동·대원1·2동
}

/** 도로명 주소(도로명 + 건물번호)별로 확인한 행정동. 오산시 안에서 도로명은 하나뿐이다 */
const ADDRESSES: Record<string, OsanDong> = Object.fromEntries(([
  // 시설: 남촌동 복합청사, 오색문화체육센터 (dorojuso 남촌동 34쪽, 중앙동 12쪽)
  ['남촌동', ['청학로 80']],
  ['중앙동', ['오산천로 271']],
  // 걸친 법정동에서 목록으로 확인한 주소
  ['신장동', ['내삼미로 109', '수목원로 541', '수목원로 577-15']], // 내삼미동(신장2동 42쪽), 세교동(신장1동 38쪽)
  ['초평동', ['장서로 6-2']], // 청학동 (초평동 1쪽)
  ['세마동', ['수청로 132-51']], // 내삼미동 (세마동 1쪽)
  ['중앙동', ['현충로 95', '현충로 100', '현충로 102', '현충로 107-17', '장주기길 15-5']], // 은계동 (중앙동 74·75쪽)
  ['남촌동', [
    '오산천로 3-35', '오산천로 9', // 누읍동 (남촌동 91쪽)
    '성호대로 5', '가장로 761', '가장로 763', '가장로 769', '가장로 773', '청학로 5', '청학로 7', // 가수동 (남촌동 91쪽)
    '청학로5번길 6', '청학로5번길 7', '청학로5번길 11',
    '남부대로 222-14', '남부대로 222-22', '남부대로 222-45', '남부대로 222-91', '남부대로 222-93', // 갈곶동 (남촌동 92쪽)
    '남부대로 229', '남부대로 262-48', '오산천로 3-5', '오산천로 3-9',
  ]],
] as [OsanDong, string[]][]).flatMap(([dong, list]) => list.map((key) => [key, dong])))

/** 공고가 주소 없이 시설 이름만 줄 때. 위 ADDRESSES의 두 시설 */
const PLACES: [RegExp, OsanDong][] = [
  [/오산시\s*가족센터/, '남촌동'],
  [/오색문화체육센터/, '중앙동'],
]

const ADMIN_DONGS: Record<string, OsanDong> = {
  중앙동: '중앙동', 대원동: '대원동', 대원1동: '대원동', 대원2동: '대원동', 남촌동: '남촌동',
  신장동: '신장동', 신장1동: '신장동', 신장2동: '신장동', 세마동: '세마동', 초평동: '초평동',
}

const PROVINCE = '(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청[남북]|충[남북]|전라[남북]|전[남북]|경상[남북]|경[남북]|제주)[가-힣]*'
// 광역시·특별시는 어느 쪽이든 오산 밖이다
const METRO = /(?<![가-힣])(?:서울|부산|대구|인천|광주|대전|울산|세종)(?:특별시|광역시|특별자치시)?(?=\s|$)/
// 이웃 시는 시설 이름에 붙어 있어도 ('화성시가족센터') 오산 밖으로 본다
const NEIGHBORS = /(?<![가-힣])(화성시|평택시|수원시|용인시|안성시)/g
// '경기도 화성시' 또는 '화성시 동탄대로'처럼 주소 꼴일 때만 시·군으로 본다 ('우천시 실내' 같은 말은 제외)
const CITY_AFTER_PROVINCE = new RegExp(`(?<![가-힣])${PROVINCE}\\s+([가-힣]{2,4}[시군])(?![가-힣])`, 'g')
const CITY_BEFORE_PART = /(?<![가-힣])([가-힣]{2,4}[시군])\s+[가-힣\d]+(?:구|읍|면|동|로|길|리)(?![가-힣])/g
const ROAD_ADDRESS = /(?<![가-힣\d])([가-힣\d]+(?:로|길))\s*(\d+(?:-\d+)?)(?![\d번-])/g

const LEGAL_RE = new RegExp(`(?<![가-힣])(${Object.keys(LEGAL_DONGS).join('|')})(?![가-힣])`, 'g')
// '남촌동 행정복지센터', '남촌동행정복지센터' 모두 받는다. 도로명('…동로')은 제외
const ADMIN_RE = new RegExp(`(?<![가-힣])(${Object.keys(ADMIN_DONGS).join('|')})(?![로길])`, 'g')

const empty = (): DongLookup => ({ dong: null, outside_osan: false, matched: null })

/** 주소에서 처음 나오는 시·군. 없으면 null */
function firstCity(text: string): string | null {
  let best: { city: string; index: number } | null = null
  for (const re of [CITY_AFTER_PROVINCE, CITY_BEFORE_PART, NEIGHBORS]) {
    for (const match of text.matchAll(re)) {
      const city = match[1]
      if (city.endsWith('도시')) continue
      const index = (match.index ?? 0) + match[0].indexOf(city)
      if (!best || index < best.index) best = { city, index }
    }
  }
  return best?.city ?? null
}

/** 주소 문자열에서 오산시 행정동을 찾는다. 근거가 서로 다르거나 걸친 법정동이면 null */
export function dongFromAddress(address: string | null | undefined): DongLookup {
  const text = (address ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return empty()

  const city = firstCity(text)
  if (city && city !== '오산시') return { dong: null, outside_osan: true, matched: city }
  const metro = !city && text.match(METRO)
  if (metro) return { dong: null, outside_osan: true, matched: metro[0] }

  // 근거별 후보: 도로명 주소 > 법정동 > 시설 이름 > 행정동 이름
  const found: { dong: OsanDong | null; matched: string }[] = []
  const roads = [...text.matchAll(ROAD_ADDRESS)].map((match) => `${match[1]} ${match[2]}`).filter((key) => key in ADDRESSES)
  for (const key of roads) found.push({ dong: ADDRESSES[key], matched: key })
  if (!roads.length) {
    for (const [, legal] of text.matchAll(LEGAL_RE)) found.push({ dong: LEGAL_DONGS[legal], matched: legal })
  }
  for (const [re, dong] of PLACES) {
    const match = text.match(re)
    if (match) found.push({ dong, matched: match[0] })
  }
  for (const [, name] of text.matchAll(ADMIN_RE)) found.push({ dong: ADMIN_DONGS[name], matched: name })

  const known = found.filter((item) => item.dong !== null)
  const dongs = new Set(known.map((item) => item.dong))
  if (dongs.size === 1) return { dong: known[0].dong, outside_osan: false, matched: known[0].matched }
  if (dongs.size > 1) return empty() // 근거끼리 다르면 추측하지 않는다
  return { dong: null, outside_osan: false, matched: found[0]?.matched ?? null }
}
