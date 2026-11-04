import { useEffect, useState } from 'react'
import { getProgram, listedProgram, MissingApiError } from '../../data/api'
import type { Locale, Program, SearchFilters } from '../../data/types'

export type ProgramState =
  | { status: 'loading' }
  | { status: 'error'; missingApi: boolean }
  | { status: 'missing' }
  | { status: 'ready'; program: Program }

/** 방금 찾은 목록에 같은 판정이 있으면 그것으로 바로 보여 주고, 없으면 불러오는 중 */
const firstState = (id: string, filters: SearchFilters | null, locale: Locale): ProgramState => {
  const listed = listedProgram(id, filters, locale)
  return listed ? { status: 'ready', program: listed } : { status: 'loading' }
}

/** 공고 하나를 불러옵니다. 조건이 있으면 같은 조건으로 다시 판정합니다(명세 6장). */
export function useProgram(id: string, filters: SearchFilters | null, locale: Locale): [ProgramState, () => void] {
  const [state, setState] = useState<ProgramState>(() => firstState(id, filters, locale))
  const [attempt, setAttempt] = useState(0)
  const filterKey = JSON.stringify(filters)

  useEffect(() => {
    const controller = new AbortController()
    setState((previous) => (previous.status === 'ready' && previous.program.program_id === id ? previous : firstState(id, filters, locale)))
    getProgram(id, filters, locale, controller.signal)
      .then((program) => setState(program ? { status: 'ready', program } : { status: 'missing' }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', missingApi: error instanceof MissingApiError })
      })
    return () => controller.abort()
    // filterKey가 filters를 대신합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, filterKey, locale, attempt])

  return [state, () => setAttempt((value) => value + 1)]
}
