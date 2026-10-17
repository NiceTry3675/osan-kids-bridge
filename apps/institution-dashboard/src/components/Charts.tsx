import { heatLegend, heatLevel, safePercent, DAY_PARTS, WEEKDAYS, DAY_PART_HOURS, SUPPRESSION_THRESHOLD } from '@osan-kids-bridge/planning'
import type { SafeCount, SlotKey } from '@osan-kids-bridge/planning'
import { localizedCount, localizedDay, localizedPart, localizedSlot, useLanguage } from '../i18n'

const pad = (hour: number) => String(hour).padStart(2, '0')

interface HeatmapProps {
  counts: Record<SlotKey, SafeCount>
  max: number
  caption: string
  /** 칸 위에 붙일 표시(예: 추천 반 번호) */
  marks?: Partial<Record<SlotKey, string[]>>
  /** 기존 계획이 쓰는 칸 */
  baselineSlots?: SlotKey[]
  compact?: boolean
}

/** 요일 × 시간대 7×3 히트맵. 모든 칸에 숫자(또는 "5 미만")를 함께 적어 색만으로 읽지 않게 합니다. */
export function Heatmap({ counts, max, caption, marks, baselineSlots = [], compact }: HeatmapProps) {
  const { t } = useLanguage()
  return (
    <figure className={`heatmap-figure${compact ? ' compact' : ''}`}>
      <div className="heatmap" role="table" aria-label={caption}>
        <div role="row" className="heat-row">
          <span role="columnheader" className="heat-corner"><span className="visually-hidden">{t('time')}</span></span>
          {WEEKDAYS.map((day) => <span key={day} role="columnheader" className={`heat-col${day === 'sat' || day === 'sun' ? ' weekend' : ''}`}>{localizedDay(day, t)}</span>)}
        </div>
        {DAY_PARTS.map((part) => (
          <div key={part} role="row" className="heat-row">
            <span role="rowheader" className="heat-rowhead">{localizedPart(part, t)}<small>{pad(DAY_PART_HOURS[part][0])}~{pad(DAY_PART_HOURS[part][1])}</small></span>
            {WEEKDAYS.map((day) => {
              const slot = `${day}-${part}` as SlotKey
              const count = counts[slot]
              const level = count.suppressed ? 'suppressed' : `level-${heatLevel(count.value, max)}`
              const badges = marks?.[slot] ?? []
              const isBaseline = baselineSlots.includes(slot)
              const label = localizedSlot(slot, t) + ' ' + localizedCount(count, t) + (badges.length ? ', ' + t('recommended') : '') + (isBaseline ? ', ' + t('existing') : '')
              return (
                <div key={slot} role="cell" className={`heat-cell ${level}${badges.length ? ' heat-marked' : ''}${isBaseline ? ' baseline' : ''}`} title={label}>
                  <span className="visually-hidden">{label}</span>
                  <span className="heat-value" aria-hidden="true">{localizedCount(count, t, 'short')}</span>
                  {(badges.length > 0 || isBaseline) && (
                    <span className="heat-badges" aria-hidden="true">
                      {badges.map((badge) => <span key={badge} className="heat-badge">{badge}</span>)}
                      {isBaseline && <span className="heat-badge outline">{t('existing')}</span>}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <figcaption className="heat-legend">
        <span className="legend-title">{t('householdCount')}</span>
        <span className="legend-item"><i className="swatch level-0" aria-hidden="true" />0</span>
        <span className="legend-item"><i className="swatch suppressed" aria-hidden="true" />{t('below', { n: SUPPRESSION_THRESHOLD })}</span>
        {heatLegend(max).map(({ level, from, to }) => (
          <span key={level} className="legend-item"><i className={`swatch level-${level}`} aria-hidden="true" />{from === to ? from : `${from}~${to}`}</span>
        ))}
      </figcaption>
    </figure>
  )
}

export interface BarItem { key: string; label: string; count: SafeCount; tone?: 'muted' }

/** 가로 막대 목록. 억제된 항목은 길이를 드러내지 않도록 빗금 짧은 막대와 "5 미만"(보조 억제는 "가림")으로 표시합니다. */
export function BarList({ items, total, label }: { items: BarItem[]; total: number; label: string }) {
  const { t } = useLanguage()
  const max = Math.max(1, ...items.map(({ count }) => (count.suppressed ? 0 : count.value)))
  const masked = items.some(({ count }) => count.suppressed && count.masked)
  return (
    <>
      <ul className="bar-list" aria-label={label}>
        {items.map(({ key, label: itemLabel, count, tone }) => {
          const share = safePercent(count, total)
          return (
            <li key={key} className="bar-row">
              <span className="bar-label">{itemLabel}</span>
              <span className="bar-track" aria-hidden="true">
                <span className={`bar-fill${count.suppressed ? ' suppressed' : ''}${tone ? ` ${tone}` : ''}`} style={{ width: count.suppressed ? '8px' : `${(count.value / max) * 100}%` }} />
              </span>
              <span className="bar-value">{localizedCount(count, t)}{share !== null && <small> {share}%</small>}</span>
            </li>
          )
        })}
      </ul>
      {masked && <p className="muted masked-note">{t('maskedNote')}</p>}
    </>
  )
}

export function InsufficientPanel({ onReset, resetLabel }: { onReset?: () => void; resetLabel?: string }) {
  const { t } = useLanguage()
  return (
    <div className="state" role="status">
      <p className="state-title">{t('insufficientTitle')}</p>
      <p className="state-hint">{t('insufficientText', { n: SUPPRESSION_THRESHOLD })}</p>
      {onReset && <button className="btn btn--secondary" type="button" onClick={onReset}>{resetLabel ?? t('reset')}</button>}
    </div>
  )
}
