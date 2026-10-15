import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
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
const tabs: Tab[] = ['demand', 'recommend', 'guide']
const tabIcons: Record<Tab, string> = { demand: '📊', recommend: '🗓️', guide: '🔒' }

export default function App() {
  const { locale, setLocale, t } = useLanguage()
  const [tab, setTab] = useState<Tab>('demand')
  const [filters, setFilters] = useState<DemandFilters>(defaultFilters)
  const [planForm, setPlanForm] = useState<PlanForm>(initialPlanForm)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ demand: null, recommend: null, guide: null })
  const options = useMemo(() => languageOptions(), [])

  const select = (next: Tab) => { setTab(next); tabRefs.current[next]?.focus() }
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.indexOf(tab)
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    select(tabs[next])
  }
  const page = {
    demand: { title: t('demandTitle'), desc: t('demandDesc') },
    recommend: { title: t('recommendTitle'), desc: t('recommendDesc') },
    guide: { title: t('guideTitle'), desc: t('guideDesc') },
  }[tab]
  const tabLabels = { demand: t('demandTab'), recommend: t('recommendTab'), guide: t('guideTab') }

  return (
    <div className="app">
      <a className="skip" href="#panel">{t('skip')}</a>
      <header className="masthead">
        <div className="masthead-inner">
          <p className="brand"><span className="brand-mark" aria-hidden="true" />{t('brand')}<span className="brand-role">{t('institution')}</span></p>
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
          {tabs.map((item) => (
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
              <span className="tab-icon" aria-hidden="true">{tabIcons[item]}</span>
              {tabLabels[item]}
            </button>
          ))}
        </nav>
      </header>
      <p className="demo-band" role="note">{t('demo')}</p>
      {localeState(locale) === 'draft' && <p className="draft-band" role="note">{t('draftNotice')}</p>}
      <main className="page">
        <div className="page-head">
          <h1>{page.title}</h1>
          <p>{page.desc}</p>
        </div>
        <section id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1} className="panel">
          {tab === 'demand' && <DemandView filters={filters} setFilters={setFilters} />}
          {tab === 'recommend' && <RecommendView form={planForm} setForm={setPlanForm} />}
          {tab === 'guide' && <DataGuide />}
        </section>
      </main>
    </div>
  )
}
