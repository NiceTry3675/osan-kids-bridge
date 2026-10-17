/** 보호자 웹과 같은 선 아이콘(packages/ui components.css의 .icon) */
const PATHS = {
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  back: <path d="M15 5 8 12l7 7" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  demand: <path d="M4 20V11M10 20V5M16 20v-6M21 20H3" />,
  recommend: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  questions: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M9.5 9.2a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5" /><path d="M12 15.2h.01" /></>,
  guide: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
}

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>
}
