import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { LanguagePicker } from '@osan-kids-bridge/ui'
import { DataGuide } from './components/DataGuide'
import { DemandView } from './components/DemandView'
import { RecommendView } from './components/RecommendView'
import { languageOptions, localeState, useLanguage } from './i18n'
import { defaultFilters } from './lib/aggregate'
import type { DemandFilters } from './lib/aggregate'
import { initialPlanForm } from './lib/plan'
import type { PlanForm } from './lib/plan'

type Tab = 'demand' | 'recommend' | 'guide'
const TABS: Tab[] = ['demand', 'recommend', 'guide']

/** 하단(넓은 화면에서는 상단) 탭의 선 아이콘: 막대그래프 · 달력 · 자물쇠 */
const TAB_ICONS: Record<Tab, ReactNode> = {
  demand: <path d="M4 20V11M10 20V5M16 20v-6M21 20H3" />,
  recommend: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  guide: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
}

/** 운영기관 대시보드(유저플로우 v3): 수요 · 추천 · 안내 세 탭 */
export default function App() {
  const { locale, setLocale, t } = useLanguage()
  const [tab, setTab] = useState<Tab>('demand')
  const [filters, setFilters] = useState<DemandFilters>(defaultFilters)
  const [planForm, setPlanForm] = useState<PlanForm>(initialPlanForm)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ demand: null, recommend: null, guide: null })
  const options = useMemo(() => languageOptions(), [])
  const labels: Record<Tab, string> = { demand: t('demandTab'), recommend: t('recommendTab'), guide: t('guideTab') }

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.indexOf(tab)
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null
    if (next === null) return
    event.preventDefault()
    setTab(TABS[next])
    tabRefs.current[TABS[next]]?.focus()
  }

  return (
    <div className="app">
      <a className="skip" href="#panel">{t('skip')}</a>
      <header className="masthead">
        <div className="masthead-inner">
          <p className="brand">
            {t('brand')}<span className="brand-role">{t('institution')}</span>
            <span className="demo-tag" title={t('demo')}>{t('demoTag')}</span>
          </p>
          <LanguagePicker
            tone="plain"
            value={locale}
            options={options}
            onChange={setLocale}
            copy={{
              label: t('language'), more: t('pickerMore'), title: t('pickerTitle'), search: t('pickerSearch'), close: t('close'),
              current: t('pickerCurrent'), draft: t('pickerDraft'), inReview: t('pickerInReview'), notOffered: t('pickerNotOffered'), noMatch: t('pickerNoMatch'),
            }}
          />
        </div>
        <nav className="tabs" role="tablist" aria-label={t('institution')}>
          {TABS.map((item) => (
            <button
              key={item}
              ref={(node) => { tabRefs.current[item] = node }}
              id={`tab-${item}`}
              className="tab"
              type="button"
              role="tab"
              aria-selected={tab === item}
              aria-controls="panel"
              tabIndex={tab === item ? 0 : -1}
              onClick={() => setTab(item)}
              onKeyDown={onTabKey}
            >
              <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">{TAB_ICONS[item]}</svg>
              {labels[item]}
            </button>
          ))}
        </nav>
      </header>
      {localeState(locale) === 'draft' && <p className="draft-band" role="note">{t('draftNotice')}</p>}
      <main className="page">
        <section id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1} className="panel">
          {tab === 'demand' && <DemandView filters={filters} setFilters={setFilters} />}
          {tab === 'recommend' && <RecommendView form={planForm} setForm={setPlanForm} />}
          {tab === 'guide' && <DataGuide />}
        </section>
      </main>
    </div>
  )
}
