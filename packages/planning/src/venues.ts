import type { Venue } from './types'

// 시연용 후보 장소. 이름과 대관 가능한 칸은 모두 지어낸 값입니다(실제 시설 정보 아님).
export const VENUES: Venue[] = [
  {
    id: 'v-jungang-library', name: '중앙동 도서관', dong: '중앙동',
    bookable: ['tue-evening', 'thu-evening', 'wed-afternoon', 'sat-morning', 'sat-afternoon', 'sun-afternoon'],
  },
  {
    id: 'v-jungang-hall', name: '중앙동 주민센터 강당', dong: '중앙동',
    bookable: ['mon-evening', 'wed-evening', 'fri-evening', 'sat-morning'],
  },
  {
    id: 'v-daewon-youth', name: '대원동 청소년문화의집', dong: '대원동',
    bookable: ['mon-afternoon', 'tue-afternoon', 'wed-afternoon', 'thu-afternoon', 'fri-afternoon', 'tue-evening', 'thu-evening', 'sat-afternoon', 'sun-afternoon'],
  },
  {
    id: 'v-namchon-library', name: '남촌동 작은도서관', dong: '남촌동',
    bookable: ['mon-evening', 'wed-evening', 'sat-morning', 'sat-afternoon'],
  },
  {
    id: 'v-sinjang-gym', name: '신장동 체육관', dong: '신장동',
    bookable: ['wed-evening', 'fri-evening', 'sat-morning', 'sat-afternoon', 'sun-morning', 'sun-afternoon'],
  },
  {
    id: 'v-sinjang-family', name: '신장동 가족센터', dong: '신장동',
    bookable: ['mon-evening', 'tue-evening', 'wed-evening', 'thu-evening', 'sat-afternoon'],
  },
  {
    id: 'v-sema-culture', name: '세마동 복합문화센터', dong: '세마동',
    bookable: ['mon-evening', 'tue-evening', 'wed-evening', 'thu-evening', 'fri-evening', 'sat-morning', 'sat-afternoon', 'sun-afternoon'],
  },
  {
    id: 'v-sema-school', name: '세마동 초등학교 돌봄교실', dong: '세마동',
    bookable: ['mon-afternoon', 'tue-afternoon', 'wed-afternoon', 'thu-afternoon', 'fri-afternoon'],
  },
  {
    id: 'v-chopyeong-center', name: '초평동 행정복지센터', dong: '초평동',
    bookable: ['tue-evening', 'thu-evening', 'sat-morning'],
  },
]

export const venueById = (id: string): Venue | undefined => VENUES.find((venue) => venue.id === id)
