import { useEffect, useState } from 'react'
import { MissingApiError, searchPrograms } from '../../data/api'
import type { Locale, SearchFilters, SearchResponse } from '../../data/types'

export type SearchState =
  | { status: 'loading' }
  | { status: 'error'; missingApi: boolean }
  | { status: 'ready'; data: SearchResponse }

/** 같은 조건·언어로 돌아왔을 때 바로 그리기 위한 마지막 결과(새로고침하면 사라짐) */
const cache = new Map<string, SearchResponse>()

/**
 * 조건·언어가 바뀔 때마다 검색합니다. 이미 결과가 있으면 새 결과가 올 때까지 그대로 두어
 * 언어를 바꿔도 읽던 자리가 흔들리지 않게 합니다.
 */
export function useSearch(filters: SearchFilters, locale: Locale): [SearchState, () => void] {
  const key = JSON.stringify([filters, locale])
  const [state, setState] = useState<SearchState>(() => {
    const cached = cache.get(key)
    return cached ? { status: 'ready', data: cached } : { status: 'loading' }
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const cached = cache.get(key)
    setState((previous) => (cached ? { status: 'ready', data: cached } : previous.status === 'ready' ? previous : { status: 'loading' }))
    searchPrograms(filters, locale, controller.signal)
      .then((data) => { cache.set(key, data); setState({ status: 'ready', data }) })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', missingApi: error instanceof MissingApiError })
      })
    return () => controller.abort()
    // key가 filters·locale을 모두 담고 있습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  return [state, () => setAttempt((value) => value + 1)]
}
