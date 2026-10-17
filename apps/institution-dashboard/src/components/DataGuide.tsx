import { SUPPRESSION_THRESHOLD } from '@osan-kids-bridge/planning'
import { useLanguage } from '../i18n'
import { ViewHeader } from './ViewHeader'

export function DataGuide() {
  const { t } = useLanguage()
  return (
    <div className="view guide">
      <ViewHeader title={t('guideTab')} lead={t('guideLead')} />
      <div className="dash-grid">
      <section className="card block-card" aria-labelledby="guide-collect">
        <h2 id="guide-collect" className="block-title">{t('guideCollected')}</h2>
        <dl className="rows">
          <div className="row"><dt>{t('guideDistrict')}</dt><dd>{t('guideDistrictValue')}</dd></div>
          <div className="row"><dt>{t('guideChildGrade')}</dt><dd>{t('guideChildGradeValue')}</dd></div>
          <div className="row"><dt>{t('guideTime')}</dt><dd>{t('guideTimeValue')}</dd></div>
          <div className="row"><dt>{t('guideInterest')}</dt><dd>{t('guideInterestValue')}</dd></div>
          <div className="row"><dt>{t('guideKoreanLevel')}</dt><dd>{t('guideKoreanLevelValue')}</dd></div>
          <div className="row"><dt>{t('guideLanguage')}</dt><dd>{t('guideLanguageValue')}</dd></div>
        </dl>
      </section>
      <section className="card block-card" aria-labelledby="guide-not-collect">
        <h2 id="guide-not-collect" className="block-title">{t('guideNotCollected')}</h2>
        <ul className="dot-list">
          <li>{t('name')}</li>
          <li>{t('contact')}</li>
          <li>{t('address')}</li>
          <li>{t('origin')}</li>
        </ul>
      </section>
      <section className="card block-card" aria-labelledby="guide-privacy">
        <h2 id="guide-privacy" className="block-title">{t('guidePrivacy')}</h2>
        <ul className="dot-list">
          <li>{t('privacy1')}</li>
          <li>{t('privacy2', { n: SUPPRESSION_THRESHOLD - 1, threshold: SUPPRESSION_THRESHOLD })}</li>
          <li>{t('privacy3')}</li>
          <li>{t('privacy4', { n: SUPPRESSION_THRESHOLD })}</li>
        </ul>
      </section>
      </div>
      <div className="notice notice--info" role="note">
        <p className="notice-title">{t('nextStepTitle')}</p>
        <div className="notice-body"><p>{t('nextStepBody')}</p></div>
      </div>
    </div>
  )
}
