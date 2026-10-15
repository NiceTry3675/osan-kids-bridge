import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import type { AvailableWindow, Interest, SearchFilters, Weekday } from '../data/types'
import { emptyFilters } from '../data/types'
import { DONGS, formatWindow, interestLabel, INTERESTS, validateWindow, weekdayLabel, WEEKDAYS } from '../lib/format'
import { INTEREST_VISUAL } from '../lib/visual'
import { Icon } from '../components/bits'

interface Props {
  open: boolean
  filters: SearchFilters
  onClose: () => void
  onApply: (filters: SearchFilters) => void
}

const GRADES = [1, 2, 3, 4, 5, 6]

/** 조건 넣기 시트 하나: 아이 → 시간 → 먼저 보기 → 무료. 모두 선택이며 적용 전까지 목록은 그대로입니다. */
export function ConditionSheet({ open, filters, onClose, onApply }: Props) {
  const { locale, t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [draft, setDraft] = useState(filters)
  const [byAge, setByAge] = useState(!!filters.child_age)
  const [ageText, setAgeText] = useState(filters.child_age ? String(filters.child_age) : '')
  const [dateMode, setDateMode] = useState(false)
  const [day, setDay] = useState<Weekday>('sat')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [timeError, setTimeError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setDraft(filters)
      setByAge(!!filters.child_age)
      setAgeText(filters.child_age ? String(filters.child_age) : '')
      setStart(''); setEnd(''); setDate(''); setTimeError('')
      dialog.showModal?.()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, filters])

  const ageNumber = Number(ageText)
  const ageInvalid = byAge && ageText !== '' && !(Number.isInteger(ageNumber) && ageNumber >= 1 && ageNumber <= 18)

  const commitWindow = (base: SearchFilters): SearchFilters | null => {
    const window: AvailableWindow = dateMode ? { date, start_time: start, end_time: end } : { day_of_week: day, start_time: start, end_time: end }
    const error = validateWindow(window, locale)
    if (error) { setTimeError(error); return null }
    if (base.available_windows.some((item) => JSON.stringify(item) === JSON.stringify(window))) { setTimeError(t('duplicateTime')); return null }
    setTimeError(''); setStart(''); setEnd('')
    return { ...base, available_windows: [...base.available_windows, window] }
  }

  const apply = () => {
    if (ageInvalid) return
    let next = draft
    if (start || end) { const committed = commitWindow(draft); if (!committed) return; next = committed }
    onApply(next)
  }

  const toggleInterest = (interest: Interest) => setDraft({
    ...draft,
    interests: draft.interests.includes(interest) ? draft.interests.filter((item) => item !== interest) : [...draft.interests, interest],
  })

  return (
    <dialog ref={dialogRef} className="sheet sheet--tall" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="sheet-inner" onSubmit={(event) => { event.preventDefault(); apply() }}>
        <div className="grab" aria-hidden="true" />
        <header className="sheet-head">
          <h2 id={titleId}>{t('fitTitle')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}><Icon name="x" /></button>
        </header>
        <div className="sheet-body">
          <p className="sheet-intro">{t('filterIntro')}</p>

          <fieldset className="field">
            <legend>
              {byAge ? t('ageMode') : t('childTitle')}
              <button type="button" className="legend-link" onClick={() => { setByAge(!byAge); setAgeText(''); setDraft({ ...draft, child_age: undefined, child_grade: undefined }) }}>
                {byAge ? t('byGrade') : t('byAge')}
              </button>
            </legend>
            {byAge ? (
              <label className="input-row">
                <span>{t('ageInput')}</span>
                <input inputMode="numeric" pattern="[0-9]*" className="input input--short" value={ageText} aria-invalid={ageInvalid}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D/g, '').slice(0, 2)
                    setAgeText(value)
                    const age = Number(value)
                    setDraft({ ...draft, child_grade: undefined, child_age: value && age >= 1 && age <= 18 ? age : undefined })
                  }} />
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

          <fieldset className="field">
            <legend>
              {t('timeTitle')}
              <button type="button" className="legend-link" onClick={() => setDateMode(!dateMode)}>{dateMode ? t('everyWeek') : t('specificDate')}</button>
            </legend>
            <p className="field-hint">{t('timeHint')}</p>
            {dateMode ? (
              <input type="date" className="input" aria-label={t('dateField')} value={date} onChange={(event) => setDate(event.target.value)} />
            ) : (
              <div className="days" role="radiogroup" aria-label={t('weekdayField')}>
                {WEEKDAYS.map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={day === value} className="pick pick--day" onClick={() => setDay(value)}>{weekdayLabel(locale, value)}</button>
                ))}
              </div>
            )}
            <div className="time-row">
              <input type="time" step={60} className="input" aria-label={t('startField')} value={start} onChange={(event) => setStart(event.target.value)} />
              <span aria-hidden="true">~</span>
              <input type="time" step={60} className="input" aria-label={t('endField')} value={end} onChange={(event) => setEnd(event.target.value)} />
              <button type="button" className="btn btn--secondary" onClick={() => { const next = commitWindow(draft); if (next) setDraft(next) }}>{t('add')}</button>
            </div>
            {timeError && <p className="field-error" role="alert">{timeError}</p>}
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

          <fieldset className="field">
            <legend>{t('preferTitle')}</legend>
            <p className="field-hint">{t('preferHint')}</p>
            <div className="chips">
              {INTERESTS.map((interest) => (
                <button key={interest} type="button" className="chip chip--pick" aria-pressed={draft.interests.includes(interest)} onClick={() => toggleInterest(interest)}>
                  <span aria-hidden="true">{INTEREST_VISUAL[interest].emoji}</span>{interestLabel(locale, interest)}
                </button>
              ))}
            </div>
            <select className="input select-dong" aria-label={t('dongTitle')} value={draft.dong ?? ''} onChange={(event) => setDraft({ ...draft, dong: event.target.value || undefined })}>
              <option value="">{t('dongTitle')} · {t('notSet')}</option>
              {DONGS.map((dong) => <option key={dong} value={dong}>{dong}</option>)}
            </select>
          </fieldset>

          <label className="switch-row">
            <input type="checkbox" role="switch" checked={draft.free_only} onChange={(event) => setDraft({ ...draft, free_only: event.target.checked })} />
            <span className="switch" aria-hidden="true" />
            <span><strong>{t('freeOnly')}</strong><small>{t('freeHint')}</small></span>
          </label>
        </div>
        <footer className="sheet-foot">
          <button type="button" className="btn btn--ghost btn--lg" onClick={() => { setDraft(emptyFilters()); setAgeText(''); setStart(''); setEnd(''); setTimeError('') }}>{t('resetFilters')}</button>
          <button type="submit" className="btn btn--primary btn--lg" disabled={ageInvalid}>{t('showMatches')}</button>
        </footer>
      </form>
    </dialog>
  )
}
