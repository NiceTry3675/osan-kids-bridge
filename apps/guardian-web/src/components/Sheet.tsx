import { useEffect, useRef } from 'react'
import { Sheet as SharedSheet } from '@osan-kids-bridge/ui'
import type { SheetProps } from '@osan-kids-bridge/ui'
import { useI18n } from '../i18n'

/**
 * 닫기 단추로 닫으며 부른 history.back()의 신호는 사용자의 뒤로 가기가 아닙니다.
 * 신호가 늦게 도착하는 사이 시트를 다시 열어도, 새 시트가 그 신호에 닫히지 않게 구분합니다.
 */
let ownBacks = 0
let lastPopWasOwn = false
window.addEventListener('popstate', () => {
  lastPopWasOwn = ownBacks > 0
  if (lastPopWasOwn) ownBacks -= 1
})

/**
 * 휴대폰 뒤로 가기가 페이지를 떠나지 않고 열린 시트를 닫게 합니다.
 * 시트를 열 때 기록을 하나 넣고, 뒤로 가기면 닫습니다. 화면의 닫기 단추로 닫으면 넣은 기록을 도로 뺍니다.
 * 시트 안에서 다른 페이지로 넘어갔으면(지금 기록이 시트의 것이 아니면) 건드리지 않습니다.
 */
function useCloseOnBack(open: boolean, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    window.history.pushState({ ...(window.history.state as object | null), sheet: true }, '')
    let popped = false
    const onPop = () => {
      if (lastPopWasOwn) return
      popped = true
      close.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (popped || !(window.history.state as { sheet?: boolean } | null)?.sheet) return
      ownBacks += 1
      window.history.back()
    }
  }, [open])
}

/** 공통 시트(packages/ui)에 화면 언어의 ‘닫기’와 뒤로 가기를 붙입니다. 조건 넣기(03)와 신청·물어보기(06)가 씁니다. */
export function Sheet(props: Omit<SheetProps, 'closeLabel'>) {
  const { t } = useI18n()
  useCloseOnBack(props.open, props.onClose)
  return <SharedSheet {...props} closeLabel={t('close')} />
}
