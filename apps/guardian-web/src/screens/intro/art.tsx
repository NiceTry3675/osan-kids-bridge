import type { ReactNode } from 'react'
import type { Interest } from '../../data/types'
import { INTEREST_VISUAL } from '../../lib/content'

/**
 * 첫 화면과 홈이 함께 쓰는 그림. 모두 장식이라 읽기 프로그램에는 숨기고, 뜻은 늘 옆의 글자로 적습니다.
 * 세 가지 가치(포스터를 내 언어로 · 우리 아이에게 맞는지 · 기관에 물을 한국어 문장)는
 * 첫 화면의 줄과 홈의 포스터 띠·맞게 보기·AI 상담에 같은 아이콘으로 이어집니다.
 */
const VALUE_PATHS = {
  // 포스터 + 'A': 포스터를 내 언어로
  poster: <><rect x="3.5" y="3" width="10.5" height="14" rx="2" /><path d="M6.5 7.5h4.5M6.5 10.5h2.5" /><path d="m13.5 21 3.5-8.5 3.5 8.5M14.8 18h4.4" /></>,
  // 아이 + 확인: 우리 아이에게 맞는지
  fit: <><circle cx="9.5" cy="7.5" r="3.5" /><path d="M3.5 20c0-3.6 2.7-6.2 6-6.2 1.5 0 2.9.5 4 1.4" /><path d="m15 17.5 2.2 2.2 4.3-4.7" /></>,
  // 말풍선: 기관에 물을 문장
  ask: <><path d="M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3.5v-3.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><path d="M7.5 9h9M7.5 12.2h5.5" /></>,
  // 반짝임: AI가 한 일
  spark: <><path d="M10.5 3.5c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7Z" /><path d="M18.5 15.5c.3 1.9 1 2.6 2.9 2.9-1.9.3-2.6 1-2.9 2.9-.3-1.9-1-2.6-2.9-2.9 1.9-.3 2.6-1 2.9-2.9Z" /></>,
} satisfies Record<string, ReactNode>

export type ValueName = keyof typeof VALUE_PATHS

export function ValueIcon({ name }: { name: ValueName }) {
  return <svg className="icon value-icon" viewBox="0 0 24 24" aria-hidden="true">{VALUE_PATHS[name]}</svg>
}

/** 분야 그림(lib/content.ts의 경로). 분야 이름은 늘 옆에 글자로 적습니다. */
export function InterestIcon({ interest }: { interest: Interest }) {
  return <svg className="icon interest-icon" viewBox="0 0 24 24" aria-hidden="true">{INTEREST_VISUAL[interest].icon.map((d) => <path key={d} d={d} />)}</svg>
}

/** 포스터 카드 한 장. 머리 띠 색과 가운데 글자만 다릅니다. */
function PosterCard({ band, children }: { band: string; children: ReactNode }) {
  return (
    <>
      <rect x="-42" y="-52" width="84" height="104" rx="11" fill="#fff" stroke="#EAD8C6" strokeWidth="1.5" />
      <path d="M-42 -41a11 11 0 0 1 11-11h62a11 11 0 0 1 11 11v7h-84Z" fill={band} />
      {children}
      <rect x="-26" y="28" width="52" height="5" rx="2.5" fill="#EFE3D5" />
      <rect x="-26" y="38" width="32" height="5" rx="2.5" fill="#EFE3D5" />
    </>
  )
}

/** 01 첫 화면 그림: 한국어 포스터의 '가'가 'A·中' 포스터로 바뀝니다. */
export function IntroArt() {
  return (
    <div className="intro-art" aria-hidden="true">
      <svg viewBox="0 0 340 132" preserveAspectRatio="xMidYMid meet">
        <circle cx="30" cy="120" r="48" fill="#F9D6C6" />
        <circle cx="318" cy="10" r="40" fill="#E3F0E8" />
        <circle cx="290" cy="116" r="5" fill="#F3B9A4" />
        <circle cx="54" cy="22" r="4" fill="#BFDCCB" />

        <g transform="translate(100 68) rotate(-7)">
          <PosterCard band="#1F7A5C">
            <text className="art-glyph" x="0" y="15" textAnchor="middle" fontSize="40" fill="#2B2420">가</text>
          </PosterCard>
        </g>

        <g className="art-arrow">
          <path d="M150 80c8-20 24-26 38-18" fill="none" stroke="#E07A5F" strokeWidth="4.5" strokeLinecap="round" />
          <path d="m180 54 9 8-11 4" fill="none" stroke="#E07A5F" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M165 31c.6 4 2 5.4 6 6-4 .6-5.4 2-6 6-.6-4-2-5.4-6-6 4-.6 5.4-2 6-6Z" fill="#E07A5F" />
        </g>

        <g transform="translate(240 64) rotate(6)">
          <g className="art-new">
            <PosterCard band="#E07A5F">
              <text className="art-glyph" x="0" y="13" textAnchor="middle" fontSize="30" fill="#1F7A5C">
                A<tspan dx="3" fill="#E07A5F">·</tspan><tspan dx="3" lang="zh">中</tspan>
              </text>
            </PosterCard>
          </g>
        </g>
      </svg>
    </div>
  )
}
