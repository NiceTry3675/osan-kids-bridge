import { useEffect, useState } from 'react'

/**
 * 의존성 없는 작은 라우터.
 * - '/'            탐색 목록
 * - '/programs/:id' 공고 상세(공유 링크). 주소에는 검색 조건을 넣지 않습니다.
 * 목록의 스크롤 위치는 history.state에 저장해 뒤로 가기로 돌아오면 같은 자리로 복원합니다.
 */
export type Route = { name: 'browse' } | { name: 'detail'; id: string }

export interface HistoryState {
  /** 목록에서 눌러 들어온 상세인지(조건 적용 상세 판정에 씀) */
  fromList?: boolean
  /** 이 항목을 떠날 때의 스크롤 위치 */
  scrollY?: number
}

export function parseRoute(pathname: string): Route {
  const match = pathname.match(/^\/programs\/([^/]+)\/?$/)
  if (match) {
    try { return { name: 'detail', id: decodeURIComponent(match[1]) } } catch { return { name: 'browse' } }
  }
  return { name: 'browse' }
}

export const programPath = (id: string) => `/programs/${encodeURIComponent(id)}`

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function currentState(): HistoryState {
  return (window.history.state as HistoryState | null) ?? {}
}

function rememberScroll() {
  window.history.replaceState({ ...currentState(), scrollY: window.scrollY }, '')
}

export function navigate(path: string, state: HistoryState = {}, options: { replace?: boolean } = {}) {
  rememberScroll()
  if (options.replace) window.history.replaceState(state, '', path)
  else window.history.pushState(state, '', path)
  notify()
  window.scrollTo(0, 0)
}

/** 목록으로 돌아가기: 목록에서 들어왔다면 뒤로 가기로 원래 위치를 살립니다. */
export function backToList() {
  if (currentState().fromList) window.history.back()
  else navigate('/', {}, { replace: false })
}

export function useRoute(): [Route, HistoryState] {
  const [snapshot, setSnapshot] = useState(() => ({ route: parseRoute(window.location.pathname), state: currentState() }))
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    const update = () => setSnapshot({ route: parseRoute(window.location.pathname), state: currentState() })
    listeners.add(update)
    window.addEventListener('popstate', update)
    return () => { listeners.delete(update); window.removeEventListener('popstate', update) }
  }, [])
  return [snapshot.route, snapshot.state]
}

/** 화면 내용이 그려진 뒤 저장된 스크롤 위치로 돌아갑니다. ready가 true가 될 때 한 번만 실행됩니다. */
export function useRestoreScroll(ready: boolean, scrollY: number | undefined) {
  useEffect(() => {
    if (!ready || scrollY === undefined) return
    const frame = requestAnimationFrame(() => window.scrollTo(0, scrollY))
    return () => cancelAnimationFrame(frame)
  }, [ready, scrollY])
}
