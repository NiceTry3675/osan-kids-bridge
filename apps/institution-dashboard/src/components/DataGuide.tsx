import { SUPPRESSION_THRESHOLD } from '../data/assumptions'
import { useLanguage } from '../i18n'

export function DataGuide() {
  const { t } = useLanguage()
  return (
    <div className="view guide">
      <div className="guide-grid">
        <section className="card" aria-labelledby="guide-collect">
          <h2 id="guide-collect">{t('guideCollected')}</h2>
          <table className="mini-table">
            <tbody>
              <tr><th scope="row">{t('guideDistrict')}</th><td>{t('guideDistrictValue')}</td></tr>
              <tr><th scope="row">{t('guideChildGrade')}</th><td>{t('guideChildGradeValue')}</td></tr>
              <tr><th scope="row">{t('guideTime')}</th><td>{t('guideTimeValue')}</td></tr>
              <tr><th scope="row">{t('guideInterest')}</th><td>{t('guideInterestValue')}</td></tr>
              <tr><th scope="row">{t('guideKoreanLevel')}</th><td>{t('guideKoreanLevelValue')}</td></tr>
              <tr><th scope="row">{t('guideLanguage')}</th><td>{t('guideLanguageValue')}</td></tr>
            </tbody>
          </table>
        </section>
        <section className="card" aria-labelledby="guide-not-collect">
          <h2 id="guide-not-collect">{t('guideNotCollected')}</h2>
          <ul className="plain-list">
            <li>{t('name')}</li>
            <li>{t('contact')}</li>
            <li>{t('address')}</li>
            <li>{t('origin')}</li>
          </ul>
        </section>
        <section className="card" aria-labelledby="guide-privacy">
          <h2 id="guide-privacy">{t('guidePrivacy')}</h2>
          <ul className="plain-list">
            <li>{t('privacy1')}</li>
            <li>{t('privacy2', { n: SUPPRESSION_THRESHOLD - 1, threshold: SUPPRESSION_THRESHOLD })}</li>
            <li>{t('privacy3')}</li>
            <li>{t('privacy4', { n: SUPPRESSION_THRESHOLD })}</li>
          </ul>
        </section>
      </div>
      <section className="card next-step" aria-labelledby="guide-next">
        <h2 id="guide-next">{t('nextStepTitle')}</h2>
        <p>{t('nextStepBody')}</p>
      </section>
    </div>
  )
}
