import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import type { AvailableWindow, Interest, SearchFilters, Weekday } from '../../data/types'
import { emptyFilters } from '../../data/types'
import { INTEREST_VISUAL } from '../../lib/content'
import { DONGS, formatWindow, GRADES, INTERESTS, validateWindow, WEEKDAYS } from '../../lib/filters'
import { interestLabel, weekdayLabel } from '../../lib/format'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'

interface Props {
  open: boolean
  filters: SearchFilters
  onClose: () => void
  onApply: (filters: SearchFilters) => void
}

/**
 * 03 조건 넣기: 아이 → 시간 → 먼저 보기 → 무료를 시트 한 장에. 모두 선택이며 적용 전까지 목록은 그대로입니다.
 * 입력 중인 시간이 있으면 ‘맞는 프로그램 보기’를 누를 때 함께 넣습니다.
 */
export function ConditionSheet({ open, filters, onClose, onApply }: Props) {
  const i18n = useI18n()
  const { t } = i18n
  const [draft, setDraft] = useState(filters)
  const [pending, setPending] = useState<PendingTime>(EMPTY_PENDING)
  const [byAge, setByAge] = useState(false)
  const [ageText, setAgeText] = useState('')

  // 열 때마다 지금 적용된 조건에서 시작합니다.
  useEffect(() => {
    if (!open) return
    setDraft(filters)
    setPending(EMPTY_PENDING)
    setByAge(!!filters.child_age)
    setAgeText(filters.child_age ? String(filters.child_age) : '')
  }, [open, filters])

  const age = Number(ageText)
  const ageInvalid = byAge && ageText !== '' && !(Number.isInteger(age) && age >= 1 && age <= 18)

  const apply = () => {
    if (ageInvalid) return
    const next = pending.start || pending.end ? addWindow(draft, pending, setPending, i18n) : draft
    if (next) onApply(next)
  }

  const reset = () => { setDraft(emptyFilters()); setAgeText(''); setPending(EMPTY_PENDING) }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('fitTitle')}
      tall
      onSubmit={apply}
      footer={<>
        <button type="button" className="btn btn--ghost btn--lg" onClick={reset}>{t('resetFilters')}</button>
        <button type="submit" className="btn btn--primary btn--lg" disabled={ageInvalid}>{t('showMatches')}</button>
      </>}
    >
      <p className="sheet-intro">{t('filterIntro')}</p>
      <ChildField
        draft={draft} setDraft={setDraft} byAge={byAge} ageText={ageText} ageInvalid={ageInvalid}
        onToggleMode={() => { setByAge(!byAge); setAgeText(''); setDraft({ ...draft, child_age: undefined, child_grade: undefined }) }}
        onAge={(value) => {
          setAgeText(value)
          const number = Number(value)
          setDraft({ ...draft, child_grade: undefined, child_age: value && number >= 1 && number <= 18 ? number : undefined })
        }}
      />
      <TimeField draft={draft} setDraft={setDraft} pending={pending} setPending={setPending} />
      <PreferField draft={draft} setDraft={setDraft} />
      <label className="switch-row">
        <input type="checkbox" role="switch" checked={draft.free_only} onChange={(event) => setDraft({ ...draft, free_only: event.target.checked })} />
        <span className="switch" aria-hidden="true" />
        <span><strong>{t('freeOnly')}</strong><small>{t('freeHint')}</small></span>
      </label>
    </Sheet>
  )
}

type Draft = { draft: SearchFilters; setDraft: (filters: SearchFilters) => void }

interface ChildFieldProps extends Draft {
  byAge: boolean
  ageText: string
  ageInvalid: boolean
  onToggleMode: () => void
  onAge: (value: string) => void
}

function ChildField({ draft, setDraft, byAge, ageText, ageInvalid, onToggleMode, onAge }: ChildFieldProps) {
  const { t } = useI18n()
  return (
    <fieldset className="field">
      <legend>
        {byAge ? t('ageMode') : t('childTitle')}
        <button type="button" className="legend-link" onClick={onToggleMode}>{byAge ? t('byGrade') : t('byAge')}</button>
      </legend>
      {byAge ? (
        <label className="input-row">
          <span>{t('ageInput')}</span>
          <input inputMode="numeric" pattern="[0-9]*" className="input input--short" value={ageText} aria-invalid={ageInvalid}
            onChange={(event) => onAge(event.target.value.replace(/\D/g, '').slice(0, 2))} />
        </label>
      ) : (
        <div className="grades" role="radiogroup" aria-label={t('gradeMode')}>
          {GRADES.map((grade) => (
            <button key={grade} type="button" role="radio" aria-checked={draft.child_grade === grade} className="pick pick--round"
              aria-label={t('gradeOption', { grade })}
              onClick={() => setDraft({ ...draft, child_grade: draft.child_grade === grade ? undefined : grade, child_age: undefined })}>
              {grade}
            </button>
          ))}
        </div>
      )}
      {ageInvalid && <p className="field-error" role="alert">{t('ageError')}</p>}
    </fieldset>
  )
}

