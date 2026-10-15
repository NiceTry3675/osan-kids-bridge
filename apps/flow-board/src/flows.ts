import type { Step } from './drive'
import type { FrameSetup } from './frame'

export type AppName = 'guardian' | 'dashboard'
/** 페이지: 주소가 바뀌는 화면 · 시트: 페이지 위에 열고 닫는 화면 · 상태: 같은 화면의 다른 모습 */
export type Kind = 'page' | 'sheet' | 'state'

export interface Screen {
  id: string
  title: string
  kind: Kind
  /** 종류 옆에 붙는 짧은 설명(주소, ‘처음 1회’ 등) */
  where: string
  notes: string[]
  setup: FrameSetup
  steps?: Step[]
}

export interface Flow {
  app: AppName
  label: string
  summary: string
  screens: Screen[]
}

const INTRO_SEEN = { 'osan-guardian-intro-seen': '1' }
/** 03에서 넣는 조건과 같은 값: 2학년, 매주 토 10:05~12:10, 체험·문화 먼저 */
const SEARCH = {
  'guardian-search-v2': JSON.stringify({
    child_grade: 2,
    available_windows: [{ day_of_week: 'sat', start_time: '10:05', end_time: '12:10' }],
    interests: ['experience_culture'],
    free_only: false,
  }),
}
const OPEN_FROM_LIST: Step = { click: 'a.item', text: '토요 만들기 체험' }

export const FLOWS: Flow[] = [
  {
    app: 'guardian',
    label: '보호자',
    summary: '모바일 웹 · 페이지는 홈과 상세 두 개, 나머지는 그 위에 뜨는 시트',
    screens: [
      {
        id: 'g1', title: '첫 화면 · 언어 고르기', kind: 'page', where: '처음 1회', setup: {},
        notes: ['한국어를 읽기 전에 언어부터 고름', '공유 링크로 오면 건너뛰고 바로 상세', '‘다른 언어’는 이름으로 찾고 미제공 언어도 알림'],
      },
      {
        id: 'g2', title: '홈 · 둘러보기', kind: 'page', where: '/', setup: { local: INTRO_SEEN },
        notes: ['조건 없이 모든 공고를 바로 봄', '분야 타일을 누르면 그 분야 먼저', '상세에서 돌아오면 보던 위치 그대로'],
      },
      {
        id: 'g3', title: '조건 넣기', kind: 'sheet', where: '홈 위', setup: { local: INTRO_SEEN },
        steps: [{ click: 'button', text: '우리 아이에게 맞게 보기' }],
        notes: ['아이·시간·먼저 볼 분야·무료를 한 시트에', '모두 선택이고 10:05처럼 분 단위 그대로', '결과의 ‘조건 바꾸기’도 같은 시트'],
      },
      {
        id: 'g4', title: '결과', kind: 'state', where: '홈과 같은 페이지', setup: { local: INTRO_SEEN, session: SEARCH },
        notes: ['조건 칩은 하나씩 뺄 수 있음', '시간을 알 수 없는 공고는 따로 모음', '조건은 이 탭에만 기억하고 링크에는 넣지 않음'],
      },
      {
        id: 'g5', title: '프로그램 상세', kind: 'page', where: '/programs/id', setup: { local: INTRO_SEEN, session: SEARCH },
        steps: [OPEN_FROM_LIST],
        notes: ['목록에서 오면 넣은 시간과 회차를 다시 비교', '노란 형광펜은 기관에 확인할 점에만', '하단에 늘 ‘물어보기 · 신청하러 가기’'],
      },
      {
        id: 'g6', title: '신청 · 물어보기', kind: 'sheet', where: '상세 위', setup: { local: INTRO_SEEN, session: SEARCH },
        steps: [OPEN_FROM_LIST, { click: 'button', text: '신청하러 가기' }],
        notes: ['시트 하나에 탭 두 개', '밖으로 나가기 전에 무엇이 열리는지 안내', '신청 완료로 표시하지 않음'],
      },
      {
        id: 'g7', title: '내 언어 안내가 없을 때', kind: 'state', where: '상세', setup: { local: { ...INTRO_SEEN, 'osan-guardian-locale': 'vi' }, hash: '#/programs/demo-art' },
        notes: ['없다는 사실을 먼저 알리고 원문은 접어 둠', '날짜·비용·신청 상태는 그 언어로', '공유 링크로 열어 조건 비교는 하지 않음'],
      },
    ],
  },
  {
    app: 'dashboard',
    label: '운영기관',
    summary: '대시보드 · 수요 현황, 일정·장소 추천, 데이터 안내 세 탭',
    screens: [
      {
        id: 'd1', title: '수요 현황', kind: 'page', where: '첫 탭', setup: {},
        notes: ['몇 가정이 답했고 언제 몰리는지 한 문장으로', '요일×시간대 칸마다 숫자를 함께 적음', '아래로 동별·화면 언어·한국어 수준'],
      },
      {
        id: 'd2', title: '조건 고르기', kind: 'sheet', where: '수요 현황 위', setup: {},
        steps: [{ click: '.filter-chip' }],
        notes: ['동·학년·분야·화면 언어로 좁혀 보기', '출신국은 묻지 않고 화면 언어만 씀'],
      },
      {
        id: 'd3', title: '작은 집계 가림', kind: 'state', where: '수요 현황', setup: {},
        steps: [{ click: '.filter-chip' }, { click: '.check-chip', text: '초평동' }, { click: '.filter-actions .primary' }],
        notes: ['초평동만 보면 1~4가정 칸이 생겨 가림', '전체가 5가정 미만이면 결과를 보여 주지 않음'],
      },
      {
        id: 'd4', title: '추천 조건', kind: 'page', where: '추천 탭', setup: {},
        steps: [{ click: '#tab-recommend' }],
        notes: ['분야·학년·반 수·정원을 한 화면에', '후보 장소와 기존 계획은 펼쳐서 조정'],
      },
      {
        id: 'd5', title: '추천 결과', kind: 'state', where: '추천 탭', setup: {},
        steps: [{ click: '#tab-recommend' }, { click: 'button', text: '추천 보기' }],
        notes: ['1~3안과 닿는 가정 수·비율', '반마다 새로 더하는 가정·예상 신청·정원 초과'],
      },
      {
        id: 'd6', title: '추천 자세히', kind: 'sheet', where: '추천 결과 위', setup: {},
        steps: [{ click: '#tab-recommend' }, { click: 'button', text: '추천 보기' }, { click: 'button', text: '자세히 보기' }],
        notes: ['시간표에 추천 칸과 기존 칸을 겹쳐 봄', '언어·한국어 수준으로 통역·수업 준비', '추천 이유는 규칙으로 만든 문장'],
      },
      {
        id: 'd7', title: '데이터 안내', kind: 'page', where: '안내 탭', setup: {},
        steps: [{ click: '#tab-guide' }],
        notes: ['쓰는 항목과 모으지 않는 항목', '5가정 미만 칸을 가리는 기준', '실제 응답을 잇는 다음 단계'],
      },
    ],
  },
]

export const KIND_LABEL: Record<Kind, string> = { page: '페이지', sheet: '시트', state: '상태' }
