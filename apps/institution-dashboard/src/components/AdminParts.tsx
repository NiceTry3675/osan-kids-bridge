import type { ReactNode } from 'react'
import type { PosterBrief, PosterLanguage, ReviewStatus, SummaryLanguage, SummaryState } from '../data/admin'
import { useLanguage } from '../i18n'
import type { ProgramsState } from '../App'
import { Icon } from './icons'

// 관리자 화면 여러 곳에서 쓰는 작은 조각: 검수 상태, 언어별 요약·번역 포스터 상태, 숫자 카드, 서버 없음 안내

const REVIEW_KEYS = { pending: 'reviewPending', approved: 'reviewApproved', stale: 'reviewStale', rejected: 'reviewRejected' } as const

export function ReviewChip({ status }: { status: ReviewStatus }) {
  const { t } = useLanguage()
  return <span className={`tag tag--${status}`}><span className="tag-dot" aria-hidden="true" />{t(REVIEW_KEYS[status])}</span>
}

const SUMMARY_KEYS = { approved: 'summaryApproved', machine_checked: 'summaryChecked', machine_draft: 'summaryDraft', withdrawn: 'summaryWithdrawn' } as const
const LANGUAGE_SHORT: Record<SummaryLanguage, string> = { 'ko-easy': 'KO', vi: 'VI', zh: 'ZH' }

export function SummaryChips({ summaries }: { summaries: Partial<Record<SummaryLanguage, SummaryState>> }) {
  const { t } = useLanguage()
  const languages = (['ko-easy', 'vi', 'zh'] as SummaryLanguage[]).filter((language) => summaries[language])
  if (!languages.length) return <span className="muted">-</span>
  return <span className="lang-chips">{languages.map((language) => {
    const state = summaries[language]!
    return <span key={language} className={`lang-chip lang-chip--${state}`} title={t(SUMMARY_KEYS[state])}>
      {LANGUAGE_SHORT[language]}<span className="visually-hidden"> {t(SUMMARY_KEYS[state])}</span>
    </span>
  })}</span>
}

export function PosterChips({ posters }: { posters: Partial<Record<PosterLanguage, PosterBrief>> }) {
  const { t } = useLanguage()
  const languages = (['vi', 'zh'] as PosterLanguage[]).filter((language) => posters[language])
  if (!languages.length) return <span className="muted">-</span>
  return <span className="lang-chips">{languages.map((language) => {
    const poster = posters[language]!
    const label = poster.status === 'approved' ? t('posterApproved') : poster.status === 'failed' ? t('posterFailed') : t('posterChecked', { n: poster.chosen_attempt ?? poster.attempts })
    return <span key={language} className={`lang-chip lang-chip--poster-${poster.status}`} title={label}>
      {LANGUAGE_SHORT[language]}<span className="visually-hidden"> {label}</span>
    </span>
  })}</span>
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'mark' | 'action' }) {
  return <div className={`kpi${tone ? ` kpi--${tone}` : ''}`}>
    <p className="kpi-label">{label}</p>
    <p className="kpi-value">{value}</p>
    {hint && <p className="kpi-hint">{hint}</p>}
  </div>
}

/** 관리자 API를 쓸 수 없을 때: 서버 주소 없음 · 관리자 API 꺼짐 · 연결 실패 */
export function AdminUnavailable({ state, onRetry }: { state: Exclude<ProgramsState, { status: 'ready' }>; onRetry?: () => void }) {
  const { t } = useLanguage()
  if (state.status === 'loading') return <div className="state" role="status"><span className="spinner" aria-hidden="true" /><p className="state-hint">{t('loading')}</p></div>
  const [title, hint] = state.status === 'no-api' ? [t('noApiTitle'), t('noApiHint')]
    : state.adminOff ? [t('adminOffTitle'), t('adminOffHint')] : [t('apiErrorTitle'), t('apiErrorHint')]
  return <div className="state card">
    <p className="state-title">{title}</p>
    <p className="state-hint">{hint}</p>
    {state.status === 'error' && onRetry && <button type="button" className="btn btn--secondary" onClick={onRetry}><Icon name="refresh" />{t('retry')}</button>}
  </div>
}

/** 2026-10-15T01:00:00Z → 10. 15. 10:00 (서울) */
export function shortStamp(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
