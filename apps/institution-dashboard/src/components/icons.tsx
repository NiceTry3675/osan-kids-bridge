/** 보호자 웹과 같은 선 아이콘(packages/ui components.css의 .icon) */
const PATHS = {
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  back: <path d="M15 5 8 12l7 7" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  demand: <path d="M4 20V11M10 20V5M16 20v-6M21 20H3" />,
  recommend: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  questions: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M9.5 9.2a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5" /><path d="M12 15.2h.01" /></>,
  guide: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  programs: <><path d="M6 3.5h8.5L19 8v12.5H6Z" /><path d="M14 3.5V8h5M9 12h7M9 15.5h7" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: <><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.5M12 17.2h.01" /></>,
  sparkle: <><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5l-1.8-5.9L4.5 10.8 10.2 9Z" /><path d="M19 3v3M17.5 4.5h3" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>,
  external: <><path d="M14 4.5h5.5V10M19.5 4.5 11 13" /><path d="M18 14v5.5H4.5V6H10" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5.5-5 4 3.5 2.5-2 4.5 3.5" /></>,
}

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>
}
