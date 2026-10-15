import { useMemo } from 'react'
import { useI18n } from '../i18n'
import { languageOptions } from '../i18n/policy'
import { langAttr } from '@osan-kids-bridge/ui'
import { Icon } from '../components/bits'

/** 처음 방문했을 때 한 번만 보이는 화면. 한국어를 읽기 전에 언어부터 고릅니다. */
export function IntroScreen({ onStart }: { onStart: () => void }) {
  const { locale, setLocale, t } = useI18n()
  const options = useMemo(() => languageOptions().filter((option) => option.state !== 'in_review'), [])
  const openMoreLanguages = () => (document.querySelector('.lp-more') as HTMLButtonElement | null)?.click()

  return (
    <main className="intro" id="main">
      <div className="intro-art" aria-hidden="true">🎒</div>
      <h1 className="intro-title">{t('introTitle')}</h1>
      <p className="intro-lead">{t('introLead')}</p>
      <h2 className="intro-q">{t('introLanguage')}</h2>
      <div className="intro-langs" role="radiogroup" aria-label={t('languageLabel')}>
        {options.map((option) => (
          <button key={option.code} type="button" role="radio" aria-checked={locale === option.code} lang={langAttr(option.code)}
            className="intro-lang" onClick={() => setLocale(option.code)}>
            <span>{option.native}</span>
            {option.state === 'draft' && <small>{t('pickerDraft')}</small>}
            {locale === option.code && <Icon name="check" />}
          </button>
        ))}
      </div>
      <button type="button" className="link-btn" onClick={openMoreLanguages}><Icon name="globe" />{t('pickerMore')}</button>
      <button type="button" className="btn btn--primary btn--lg btn--block intro-start" onClick={onStart}>{t('introStart')}</button>
    </main>
  )
}
