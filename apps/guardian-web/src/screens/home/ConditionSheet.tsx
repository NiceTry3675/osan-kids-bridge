import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useI18n } from '../../i18n'
import { searchPrograms } from '../../data/api'
import type { AvailableWindow, SearchFilters, Weekday } from '../../data/types'
import { emptyFilters } from '../../data/types'
import { likelyCount } from '../../lib/content'
import { DONGS, dongOption, formatWindow, schoolOf, SCHOOLS, selectionFrom, TIME_PARTS, uniqueWindows, validateWindow, WEEKDAYS, windowsFrom } from '../../lib/filters'
import type { School, TimePart } from '../../lib/filters'
import { gradeLabel, weekdayLabel } from '../../lib/format'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'

interface Props {
  open: boolean
  filters: SearchFilters
  onClose: () => void
  onApply: (filters: SearchFilters) => void
  /** 있으면 결과 개수 대신 이 글자를 버튼에 씁니다(상세에서 이 공고와 비교할 때) */
  submitLabel?: string
}

/**
 * 03 조건 넣기: 아이 → 시간 → 무료 → 사는 동을 시트 한 장에. 모두 선택이며 적용 전까지 목록은 그대로입니다.
 * 분야는 홈 위쪽 줄에서 고릅니다. 입력 중인 직접 시간이 있으면 ‘보기’를 누를 때 함께 넣습니다.
 * 버튼에 결과 개수를 미리 보여 줘, 눌렀다가 0개여서 되돌아오는 일을 줄입니다.
 */
/** 칸 안의 시계 단추는 숨겼으므로(sheet.css) 마우스로 누르면 시계를 직접 연다. 휴대폰은 누르면 원래 시계가 뜬다 */
const openTimePicker = (event: MouseEvent<HTMLInputElement>) => {
  if (!window.matchMedia?.('(pointer: fine)').matches) return
  try { event.currentTarget.showPicker?.() } catch { /* 지원하지 않는 브라우저는 키보드로 입력 */ }
}

