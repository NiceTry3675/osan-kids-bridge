import { useEffect, useMemo, useRef, useState } from 'react'
import { play } from './drive'
import { frameDocument } from './frame'
import type { AppBundle } from './frame'
import { KIND_LABEL } from './flows'
import type { Screen } from './flows'

/** 틀 안 앱이 보는 화면 크기(일반적인 휴대폰 너비) */
export const VIEWPORT = { width: 375, height: 740 }

interface Props {
  screen: Screen
  number: number
  bundle: AppBundle
  last: boolean
}

/** 실제 앱 하나가 들어 있는 휴대폰 틀과 설명. 틀 안에서 눌러 보고 스크롤할 수 있습니다. */
export function PhoneFrame({ screen, number, bundle, last }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const runId = useRef(0)
  const [scale, setScale] = useState(0.7)
  const [mounted, setMounted] = useState(false)
  const [run, setRun] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const srcDoc = useMemo(() => frameDocument(bundle, screen.setup), [bundle, screen])
  const label = String(number).padStart(2, '0')

  // 화면에 가까워질 때 앱을 띄웁니다. 틀마다 조금씩 늦춰 한꺼번에 무거워지지 않게 합니다.
  useEffect(() => {
    const node = holder.current
    if (!node || mounted) return
    let timer = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      timer = window.setTimeout(() => setMounted(true), (number - 1) * 220)
    }, { rootMargin: '0px 400px' })
    observer.observe(node)
    return () => { observer.disconnect(); window.clearTimeout(timer) }
  }, [mounted, number])

  useEffect(() => {
    const node = holder.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / VIEWPORT.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const onLoad = () => {
    const id = ++runId.current
    const node = frame.current
    if (!node) return
    setStatus('loading')
    play(node, screen.steps ?? [], () => id !== runId.current)
      .then(() => { if (id === runId.current) setStatus('ready') })
      .catch(() => { if (id === runId.current) setStatus('failed') })
  }

  const restart = () => { runId.current += 1; setStatus('loading'); setRun((value) => value + 1) }

  return (
    <li className="cell">
      <div className="phone">
        <div className="phone-screen" ref={holder} style={{ aspectRatio: `${VIEWPORT.width} / ${VIEWPORT.height}` }}>
          {mounted && (
            <iframe
              key={run}
              ref={frame}
              title={`${label} ${screen.title}`}
              srcDoc={srcDoc}
              onLoad={onLoad}
              width={VIEWPORT.width}
              height={VIEWPORT.height}
              style={{ transform: `scale(${scale})` }}
            />
          )}
          {status !== 'ready' && (
            <div className="phone-cover" aria-hidden={status === 'loading'}>
              {status === 'loading' ? <span className="spinner" /> : <p>이 화면까지 가지 못했어요.<br />‘처음 상태로’를 눌러 주세요.</p>}
            </div>
          )}
        </div>
      </div>
      {!last && <span className="flow-arrow" aria-hidden="true" />}
      <div className="cap">
        <h3><span className="num">{label}</span>{screen.title}</h3>
        <p className="where"><span className={`kind kind--${screen.kind}`}>{KIND_LABEL[screen.kind]}</span>{screen.where}</p>
        <ul>{screen.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <button type="button" className="restart" onClick={restart}>처음 상태로</button>
      </div>
    </li>
  )
}
