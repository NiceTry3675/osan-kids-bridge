import { langAttr } from '@osan-kids-bridge/ui'
import { useI18n } from '../../i18n'
import { languageOptions, localeState } from '../../i18n/policy'
import { Icon } from '../../components/Icon'
import { IntroArt } from './art'

const SELECTABLE = languageOptions().filter((option) => option.state !== 'in_review')

interface Props {
  onStart: () => void
  onMoreLanguages: () => void
}

/**
 * 01 첫 화면: 기본 주소로 처음 왔을 때 한 번만.
 * 언어를 맨 위에 둡니다: 한국어를 읽기 전에 고를 수 있어야 하고, 언어를 바꿔 글이 길어져도 누른 버튼이 밀리지 않습니다.
 * 일반 휴대폰에서는 스크롤 없이 한 화면에 들어옵니다.
 */
export function IntroScreen({ onStart, onMoreLanguages }: Props) {
  const { locale, setLocale, t } = useI18n()
  return (
    <main className="intro" id="main" tabIndex={-1}>
      {/* 이 줄은 어떤 언어에서도 한 줄이라, 언어를 바꿔도 아래 언어 버튼의 자리가 그대로입니다. 언어 이름이 곧 질문이라 묻는 글은 읽기 프로그램에만 둡니다. */}
      <div className="intro-lang-head">
        <p className="intro-brand">{t('introBrand')}</p>
        <button type="button" className="link-btn" onClick={onMoreLanguages}><Icon name="globe" />{t('pickerMore')}</button>
      </div>
      <p className="visually-hidden" id="intro-language">{t('introLanguage')}</p>
      <div className="intro-langs" role="radiogroup" aria-labelledby="intro-language">
        {SELECTABLE.map((option) => (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={locale === option.code}
            className="intro-lang"
            onClick={() => setLocale(option.code)}
          >
            {locale === option.code && <Icon name="check" />}
            <span lang={langAttr(option.code)}>{option.native}</span>
            {option.state === 'draft' && <small lang={langAttr(option.code)}>{option.note}</small>}
          </button>
        ))}
      </div>
      {localeState(locale) === 'draft' && <p className="intro-draft">{t('draftNotice')}</p>}

      <IntroArt />
      <h1 className="intro-title">{t('introTitle')}</h1>
      <p className="intro-lead">{t('introLead')}</p>
      <p className="intro-privacy">{t('homeFooter')}</p>

      <div className="intro-foot">
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onStart}>{t('introStart')}</button>
      </div>
    </main>
  )
}
