import { useEffect, useMemo, useRef, useState } from 'react'
import { bundleFor } from './bundles'
import { FLOWS } from './flows'
import type { AppName } from './flows'
import { PhoneFrame } from './PhoneFrame'

const readHash = (): AppName => (window.location.hash === '#dashboard' ? 'dashboard' : 'guardian')

/** 두 유저플로우를 실제 앱으로 보여 주는 보드. 한 번 연 흐름은 숨겨도 틀 안 상태를 그대로 둡니다. */
export default function App() {
  const [active, setActive] = useState<AppName>(readHash)
  const [opened, setOpened] = useState<Set<AppName>>(() => new Set([readHash()]))

  useEffect(() => {
    const onHash = () => choose(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function choose(app: AppName) {
    setActive(app)
    setOpened((prev) => new Set(prev).add(app))
    try { history.replaceState(null, '', `#${app}`) } catch { /* 주소를 못 바꿔도 화면은 바뀝니다. */ }
  }

  return (
    <div className="board">
      <header className="board-head">
        <div className="title">
          <h1>오산 아이 프로그램 유저플로우</h1>
          <p>틀마다 실제 화면이 돌아가요. 눌러 보고, 틀 안에서 스크롤해 보세요.</p>
        </div>
        <div className="switch" role="tablist" aria-label="누구의 흐름">
          {FLOWS.map((flow) => (
            <button key={flow.app} type="button" role="tab" id={`tab-${flow.app}`} aria-controls={`flow-${flow.app}`} aria-selected={active === flow.app} onClick={() => choose(flow.app)}>
              {flow.label}
            </button>
          ))}
        </div>
      </header>
      {FLOWS.map((flow) => opened.has(flow.app) && (
        <FlowStrip key={flow.app} app={flow.app} hidden={active !== flow.app} />
      ))}
      <footer className="legend">
        <span><span className="kind kind--page">페이지</span>주소가 바뀌는 화면</span>
        <span><span className="kind kind--sheet">시트</span>페이지 위에 열고 닫는 화면</span>
        <span><span className="kind kind--state">상태</span>같은 화면의 다른 모습</span>
        <span><i className="swatch" />노란 형광펜은 아직 확인되지 않은 정보</span>
        <span>모든 공고와 응답은 시연용 가상 데이터예요.</span>
      </footer>
    </div>
  )
}

function FlowStrip({ app, hidden }: { app: AppName; hidden: boolean }) {
  const flow = FLOWS.find((item) => item.app === app)!
  const bundle = useMemo(() => bundleFor(app), [app])
  const strip = useRef<HTMLOListElement>(null)
  const move = (direction: 1 | -1) => {
    const node = strip.current
    const cell = node?.querySelector<HTMLElement>('.cell')
    if (node && cell) node.scrollBy({ left: direction * (cell.offsetWidth + 40), behavior: 'smooth' })
  }
  return (
    <section id={`flow-${app}`} role="tabpanel" aria-labelledby={`tab-${app}`} hidden={hidden} className="flow">
      <div className="flow-head">
        <p>{flow.summary}</p>
        <div className="pager">
          <button type="button" onClick={() => move(-1)} aria-label="앞 화면들">‹</button>
          <button type="button" onClick={() => move(1)} aria-label="다음 화면들">›</button>
        </div>
      </div>
      <ol className="strip" ref={strip}>
        {flow.screens.map((screen, index) => (
          <PhoneFrame key={screen.id} screen={screen} number={index + 1} bundle={bundle} last={index === flow.screens.length - 1} />
        ))}
      </ol>
    </section>
  )
}