interface PendingTime { byDate: boolean; day: Weekday; date: string; start: string; end: string; error: string }
const EMPTY_PENDING: PendingTime = { byDate: false, day: 'sat', date: '', start: '', end: '', error: '' }

/** 입력 중인 시간을 조건에 더합니다. 성공하면 새 조건을, 실패하면 오류를 표시하고 null을 돌려줍니다. */
function addWindow(base: SearchFilters, pending: PendingTime, setPending: (value: PendingTime) => void, { locale, t }: ReturnType<typeof useI18n>): SearchFilters | null {
  const window: AvailableWindow = pending.byDate
    ? { date: pending.date, start_time: pending.start, end_time: pending.end }
    : { day_of_week: pending.day, start_time: pending.start, end_time: pending.end }
  const error = validateWindow(window, locale) ?? (base.available_windows.some((item) => JSON.stringify(item) === JSON.stringify(window)) ? t('duplicateTime') : null)
  if (error) { setPending({ ...pending, error }); return null }
  setPending({ ...pending, start: '', end: '', error: '' })
  return { ...base, available_windows: [...base.available_windows, window] }
}

interface TimeFieldProps extends Draft { pending: PendingTime; setPending: (value: PendingTime) => void }

function TimeField({ draft, setDraft, pending, setPending }: TimeFieldProps) {
  const i18n = useI18n()
  const { locale, t } = i18n
  const set = (patch: Partial<PendingTime>) => setPending({ ...pending, ...patch })
  return (
    <fieldset className="field">
      <legend>
        {t('timeTitle')}
        <button type="button" className="legend-link" onClick={() => set({ byDate: !pending.byDate })}>{pending.byDate ? t('everyWeek') : t('specificDate')}</button>
      </legend>
      <p className="field-hint">{t('timeHint')}</p>
      {pending.byDate ? (
        <input type="date" className="input" aria-label={t('dateField')} value={pending.date} onChange={(event) => set({ date: event.target.value })} />
      ) : (
        <div className="days" role="radiogroup" aria-label={t('weekdayField')}>
          {WEEKDAYS.map((day) => (
            <button key={day} type="button" role="radio" aria-checked={pending.day === day} className="pick pick--day" onClick={() => set({ day })}>{weekdayLabel(locale, day)}</button>
          ))}
        </div>
      )}
      <div className="time-row">
        <input type="time" step={60} className="input" aria-label={t('startField')} value={pending.start} onChange={(event) => set({ start: event.target.value })} />
        <span aria-hidden="true">~</span>
        <input type="time" step={60} className="input" aria-label={t('endField')} value={pending.end} onChange={(event) => set({ end: event.target.value })} />
        <button type="button" className="btn btn--secondary" onClick={() => { const next = addWindow(draft, pending, setPending, i18n); if (next) setDraft(next) }}>{t('add')}</button>
      </div>
      {pending.error && <p className="field-error" role="alert">{pending.error}</p>}
      {draft.available_windows.length > 0 && (
        <ul className="chips chips--tight">
          {draft.available_windows.map((window, index) => {
            const label = formatWindow(window, locale)
            return (
              <li key={label}>
                <button type="button" className="chip chip--on" aria-label={t('removeTime', { label })}
                  onClick={() => setDraft({ ...draft, available_windows: draft.available_windows.filter((_, at) => at !== index) })}>
                  {label}<Icon name="x" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}

function PreferField({ draft, setDraft }: Draft) {
  const { locale, t } = useI18n()
  const toggle = (interest: Interest) => setDraft({
    ...draft,
    interests: draft.interests.includes(interest) ? draft.interests.filter((item) => item !== interest) : [...draft.interests, interest],
  })
  return (
    <fieldset className="field">
      <legend>{t('preferTitle')}</legend>
      <p className="field-hint">{t('preferHint')}</p>
      <div className="chips">
        {INTERESTS.map((interest) => (
          <button key={interest} type="button" className="chip chip--pick" aria-pressed={draft.interests.includes(interest)} onClick={() => toggle(interest)}>
            <span aria-hidden="true">{INTEREST_VISUAL[interest].emoji}</span>{interestLabel(locale, interest)}
          </button>
        ))}
      </div>
      <select className="input select-dong" aria-label={t('dongTitle')} value={draft.dong ?? ''} onChange={(event) => setDraft({ ...draft, dong: event.target.value || undefined })}>
        <option value="">{t('dongTitle')} · {t('notSet')}</option>
        {DONGS.map((dong) => <option key={dong} value={dong}>{dong}</option>)}
      </select>
    </fieldset>
  )
}