/** 고른 조건이면 몇 개가 나오는지. 빠르게 바꿔도 마지막 조건만 묻습니다. */
function usePreviewCount(open: boolean, filters: SearchFilters): number | 'loading' | null {
  const { locale } = useI18n()
  const [count, setCount] = useState<number | 'loading' | null>('loading')
  const key = JSON.stringify(filters)
  useEffect(() => {
    if (!open) return
    // 새 결과가 오기 전까지 이전 숫자를 보여 주지 않습니다. 틀린 숫자를 믿고 누르지 않도록요.
    setCount('loading')
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchPrograms(filters, locale, controller.signal)
        .then((data) => setCount(likelyCount(data, filters)))
        .catch(() => { if (!controller.signal.aborted) setCount(null) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
    // key가 filters를 담고 있습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, locale])
  return count
}

export function ConditionSheet({ open, filters, onClose, onApply, submitLabel }: Props) {
  const i18n = useI18n()
  const { t } = i18n
  const [draft, setDraft] = useState(filters)
  const [days, setDays] = useState<Weekday[]>([])
  const [parts, setParts] = useState<TimePart[]>([])
  const [pending, setPending] = useState<PendingTime>(EMPTY_PENDING)
  const [byAge, setByAge] = useState(false)
  const [ageText, setAgeText] = useState('')

  // 열 때마다 지금 적용된 조건에서 시작합니다. 가능 시간은 요일·시간대 선택으로 되살립니다.
  useEffect(() => {
    if (!open) return
    const selection = selectionFrom(filters.available_windows)
    setDraft({ ...filters, available_windows: selection.custom })
    setDays(selection.days)
    setParts(selection.parts)
    setPending(EMPTY_PENDING)
    setByAge(!!filters.child_age)
    setAgeText(filters.child_age ? String(filters.child_age) : '')
  }, [open, filters])

  const age = Number(ageText)
  const ageInvalid = byAge && ageText !== '' && !(Number.isInteger(age) && age >= 1 && age <= 18)
  const withTimes = (base: SearchFilters): SearchFilters => ({ ...base, available_windows: uniqueWindows([...windowsFrom(days, parts), ...base.available_windows]) })
  const count = usePreviewCount(open && !ageInvalid && !submitLabel, withTimes(draft))

  const apply = () => {
    if (ageInvalid) return
    const next = pending.start || pending.end ? addWindow(draft, pending, setPending, i18n) : draft
    if (next) onApply(withTimes(next))
  }

  // 분야는 홈 위쪽 줄에서 고르는 것이라 그대로 둡니다.
  const reset = () => { setDraft({ ...emptyFilters(), interests: draft.interests }); setDays([]); setParts([]); setByAge(false); setAgeText(''); setPending(EMPTY_PENDING) }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('fitTitle')}
      tall
      onSubmit={apply}
      footer={<>
        <button type="button" className="btn btn--ghost btn--lg" onClick={reset}>{t('resetFilters')}</button>
        <button type="submit" className="btn btn--primary btn--lg" disabled={ageInvalid} aria-live="polite">
          {submitLabel ?? (count === null ? t('showMatches') : count === 'loading' ? t('showMatchesCount', { count: '…' }) : count === 0 ? t('noMatchesCount') : t('showMatchesCount', { count }))}
        </button>
      </>}
    >
      <ChildField
        draft={draft} setDraft={setDraft} byAge={byAge} ageText={ageText} ageInvalid={ageInvalid}
        onToggleMode={() => { setByAge(!byAge); setAgeText(''); setDraft({ ...draft, child_age: undefined, child_grade: undefined }) }}
        onAge={(value) => {
          setAgeText(value)
          const number = Number(value)
          setDraft({ ...draft, child_grade: undefined, child_age: value && number >= 1 && number <= 18 ? number : undefined })
        }}
      />
      <TimeField draft={draft} setDraft={setDraft} days={days} setDays={setDays} parts={parts} setParts={setParts} pending={pending} setPending={setPending} />
      <label className="switch-row">
        <input type="checkbox" role="switch" checked={draft.free_only} onChange={(event) => setDraft({ ...draft, free_only: event.target.checked })} />
        <span className="switch" aria-hidden="true" />
        <span><strong>{t('freeOnly')}</strong><small>{t('freeHint')}</small></span>
      </label>
      <DongField draft={draft} setDraft={setDraft} />
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

const SCHOOL_KEY = { elementary: 'schoolElementary', middle: 'schoolMiddle', high: 'schoolHigh' } as const

function ChildField({ draft, setDraft, byAge, ageText, ageInvalid, onToggleMode, onAge }: ChildFieldProps) {
  const { locale, t } = useI18n()
  const [school, setSchool] = useState<School>(schoolOf(draft.child_grade))
  useEffect(() => { if (draft.child_grade !== undefined) setSchool(schoolOf(draft.child_grade)) }, [draft.child_grade])
  const current = SCHOOLS.find((item) => item.school === school) ?? SCHOOLS[0]
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
        <>
          <div className="school-row" role="radiogroup" aria-label={t('childTitle')}>
            {SCHOOLS.map((item) => (
              <button key={item.school} type="button" role="radio" aria-checked={school === item.school} className="pick pick--day"
                onClick={() => { setSchool(item.school); if (school !== item.school) setDraft({ ...draft, child_grade: undefined, child_age: undefined }) }}>
                {t(SCHOOL_KEY[item.school])}
              </button>
            ))}
          </div>
          <div className="grades" role="radiogroup" aria-label={t('gradeMode')}>
            {current.grades.map((grade) => (
              <button key={grade} type="button" role="radio" aria-checked={draft.child_grade === grade} className="pick pick--round"
                aria-label={gradeLabel(locale, grade)}
                onClick={() => setDraft({ ...draft, child_grade: draft.child_grade === grade ? undefined : grade, child_age: undefined })}>
                {grade - current.offset}
              </button>
            ))}
          </div>
        </>
      )}
      {ageInvalid && <p className="field-error" role="alert">{t('ageError')}</p>}
    </fieldset>
  )
}

interface PendingTime { byDate: boolean; day: Weekday; date: string; start: string; end: string; error: string }
const EMPTY_PENDING: PendingTime = { byDate: false, day: 'sat', date: '', start: '', end: '', error: '' }

/** 직접 넣은 시간을 조건에 더합니다. 성공하면 새 조건을, 실패하면 오류를 표시하고 null을 돌려줍니다. */
function addWindow(base: SearchFilters, pending: PendingTime, setPending: (value: PendingTime) => void, { locale, t }: ReturnType<typeof useI18n>): SearchFilters | null {
  const window: AvailableWindow = pending.byDate
    ? { date: pending.date, start_time: pending.start, end_time: pending.end }
    : { day_of_week: pending.day, start_time: pending.start, end_time: pending.end }
  const error = validateWindow(window, locale) ?? (base.available_windows.some((item) => JSON.stringify(item) === JSON.stringify(window)) ? t('duplicateTime') : null)
  if (error) { setPending({ ...pending, error }); return null }
  setPending({ ...pending, start: '', end: '', error: '' })
  return { ...base, available_windows: [...base.available_windows, window] }
}

const PART_KEY = { morning: 'timeMorning', afternoon: 'timeAfternoon', evening: 'timeEvening' } as const

interface TimeFieldProps extends Draft {
  days: Weekday[]
  setDays: (days: Weekday[]) => void
  parts: TimePart[]
  setParts: (parts: TimePart[]) => void
  pending: PendingTime
  setPending: (value: PendingTime) => void
}

/** 요일과 시간대를 눌러서 고릅니다. 분 단위 시각이나 특정 날짜는 ‘시간을 직접 넣기’에서 넣습니다. */
function TimeField({ draft, setDraft, days, setDays, parts, setParts, pending, setPending }: TimeFieldProps) {
  const i18n = useI18n()
  const { locale, t } = i18n
  const set = (patch: Partial<PendingTime>) => setPending({ ...pending, ...patch })
  const toggleDay = (day: Weekday) => setDays(days.includes(day) ? days.filter((item) => item !== day) : [...days, day])
  const togglePart = (part: TimePart) => setParts(parts.includes(part) ? parts.filter((item) => item !== part) : [...parts, part])
  return (
    <fieldset className="field">
      <legend>{t('timeTitle')}</legend>
      <div className="days" role="group" aria-label={t('weekdayField')}>
        {WEEKDAYS.map((day) => (
          <button key={day} type="button" role="checkbox" aria-checked={days.includes(day)} className="pick pick--day" onClick={() => toggleDay(day)}>{weekdayLabel(locale, day)}</button>
        ))}
      </div>
      <div className="time-parts" role="group" aria-label={t('timeTitle')}>
        {TIME_PARTS.map((part) => (
          <button key={part} type="button" role="checkbox" aria-checked={parts.includes(part)} className="pick pick--day" onClick={() => togglePart(part)}>{t(PART_KEY[part])}</button>
        ))}
      </div>
      <details className="time-custom" open={draft.available_windows.length > 0 || undefined}>
        <summary>{t('customTime')}</summary>
        <p className="field-hint">{t('timeHint')}</p>
        <button type="button" className="legend-link" onClick={() => set({ byDate: !pending.byDate })}>{pending.byDate ? t('everyWeek') : t('specificDate')}</button>
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
          <input type="time" step={60} className="input" aria-label={t('startField')} value={pending.start} onChange={(event) => set({ start: event.target.value })} onClick={openTimePicker} />
          <span aria-hidden="true">~</span>
          <input type="time" step={60} className="input" aria-label={t('endField')} value={pending.end} onChange={(event) => set({ end: event.target.value })} onClick={openTimePicker} />
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
      </details>
    </fieldset>
  )
}

function DongField({ draft, setDraft }: Draft) {
  const { locale, t } = useI18n()
  return (
    <fieldset className="field">
      <legend>{t('dongTitle')}</legend>
      <p className="field-hint">{t('dongHint')}</p>
      <select className="input select-dong" aria-label={t('dongTitle')} value={draft.dong ?? ''} onChange={(event) => setDraft({ ...draft, dong: event.target.value || undefined })}>
        <option value="">{t('notSet')}</option>
        {DONGS.map((dong) => <option key={dong} value={dong}>{dongOption(dong, locale)}</option>)}
      </select>
    </fieldset>
  )
}
