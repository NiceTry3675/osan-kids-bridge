import { useEffect, useId, useRef } from 'react'
import type { FormEvent, ReactNode } from 'react'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** 제목. 화면에 보이지 않게 하려면 titleHidden */
  title: string
  titleHidden?: boolean
  /** 닫기 버튼의 읽기 이름(화면 언어) */
  closeLabel: string
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
 * 보호자 웹(조건 넣기, 신청·물어보기)과 운영기관 대시보드(조건 고르기, 추천 자세히)가 함께 씁니다.
 */
export function Sheet({ open, onClose, title, titleHidden, closeLabel, headerExtra, footer, onSubmit, tall, children }: SheetProps) {
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
        <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel}>
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
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
