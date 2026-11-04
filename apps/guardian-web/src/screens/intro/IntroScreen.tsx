import { langAttr } from '@osan-kids-bridge/ui'
import { useI18n } from '../../i18n'
import type { MessageKey } from '../../i18n'
import { languageOptions } from '../../i18n/policy'
import { Icon } from '../../components/Icon'
import { IntroArt, ValueIcon } from './art'
import type { ValueName } from './art'

const SELECTABLE = languageOptions().filter((option) => option.state !== 'in_review')

/** 이 서비스가 해 주는 세 가지. 홈의 포스터 띠·맞게 보기·AI 상담과 같은 아이콘을 씁니다. */
const VALUES: [ValueName, MessageKey][] = [
  ['poster', 'introValuePoster'],
  ['fit', 'introValueFit'],
  ['ask', 'introValueAsk'],
]

interface Props {
  onStart: () => void
  onMoreLanguages: () => void
}

/** 01 첫 화면: 기본 주소로 처음 왔을 때 한 번만. 한국어를 읽기 전에 언어부터 고릅니다. */
export function IntroScreen({ onStart, onMoreLanguages }: Props) {
  const { locale, setLocale, t } = useI18n()
  return (
    <main className="intro" id="main" tabIndex={-1}>
      <IntroArt />
      <h1 className="intro-title">{t('introTitle')}</h1>
      <p className="intro-lead">{t('introLead')}</p>
      <ul className="intro-values">
        {VALUES.map(([icon, key]) => (
          <li key={key} className={`intro-value intro-value--${icon}`}>
            <span className="intro-value-icon"><ValueIcon name={icon} /></span>
            {t(key)}
          </li>
        ))}
      </ul>

      <h2 className="intro-q">{t('introLanguage')}</h2>
      <div className="intro-langs" role="radiogroup" aria-label={t('languageLabel')}>
        {SELECTABLE.map((option) => (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={locale === option.code}
            className="intro-lang"
            onClick={() => setLocale(option.code)}
          >
            {/* 언어 이름만 그 언어로 읽고, ‘번역 초안’ 꼬리표는 지금 화면 언어 글자입니다. */}
            <span lang={langAttr(option.code)}>{option.native}</span>
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
