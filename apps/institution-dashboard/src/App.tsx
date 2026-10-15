import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { DataGuide } from './components/DataGuide'
import { DemandView } from './components/DemandView'
import { RecommendView } from './components/RecommendView'
import { defaultFilters } from './lib/aggregate'
import type { DemandFilters } from './lib/aggregate'
import { initialPlanForm } from './lib/plan'
import type { PlanForm } from './lib/plan'

type Tab = 'demand' | 'recommend' | 'guide'
const tabs: { id: Tab; label: string }[] = [
  { id: 'demand', label: '수요 현황' },
  { id: 'recommend', label: '일정·장소 추천' },
  { id: 'guide', label: '수집 기준' },
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
      <header className="site-header">
        <div className="header-inner">
          <h1>오산 아이 프로그램 <span>기관 관리</span></h1>
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
              {item.label}
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
    </div>
  )
}
