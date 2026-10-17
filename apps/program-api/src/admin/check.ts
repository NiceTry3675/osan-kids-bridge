import { extractTokens, mergeTokens, TOKEN_LABELS } from '../poster/tokens'
import type { LockedTokens, TokenKind } from '../poster/tokens'
import type { ProgramRecord, UncertainTopic } from '../types'

// 공고 보완 초안의 코드 검사. AI 초안이 공고에 없는 값을 지어 넣지 못하게 한다:
// 기관만 아는 답은 {{빈칸}}으로 남겨야 하고, 빈칸 밖의 숫자·날짜·시각·전화·주소와 '무료/가능/제공' 같은 단정은 공고에서 확인된 글에 있어야 한다.

export type DraftKind = 'already_in_notice' | 'add_notice'

export interface DraftQuestion {
  question_ko: string
  topic: UncertainTopic
  /** 같은 질문을 알린 보호자 수 */
  count: number
}

export interface DraftItem {
  kind: DraftKind
  topic: UncertainTopic
  /** 이 항목이 답하는 보호자 질문 (질문 문장 그대로) */
  questions: string[]
  /** already_in_notice: 답이 담긴 원문 인용 */
  quote: string | null
  /** 공고에 덧붙일 문장. 기관만 아는 값은 {{빈칸 이름}} */
  draft: string | null
  /** 이 안내로 풀리는 '기관에 확인할 점' (문구 그대로) */
  resolves_items: string[]
  /** 담당자에게 보이는 한 문장 이유 */
  reason: string
}

export interface CheckContext {
  questions: string[]
  /** 지금 '기관에 확인할 점' 문구들 */
  items: string[]
  /** 공고에서 확인된 글 (근거 인용·안내 문장·기존 추가 안내·제목·대상) */
  sources: string[]
}

export interface DraftCheck {
  /** 항목별 문제 (items와 같은 순서) */
  problems: string[][]
  /** 어떤 항목도 다루지 않은 질문 */
  uncovered: string[]
}

export const MAX_DRAFT_LENGTH = 300
export const MAX_ITEMS = 8
const BLANK = /\{\{\s*([^{}]*?)\s*\}\}/g
/** 공고에서 확인되지 않으면 빈칸으로 둬야 하는 단정 표현 */
const CLAIMS = /무료|유료|공짜|참가비\s*(?:가\s*)?없|가능합니다|가능해요|불가능|불가합니다|안\s*됩니다|할\s*수\s*없습니다|할\s*수\s*있습니다|필요\s*없|제공(?:합니다|됩니다|해요|돼요)|지원(?:합니다|됩니다|해요|돼요)/g

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

export function sourceTexts(record: ProgramRecord): string[] {
  return [
    record.title,
    record.target_raw,
    ...record.evidence.filter((entry) => entry.verified).map((entry) => entry.quote),
    ...(record.notices ?? []),
    ...(record.addenda ?? []).map((addendum) => addendum.text),
  ].map(squash).filter(Boolean)
}

/** 초안의 빈칸 이름들 */
export function blanksOf(draft: string): string[] {
  return [...draft.matchAll(BLANK)].map((match) => match[1].trim())
}

const withoutBlanks = (draft: string) => draft.replace(BLANK, ' ')

/** 천 단위 쉼표를 뗀다 ('5,000원'을 숫자 5와 000이 아니라 5000으로 읽게) */
const plainNumbers = (text: string) => text.replace(/(\d),(?=\d{3}(?!\d))/g, '$1')

/** 초안(빈칸 밖)에만 있는 고정값 */
export function newTokens(draft: string, sources: string[]): { kind: TokenKind; values: string[] }[] {
  const allowed: LockedTokens = mergeTokens(sources.map((text) => extractTokens(plainNumbers(text), 'ko')))
  const found = extractTokens(plainNumbers(withoutBlanks(draft)), 'ko')
  return (Object.keys(TOKEN_LABELS) as TokenKind[])
    .map((kind) => ({ kind, values: found[kind].filter((value) => !allowed[kind].includes(value)) }))
    .filter((entry) => entry.values.length > 0)
}

