import { useEffect, useId, useRef } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Icon } from './Icon'

interface Props {
  open: boolean
  onClose: () => void
  /** 제목. 화면에 보이지 않게 하려면 titleHidden */
  title: string
  titleHidden?: boolean
  /** 제목 자리 옆에 둘 것(예: 탭) */
  headerExtra?: ReactNode
  footer?: ReactNode
  /** 주면 내용 전체를 form으로 감싸고 제출 시 호출합니다. */
  onSubmit?: () => void
  tall?: boolean
  children: ReactNode
}

/**
 * 페이지 위에 아래에서 올라오는 시트. 네이티브 <dialog>로 포커스 가두기·Esc 닫기·배경 클릭 닫기를 처리합니다.
 * 조건 넣기(03)와 신청·물어보기(06)가 함께 씁니다.
 */
export function Sheet({ open, onClose, title, titleHidden, headerExtra, footer, onSubmit, tall, children }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal?.()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const body = (
    <>
      <div className="grab" aria-hidden="true" />
      <header className="sheet-head">
        <h2 id={titleId} className={titleHidden ? 'visually-hidden' : undefined}>{title}</h2>
        {headerExtra}
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}><Icon name="x" /></button>
      </header>
      <div className="sheet-body">{children}</div>
      {footer && <footer className="sheet-foot">{footer}</footer>}
    </>
  )
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit?.() }

  return (
    <dialog
      ref={ref}
      className={tall ? 'sheet sheet--tall' : 'sheet'}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      {onSubmit ? <form className="sheet-inner" onSubmit={submit}>{body}</form> : <div className="sheet-inner">{body}</div>}
    </dialog>
  )
}
