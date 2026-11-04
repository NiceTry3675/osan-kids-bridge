import type { Venue } from './types'

// 시연용 후보 장소. 이름과 행정동은 오산시의 실제 공공시설이지만, 대관 가능한 칸은 지어낸 값입니다(실제 대관 정보 아님).
// 행정동은 화면이 쓰는 6개 동 기준입니다(대원동·신장동은 지금 1·2동으로 나뉘어 있음).
export const VENUES: Venue[] = [
  {
    id: 'v-jungang-center', name: '중앙동 행정복지센터', dong: '중앙동',
    bookable: ['mon-evening', 'wed-evening', 'fri-evening', 'sat-morning'],
  },
  {
    id: 'v-daewon-center', name: '대원1동 행정복지센터', dong: '대원동',
    bookable: ['tue-evening', 'thu-evening', 'sat-morning', 'sat-afternoon'],
  },
  {
    id: 'v-cheonghak-library', name: '청학도서관', dong: '남촌동',
    bookable: ['tue-evening', 'thu-evening', 'wed-afternoon', 'sat-morning', 'sat-afternoon', 'sun-afternoon'],
  },
  {
    id: 'v-namchon-center', name: '남촌동 행정복지센터', dong: '남촌동',
    bookable: ['mon-evening', 'wed-evening', 'sat-morning'],
  },
  {
    id: 'v-kkumbit-youth', name: '꿈빛나래청소년문화의집', dong: '신장동',
    bookable: ['mon-afternoon', 'tue-afternoon', 'wed-afternoon', 'thu-afternoon', 'fri-afternoon', 'tue-evening', 'thu-evening', 'sat-afternoon', 'sun-afternoon'],
  },
  {
    id: 'v-sinjang-center', name: '신장1동 행정복지센터', dong: '신장동',
    bookable: ['mon-evening', 'tue-evening', 'wed-evening', 'thu-evening', 'sat-afternoon'],
  },
  {
    id: 'v-kkumdure-library', name: '꿈두레도서관', dong: '세마동',
    bookable: ['mon-evening', 'tue-evening', 'wed-evening', 'thu-evening', 'fri-evening', 'sat-morning', 'sat-afternoon', 'sun-afternoon'],
  },
  {
    id: 'v-yangsan-library', name: '양산도서관', dong: '세마동',
    bookable: ['wed-evening', 'fri-evening', 'sat-morning', 'sat-afternoon', 'sun-morning', 'sun-afternoon'],
  },
  {
    id: 'v-chopyeong-center', name: '초평동 행정복지센터', dong: '초평동',
    bookable: ['tue-evening', 'thu-evening', 'sat-morning'],
  },
]

export const venueById = (id: string): Venue | undefined => VENUES.find((venue) => venue.id === id)
