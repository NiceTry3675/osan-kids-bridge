import { useEffect, useMemo, useRef, useState } from 'react'
import { LanguagePicker } from '@osan-kids-bridge/ui'
import type { LanguagePickerHandle } from '@osan-kids-bridge/ui'
import { useI18n } from './i18n'
import { languageOptions, localeState } from './i18n/policy'
import { usingDemoData } from './data/api'
import type { SearchFilters } from './data/types'
import { hasAnyCondition } from './lib/filters'
import { readFilters, writeFilters } from './lib/session'
import { useRoute } from './lib/router'
import { DetailScreen } from './screens/detail/DetailScreen'
import { HomeScreen } from './screens/home/HomeScreen'
import { IntroScreen } from './screens/intro/IntroScreen'

const INTRO_KEY = 'osan-guardian-intro-seen'
const introSeen = () => { try { return localStorage.getItem(INTRO_KEY) === '1' } catch { return true } }

/**
 * 보호자 웹(유저플로우 v5). 페이지는 홈(/)과 상세(/programs/{id}) 두 개이고,
 * 조건 넣기·신청·물어보기는 그 위에 여는 시트입니다. 언어 고르기는 늘 맨 위에 있습니다.
 */
export default function App() {
  const { locale, setLocale, t } = useI18n()
  const [route, history] = useRoute()
  const [filters, setFilters] = useState<SearchFilters>(readFilters)
  // 기본 주소로 처음 왔을 때만 첫 화면을 보입니다. 공유 링크로 오면 바로 상세입니다.
  const [showIntro, setShowIntro] = useState(() => route.name === 'browse' && !introSeen())
  const picker = useRef<LanguagePickerHandle>(null)
  const options = useMemo(() => languageOptions(), [])

  useEffect(() => { writeFilters(hasAnyCondition(filters) ? filters : null) }, [filters])
  useEffect(() => { document.title = t('brand') }, [t])

  const finishIntro = () => {
    try { localStorage.setItem(INTRO_KEY, '1') } catch { /* 이번 방문에만 기억합니다. */ }
    setShowIntro(false)
  }

  return (
    <div className={showIntro ? 'shell shell--intro' : 'shell'}>
      {/* 주소에 #main을 붙이지 않고 본문으로 초점만 옮깁니다 (라우터가 해시를 다른 화면으로 읽지 않게) */}
      <a className="skip" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById('main')?.focus() }}>{t('skip')}</a>
      <LanguagePicker
        ref={picker}
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

      {showIntro ? <IntroScreen onStart={finishIntro} onMoreLanguages={() => picker.current?.openSearch()} />
        : route.name === 'browse' ? <HomeScreen filters={filters} onFiltersChange={setFilters} restoreScrollY={history.scrollY} />
          : <DetailScreen key={route.id} id={route.id} filters={history.fromList || history.fromChat ? filters : null} />}
    </div>
  )
}
