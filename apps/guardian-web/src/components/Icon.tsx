import type { ReactNode } from 'react'

const PATHS = {
  chevron: <path d="m9 5 7 7-7 7" />,
  back: <path d="M15 5 8 12l7 7" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" /></>,
  // 상담 도우미가 쓴 도구: 공고 찾기·공고 읽기·조건 비교·답 없는 질문 표시·문의문 쓰기
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  doc: <><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></>,
  scale: <><path d="M12 4v16M8 20h8M5 7h14" /><path d="M2.5 13 5 7l2.5 6a2.5 2.5 0 0 1-5 0ZM16.5 13 19 7l2.5 6a2.5 2.5 0 0 1-5 0Z" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h12l-2.5 4.5L17 13H5" /></>,
  pen: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

/** 선 아이콘. 늘 글자와 함께 쓰므로 읽기 프로그램에는 숨깁니다. */
export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>
}