/** 초안(빈칸 밖)의 단정 표현 중 공고에서 확인된 글에 없는 것 */
export function newClaims(draft: string, sources: string[]): string[] {
  const joined = sources.join('\n')
  const claims = [...withoutBlanks(draft).matchAll(CLAIMS)].map((match) => match[0])
  return [...new Set(claims)].filter((claim) => !joined.includes(claim.replace(/\s+/g, ' ')))
}

function checkText(draft: string, sources: string[]): string[] {
  const problems: string[] = []
  if (draft.length > MAX_DRAFT_LENGTH) problems.push(`문장이 너무 김 (${MAX_DRAFT_LENGTH}자 이하)`)
  if (blanksOf(draft).some((name) => !name)) problems.push('이름 없는 빈칸 {{}}이 있음')
  for (const { kind, values } of newTokens(draft, sources)) {
    problems.push(`공고에 없는 ${TOKEN_LABELS[kind]} ${values.join(', ')} → 기관이 정할 값이면 {{빈칸}}으로`)
  }
  for (const claim of newClaims(draft, sources)) problems.push(`공고에 없는 단정 '${claim}' → {{빈칸}}으로`)
  return problems
}

export function checkItem(item: DraftItem, context: CheckContext): string[] {
  const problems: string[] = []
  if (!item.questions.length) problems.push('다루는 보호자 질문이 없음')
  for (const question of item.questions) {
    if (!context.questions.includes(question)) problems.push(`질문 목록에 없는 문장: "${question}"`)
  }
  for (const entry of item.resolves_items) {
    if (!context.items.includes(entry)) problems.push(`'기관에 확인할 점' 목록에 없는 문구: "${entry}"`)
  }
  const draft = item.draft?.trim() ?? ''
  if (item.kind === 'already_in_notice') {
    const quote = squash(item.quote ?? '')
    if (!quote) problems.push('공고에 이미 있다면 그 원문 인용(quote)이 필요함')
    else if (!context.sources.some((source) => source.includes(quote))) problems.push('인용이 공고 원문(근거 인용·안내 문장)에 글자 그대로 없음')
    if (draft) {
      if (blanksOf(draft).length) problems.push('공고에 이미 있는 내용에는 빈칸을 두지 않음')
      problems.push(...checkText(draft, context.sources))
    }
  } else {
    if (!draft) problems.push('공고에 덧붙일 문장(draft)이 없음')
    else {
      if (!blanksOf(draft).length) problems.push('공고에 없는 답은 담당자가 채울 {{빈칸}}으로 남겨야 함')
      problems.push(...checkText(draft, context.sources))
    }
  }
  return problems
}

export function checkDraft(items: DraftItem[], context: CheckContext): DraftCheck {
  const covered = new Set(items.flatMap((item) => item.questions))
  return {
    problems: items.map((item) => checkItem(item, context)),
    uncovered: context.questions.filter((question) => !covered.has(question)),
  }
}

const TOPICS: UncertainTopic[] = ['family_eligibility', 'companion', 'korean_level', 'schedule', 'age_grade', 'materials', 'other']
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: unknown, max: number) => (Array.isArray(value) ? value : [])
  .filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()).slice(0, max)

/** 모델이 낸 항목들을 형식에 맞게 다듬는다. 형식이 틀린 항목은 버린다 */
export function parseDraftItems(raw: unknown): DraftItem[] {
  if (!Array.isArray(raw)) return []
  const items: DraftItem[] = []
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!isObject(entry)) continue
    const kind = entry.kind === 'already_in_notice' ? 'already_in_notice' : entry.kind === 'add_notice' ? 'add_notice' : null
    if (!kind) continue
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
    items.push({
      kind,
      topic: TOPICS.includes(entry.topic as UncertainTopic) ? entry.topic as UncertainTopic : 'other',
      questions: strings(entry.questions, 20),
      quote: text(entry.quote),
      draft: text(entry.draft),
      resolves_items: strings(entry.resolves_items, 10),
      reason: text(entry.reason) ?? '',
    })
  }
  return items
}
