import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { DataGuide } from './components/DataGuide'
import { DemandView } from './components/DemandView'
import { RecommendView } from './components/RecommendView'
import { DEMO_RECORD_COUNT } from './data/assumptions'
import { defaultFilters } from './lib/aggregate'
import type { DemandFilters } from './lib/aggregate'
import { initialPlanForm } from './lib/plan'
import type { PlanForm } from './lib/plan'

type Tab = 'demand' | 'recommend' | 'guide'
const tabs: { id: Tab; label: string; hint: string }[] = [
  { id: 'demand', label: '수요 현황', hint: '요일·시간대와 동네별 수요' },
  { id: 'recommend', label: '일정·장소 추천', hint: '가장 많은 가정에 닿는 조합' },
  { id: 'guide', label: '데이터 안내', hint: '수집 항목과 시연용 가정' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('demand')
  const [filters, setFilters] = useState<DemandFilters>(defaultFilters)
  const [planForm, setPlanForm] = useState<PlanForm>(initialPlanForm)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ demand: null, recommend: null, guide: null })

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((item) => item.id === tab)
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    setTab(tabs[next].id)
    tabRefs.current[tabs[next].id]?.focus()
  }

  return (
    <div className="app">
      <p className="demo-banner" role="note"><strong>가상 데이터로 만든 시연 화면입니다</strong><span>합성 응답 {DEMO_RECORD_COUNT}가정 · 실제 보호자 응답이나 실제 시설이 아니에요</span></p>
      <header className="site-header">
        <div className="header-inner">
          <div>
            <p className="brand">오산 아이 프로그램 <span>운영기관</span></p>
            <h1>수요 기반 일정·장소 추천</h1>
          </div>
          <p className="header-note">보호자들이 익명으로 남긴 가능 시간과 동네를 모아, 가장 많은 가정이 올 수 있는 <span className="nowrap">요일·시간대·장소를</span> 찾아요.</p>
        </div>
        <div className="tab-list" role="tablist" aria-label="대시보드 화면">
          {tabs.map((item) => (
            <button
              key={item.id}
              ref={(node) => { tabRefs.current[item.id] = node }}
              id={`tab-${item.id}`}
              className={`tab${tab === item.id ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={onTabKey}
            >
              <span>{item.label}</span><small>{item.hint}</small>
            </button>
          ))}
        </div>
      </header>
      <main className="page">
        <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} className="tab-panel">
          {tab === 'demand' && <DemandView filters={filters} setFilters={setFilters} />}
          {tab === 'recommend' && <RecommendView form={planForm} setForm={setPlanForm} />}
          {tab === 'guide' && <DataGuide />}
        </section>
      </main>
      <footer className="site-footer">시연용 목업 · 모든 숫자는 고정 시드로 만든 합성 데이터에서 나와요 · 개별 응답은 표시하지 않아요</footer>
    </div>
  )
}
