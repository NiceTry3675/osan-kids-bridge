import { useEffect, useId, useRef, useState } from 'react'
import './language-picker.css'

/**
 * 화면 언어 고르기.
 * - 고를 수 있는 언어는 그 언어의 이름으로 항상 화면 위에 보입니다(검색하지 않아도 고를 수 있음).
 * - "다른 언어"에서 언어 이름을 검색할 수 있고, 아직 제공하지 않거나 검수 중인 언어는 그 사실을 알려 줍니다.
 */
export type LanguageState = 'available' | 'draft' | 'in_review'

export interface LanguageOption<C extends string = string> {
  code: C
  /** 그 언어로 쓴 이름: 'Tiếng Việt', '中文' */
  native: string
  /** 검색에 쓰는 다른 이름들(한국어·영어·로마자 표기 등) */
  aliases: string[]
  /** available: 공개 / draft: 개발·시연에서만 여는 번역 초안 / in_review: 검수 중이라 열지 않음 */
  state: LanguageState
}

export interface LanguagePickerCopy {
  /** 버튼 묶음의 이름(화면 읽기 프로그램용) */
  label: string
  more: string
  title: string
  search: string
  close: string
  current: string
  draft: string
  inReview: string
  notOffered: string
  noMatch: string
}

/** 서비스가 아직 제공하지 않지만 검색될 수 있는 언어들 */
const NOT_OFFERED: { native: string; aliases: string[] }[] = [
  { native: 'English', aliases: ['영어', 'english', 'en', '英语', 'tieng anh'] },
  { native: 'ภาษาไทย', aliases: ['태국어', 'thai', 'th', '泰语', 'tieng thai'] },
  { native: 'Русский', aliases: ['러시아어', 'russian', 'ru', '俄语', 'tieng nga'] },
  { native: 'Монгол хэл', aliases: ['몽골어', 'mongolian', 'mn', '蒙古语', 'tieng mong co'] },
  { native: 'Filipino', aliases: ['필리핀어', '타갈로그어', 'tagalog', 'filipino', 'tl', '菲律宾语'] },
  { native: 'ភាសាខ្មែរ', aliases: ['캄보디아어', '크메르어', 'khmer', 'km', '高棉语'] },
  { native: 'Oʻzbekcha', aliases: ['우즈베크어', 'uzbek', 'uz', '乌兹别克语'] },
  { native: '日本語', aliases: ['일본어', 'japanese', 'ja', '日语', 'tieng nhat'] },
  { native: 'नेपाली', aliases: ['네팔어', 'nepali', 'ne', '尼泊尔语'] },
  { native: 'Bahasa Indonesia', aliases: ['인도네시아어', 'indonesian', 'id', '印尼语'] },
]

export function normalizeQuery(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLocaleLowerCase().trim()
}

const matches = (query: string, native: string, aliases: string[]) => {
  const term = normalizeQuery(query)
  if (!term) return true
  return [native, ...aliases].some((name) => normalizeQuery(name).includes(term))
}

export interface LanguageSearchResult<C extends string> {
  offered: LanguageOption<C>[]
  notOffered: string[]
}

export function searchLanguages<C extends string>(options: LanguageOption<C>[], query: string): LanguageSearchResult<C> {
  return {
    offered: options.filter((option) => matches(query, option.native, option.aliases)),
    notOffered: normalizeQuery(query) ? NOT_OFFERED.filter((item) => matches(query, item.native, item.aliases)).map((item) => item.native) : [],
  }
}

interface Props<C extends string> {
  value: C
  options: LanguageOption<C>[]
  onChange: (code: C) => void
  copy: LanguagePickerCopy
  /** 조용한 배경에 놓일 때 */
  tone?: 'band' | 'plain'
}

export function LanguagePicker<C extends string>({ value, options, onChange, copy, tone = 'band' }: Props<C>) {
  const [query, setQuery] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const selectable = options.filter((option) => option.state !== 'in_review')
  const result = searchLanguages(options, query)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onClose = () => moreRef.current?.focus()
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  const open = () => {
    setQuery('')
    dialogRef.current?.showModal?.()
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  const close = () => dialogRef.current?.close?.()
  const choose = (code: C) => { onChange(code); close() }

  return (
    <div className={`lp lp--${tone}`}>
      <div className="lp-strip" role="group" aria-label={copy.label}>
        {selectable.map((option) => (
          <button
            key={option.code}
            type="button"
            className="lp-choice"
            lang={langAttr(option.code)}
            aria-pressed={option.code === value}
            onClick={() => onChange(option.code)}
          >
            {option.native}
          </button>
        ))}
        <button ref={moreRef} type="button" className="lp-more" onClick={open} aria-haspopup="dialog" aria-label={copy.more}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" /></svg>
          <span className="lp-more-text" aria-hidden="true">{copy.more}</span>
        </button>
      </div>

      <dialog ref={dialogRef} className="lp-dialog" aria-labelledby={titleId} onClick={(event) => { if (event.target === event.currentTarget) close() }}>
        <div className="lp-sheet">
          <div className="lp-head">
            <h2 id={titleId}>{copy.title}</h2>
            <button type="button" className="lp-close" onClick={close} aria-label={copy.close}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <input
            ref={inputRef}
            className="lp-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.search}
            aria-label={copy.search}
          />
          <ul className="lp-list">
            {result.offered.map((option) => {
              const disabled = option.state === 'in_review'
              return (
                <li key={option.code}>
                  <button
                    type="button"
                    className="lp-row"
                    disabled={disabled}
                    aria-current={option.code === value ? 'true' : undefined}
                    onClick={() => choose(option.code)}
                  >
                    <span lang={langAttr(option.code)} className="lp-row-name">{option.native}</span>
                    <span className="lp-row-note">
                      {option.code === value ? copy.current : disabled ? copy.inReview : option.state === 'draft' ? copy.draft : ''}
                    </span>
                  </button>
                </li>
              )
            })}
            {result.notOffered.map((native) => (
              <li key={native} className="lp-row lp-row--off">
                <span className="lp-row-name">{native}</span>
                <span className="lp-row-note">{copy.notOffered}</span>
              </li>
            ))}
          </ul>
          {result.offered.length === 0 && result.notOffered.length === 0 && <p className="lp-empty" role="status">{copy.noMatch}</p>}
        </div>
      </dialog>
    </div>
  )
}

export function langAttr(code: string): string {
  return code === 'ko-easy' ? 'ko' : code
}
