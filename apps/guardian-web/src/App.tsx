import { useEffect, useMemo, useState } from 'react'
import { LanguagePicker } from '@osan-kids-bridge/ui'
import { useI18n } from './i18n'
import { languageOptions, localeState } from './i18n/policy'
import { usingDemoData } from './data/api'
import type { SearchFilters } from './data/types'
import { clearSearchSession, readSearchSession, saveSearchSession } from './lib/searchSession'
import { filterChips } from './lib/format'
import { useRoute } from './lib/router'
import { BrowseScreen } from './screens/BrowseScreen'
import { DetailScreen } from './screens/DetailScreen'
import { IntroScreen } from './screens/IntroScreen'

const INTRO_KEY = 'osan-guardian-intro-seen'
const introSeen = () => { try { return localStorage.getItem(INTRO_KEY) === '1' } catch { return true } }

export default function App() {
  const { locale, setLocale, t } = useI18n()
  const [route, historyState] = useRoute()
  const [filters, setFilters] = useState<SearchFilters>(() => readSearchSession().filters)
  // 첫 방문에 기본 주소로 왔을 때만 보입니다. 공유 링크로 오면 바로 상세로 갑니다.
  const [showIntro, setShowIntro] = useState(() => route.name === 'browse' && !introSeen())
  const options = useMemo(() => languageOptions(), [])

  useEffect(() => {
    if (filterChips(filters, 'ko-easy').length) saveSearchSession({ filters, hasApplied: true })
    else clearSearchSession()
  }, [filters])
  useEffect(() => { document.title = t('brand') }, [t])

  const finishIntro = () => {
    try { localStorage.setItem(INTRO_KEY, '1') } catch { /* 이번 방문만 */ }
    setShowIntro(false)
  }

  return (
    <div className={showIntro ? 'shell shell--intro' : 'shell'}>
      <a className="skip" href="#main">{t('browseTitle')}</a>
      <LanguagePicker
        value={locale}
        options={options}
        onChange={setLocale}
        copy={{
          label: t('languageLabel'), more: t('pickerMore'), title: t('pickerTitle'), search: t('pickerSearch'), close: t('close'),
          current: t('pickerCurrent'), draft: t('pickerDraft'), inReview: t('pickerInReview'), notOffered: t('pickerNotOffered'), noMatch: t('pickerNoMatch'),
        }}
      />
      {localeState(locale) === 'draft' && <p className="ribbon ribbon--draft" role="note">{t('draftNotice')}</p>}
      {usingDemoData && !showIntro && <p className="ribbon ribbon--demo" role="note">{t('demoNotice')}</p>}
      {showIntro
        ? <IntroScreen onStart={finishIntro} />
        : route.name === 'browse'
          ? <BrowseScreen filters={filters} onFiltersChange={setFilters} restoreScrollY={historyState.scrollY} />
          : <DetailScreen key={route.id} id={route.id} filters={historyState.fromList ? filters : null} />}
    </div>
  )
}
