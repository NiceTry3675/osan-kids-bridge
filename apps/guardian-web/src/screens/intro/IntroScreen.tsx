import { langAttr } from '@osan-kids-bridge/ui'
import { useI18n } from '../../i18n'
import { languageOptions } from '../../i18n/policy'
import { Icon } from '../../components/Icon'

const SELECTABLE = languageOptions().filter((option) => option.state !== 'in_review')

interface Props {
  onStart: () => void
  onMoreLanguages: () => void
}

/** 01 첫 화면: 기본 주소로 처음 왔을 때 한 번만. 한국어를 읽기 전에 언어부터 고릅니다. */
export function IntroScreen({ onStart, onMoreLanguages }: Props) {
  const { locale, setLocale, t } = useI18n()
  return (
    <main className="intro" id="main">
      <div className="intro-art" aria-hidden="true">🎒</div>
      <h1 className="intro-title">{t('introTitle')}</h1>
      <p className="intro-lead">{t('introLead')}</p>

      <h2 className="intro-q">{t('introLanguage')}</h2>
      <div className="intro-langs" role="radiogroup" aria-label={t('languageLabel')}>
        {SELECTABLE.map((option) => (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={locale === option.code}
            lang={langAttr(option.code)}
            className="intro-lang"
            onClick={() => setLocale(option.code)}
          >
            <span>{option.native}</span>
            {option.state === 'draft' && <small>{t('pickerDraft')}</small>}
            {locale === option.code && <Icon name="check" />}
          </button>
        ))}
      </div>
      <button type="button" className="link-btn" onClick={onMoreLanguages}><Icon name="globe" />{t('pickerMore')}</button>

      <button type="button" className="btn btn--primary btn--lg btn--block intro-start" onClick={onStart}>{t('introStart')}</button>
    </main>
  )
}
