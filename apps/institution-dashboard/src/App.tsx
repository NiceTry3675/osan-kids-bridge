import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { LanguagePicker } from '@osan-kids-bridge/ui'
import { DataGuide } from './components/DataGuide'
import { DemandView } from './components/DemandView'
import { RecommendView } from './components/RecommendView'
import { Icon } from './components/icons'
import { languageOptions, localeState, useLanguage } from './i18n'
import { defaultFilters } from './lib/aggregate'
import type { DemandFilters } from './lib/aggregate'
import { initialPlanForm } from './lib/plan'
import type { PlanForm } from './lib/plan'

type Tab = 'demand' | 'recommend' | 'guide'
const TABS: Tab[] = ['demand', 'recommend', 'guide']

/**
 * 운영기관 대시보드(유저플로우 v3). 보호자 웹과 같은 틀: 맨 위 화면 언어 띠, 시연 안내 줄, 흰 페이지.
 * 수요 · 추천 · 안내 세 탭은 아래 탭 막대로 오갑니다.
 */
export default function App() {
  const { locale, setLocale, t } = useLanguage()
  const [tab, setTab] = useState<Tab>('demand')
  const [filters, setFilters] = useState<DemandFilters>(defaultFilters)
  const [planForm, setPlanForm] = useState<PlanForm>(initialPlanForm)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ demand: null, recommend: null, guide: null })
  const options = useMemo(() => languageOptions(), [])
  const labels: Record<Tab, string> = { demand: t('demandTab'), recommend: t('recommendTab'), guide: t('guideTab') }

  const choose = (next: Tab) => { setTab(next); window.scrollTo({ top: 0 }) }
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.indexOf(tab)
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null
    if (next === null) return
    event.preventDefault()
    choose(TABS[next])
    tabRefs.current[TABS[next]]?.focus()
  }

  return (
    <div className="shell">
      <a className="skip" href="#panel">{t('skip')}</a>
      <LanguagePicker
        value={locale}
        options={options}
        onChange={setLocale}
        copy={{
          label: t('language'), more: t('pickerMore'), title: t('pickerTitle'), search: t('pickerSearch'), close: t('close'),
          current: t('pickerCurrent'), draft: t('pickerDraft'), inReview: t('pickerInReview'), notOffered: t('pickerNotOffered'), noMatch: t('pickerNoMatch'),
        }}
      />
      {localeState(locale) === 'draft' && <p className="ribbon ribbon--draft" role="note">{t('draftNotice')}</p>}
      <p className="ribbon ribbon--demo" role="note">{t('demo')}</p>
      <main id="panel" className="page dash-page" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        {tab === 'demand' && <DemandView filters={filters} setFilters={setFilters} />}
        {tab === 'recommend' && <RecommendView form={planForm} setForm={setPlanForm} />}
        {tab === 'guide' && <DataGuide />}
      </main>
      <nav className="tabbar" role="tablist" aria-label={t('institution')}>
        {TABS.map((item) => (
          <button
            key={item}
            ref={(node) => { tabRefs.current[item] = node }}
            id={`tab-${item}`}
            className="tabbar-btn"
            type="button"
            role="tab"
            aria-selected={tab === item}
            aria-controls="panel"
            tabIndex={tab === item ? 0 : -1}
            onClick={() => choose(item)}
            onKeyDown={onTabKey}
          >
            <Icon name={item} />
            {labels[item]}
          </button>
        ))}
      </nav>
    </div>
  )
}
