import { extractTokens, mergeTokens } from '../poster/tokens'
import type { LockedTokens, TokenKind } from '../poster/tokens'
import type { ProgramRecord, UncertainTopic } from '../types'

// 공고 보완 초안의 코드 검사. AI 초안이 공고에 없는 값을 지어 넣지 못하게 한다.
// - 공고에 덧붙일 안내(add_notice): 답은 기관만 알므로 {{빈칸}}으로 남긴다. 빈칸 밖에는 '무료/가능합니다/제공해요' 같은 단정을 쓸 수 없고,
//   숫자·날짜·시각·전화·인터넷 주소와 '3명' 같은 수량은 공고에서 확인된 글에 있는 것만 다시 쓸 수 있다.
//   빈칸 이름도 채울 항목의 이름만 쓴다. '{{참가비 (예: 무료)}}'처럼 예시나 답을 넣으면 담당자가 AI의 값을 그대로 옮겨 적게 된다.
// - 공고에 이미 있는 답(already_in_notice): 다시 쓴 문장의 고정값·수량·단정은 인용한 원문 문장에 있어야 하고,
//   단정의 대상 낱말('참가비는 무료')도 그 문장에 있어야 한다('주차는 무료'를 근거로 '참가비는 무료'라고 쓰지 못하게).

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
/** 답을 단정하는 표현 (합쇼체·해요체). 공고에 없는 답에서는 빈칸 밖에 쓸 수 없다 */
const CLAIMS = /무료|유료|공짜|불가(?:능)?|가능(?:합니다|해요|하다|함|하며|하고|해)|안\s*(?:됩니다|돼요|된다|돼)|도\s*(?:됩니다|돼요|된다|괜찮)|수\s*(?:있|없)(?:습니다|어요|다|음|으며|고)|없(?:습니다|어요|음)|제공(?:합니다|됩니다|해요|돼요|함)|지원(?:합니다|됩니다|해요|돼요|함)|필요(?:합니다|해요|하다|함|\s*없)/g
/** 단위가 붙은 수량 ('3명', '1만 원'). 숫자만 같고 단위가 다르면('3층'과 '3명') 다른 값이다. 날짜·시각('23일', '30분')은 고정값 검사가 맡는다 */
const QUANTITY = /(\d[\d,]*)\s*(만\s*원|천\s*원|원|명|세|살|회|층|학년|시간|개월|개|팀|가족|가정|반)/g
/** 빈칸 이름 속 예시 표시 ('예: 무료', '예) 운동화', '예시', 'e.g.') */
const EXAMPLE_MARK = /예\s*[:)）]|예시|\be\.\s?g\.|\bex[.)]|for example/i
/** 빈칸 이름 속 괄호에 든 후보 목록 ('(운동화, 물병 등)', '(가능/불가)', '(무료 또는 유료)') */
const CANDIDATE_LIST = /[(（][^()（）]*(?:[,/·、]|또는|혹은|\s등)[^()（）]*[)）]/
/** 빈칸 이름이 답 자체인 경우 ('{{무료}}', '{{필요 없음}}'). '무료 여부', '괜찮은지'처럼 묻는 꼴은 이름이다 */
const ANSWER = new RegExp(`(?:${CLAIMS.source})(?![가-힣]*(?:\\s*(?:여부|유무)|지(?![가-힣])))`)
/** 낱말 하나로 된 답 ('{{가능}}', '{{없음}}') */
const BARE_ANSWER = /^(?:가능|불가|있음|없음|해당\s*없음|예|아니요|[OoXx])$/
/** '이름: 값' 꼴 ('{{참가비: 5,000원}}') */
const LABELED_VALUE = /[:：]\s*\S/
const LABELS: Record<TokenKind, string> = { phones: '전화번호', times: '시각', dates: '날짜', numbers: '숫자', urls: '인터넷 주소' }
const PARTICLE = /(?:에서는|에서|으로|까지|부터|은|는|이|가|을|를|도|에|의|와|과|로|만)$/

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

const quantities = (text: string) => [...plainNumbers(text).matchAll(QUANTITY)].map((match) => `${match[1]}${match[2].replace(/\s+/g, '')}`)

/** 초안(빈칸 밖)에만 있는 고정값과 수량 */
export function newTokens(draft: string, sources: string[]): { kind: TokenKind | 'quantities'; values: string[] }[] {
  const allowed: LockedTokens = mergeTokens(sources.map((text) => extractTokens(plainNumbers(text), 'ko')))
  const text = withoutBlanks(draft)
  const found = extractTokens(plainNumbers(text), 'ko')
  const result: { kind: TokenKind | 'quantities'; values: string[] }[] = (Object.keys(LABELS) as TokenKind[])
    .map((kind) => ({ kind, values: found[kind].filter((value) => !allowed[kind].includes(value)) }))
    .filter((entry) => entry.values.length > 0)
  const known = new Set(sources.flatMap(quantities))
  const unknown = [...new Set(quantities(text))].filter((value) => !known.has(value))
  if (unknown.length) result.push({ kind: 'quantities', values: unknown })
  return result
}

/** 초안(빈칸 밖)의 단정 표현과 그 앞 낱말(조사를 뗀 것) */
export function claimsIn(draft: string): { claim: string; subject: string | null }[] {
  const text = withoutBlanks(draft)
  return [...text.matchAll(CLAIMS)].map((match) => {
    const before = text.slice(0, match.index).split(/[\s.,!?·:()]+/).filter(Boolean)
    const word = before.at(-1)?.replace(PARTICLE, '') ?? ''
    return { claim: match[0], subject: /[가-힣]{2,}/.test(word) ? word : null }
  })
}

/** 빈칸 이름에 예시나 답이 들어 있는가 ('{{참가비 (예: 무료)}}', '{{준비물 (운동화, 물병 등)}}', '{{무료}}', '{{가능}}', '{{참가비: 5,000원}}') */
export function exampleInBlank(name: string): boolean {
  return EXAMPLE_MARK.test(name) || CANDIDATE_LIST.test(name) || ANSWER.test(name) || BARE_ANSWER.test(name) || LABELED_VALUE.test(name)
}

/** 예시·후보·값을 걷어낸 빈칸 이름 ('참가비 (예: 무료)' → '참가비', '참가비: 5,000원' → '참가비'). 남는 이름이 없으면 null */
function plainBlankName(name: string): string | null {
  const plain = name
    .replace(/\s*[(（][^()（）]*[)）]/g, '')
    .replace(/[\s,]*(?:예\s*[:)）]|예시|\be\.\s?g\.|\bex[.)]|for example).*$/i, '')
    .replace(/\s*[:：].*$/, '')
    .trim()
  return plain && plain !== name && !exampleInBlank(plain) ? plain : null
}

/**
 * 빈칸 이름에 든, 공고에 없는 고정값·수량 ('{{참가비 5,000원}}', '{{집결 시각 오전 9시 30분}}', '{{담당 전화 031-123-4567}}').
 * 빈칸 밖과 같은 기준이라 공고에 있는 값('{{10월 31일 준비물}}')은 이름에 써도 된다. '5000'과 '5000원'처럼 겹치면 긴 것만
 */
function valuesInBlanks(draft: string, sources: string[]): string[] {
  const names = blanksOf(draft).filter((name) => !exampleInBlank(name))
  if (!names.length) return []
  const values = [...new Set(newTokens(names.join(' / '), sources).flatMap((entry) => entry.values))]
  return values.filter((value) => !values.some((other) => other !== value && other.startsWith(value)))
}

function checkFixedValues(draft: string, sources: string[], where: string): string[] {
  const problems: string[] = []
  if (draft.length > MAX_DRAFT_LENGTH) problems.push(`문장이 너무 김 (${MAX_DRAFT_LENGTH}자 이하)`)
  if (blanksOf(draft).some((name) => !name)) problems.push('이름 없는 빈칸 {{}}이 있음')
  for (const name of new Set(blanksOf(draft).filter(exampleInBlank))) {
    const plain = plainBlankName(name)
    problems.push(`빈칸 이름에 예시나 답을 넣음 {{${name}}} → 채울 항목의 이름만 ${plain ? `{{${plain}}}` : '(예: {{참가비}})'}`)
  }
  for (const { kind, values } of newTokens(draft, sources)) {
    problems.push(`${where}에 없는 ${kind === 'quantities' ? '수량' : LABELS[kind]} ${values.join(', ')} → 기관이 정할 값이면 {{빈칸}}으로`)
  }
  const inBlanks = valuesInBlanks(draft, sources)
  if (inBlanks.length) problems.push(`빈칸 이름에 ${where}에 없는 값 ${inBlanks.join(', ')}을 넣음 → 채울 항목의 이름만 (예: {{참가비}})`)
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
    if (draft && quote) {
      if (blanksOf(draft).length) problems.push('공고에 이미 있는 내용에는 빈칸을 두지 않음')
      // 다시 쓴 문장은 인용한 문장 하나만 근거로 삼는다
      problems.push(...checkFixedValues(draft, [quote], '인용한 원문'))
      for (const { claim, subject } of claimsIn(draft)) {
        if (!quote.includes(claim.replace(/\s+/g, ' '))) problems.push(`인용한 원문에 없는 단정 '${claim}'`)
        else if (subject && !quote.includes(subject)) problems.push(`'${subject}'에 대한 단정 '${claim}'은 인용한 원문에 없음`)
      }
    }
  } else {
    if (!draft) problems.push('공고에 덧붙일 문장(draft)이 없음')
    else {
      if (!blanksOf(draft).length) problems.push('공고에 없는 답은 담당자가 채울 {{빈칸}}으로 남겨야 함')
      problems.push(...checkFixedValues(draft, context.sources, '공고'))
      for (const claim of [...new Set(claimsIn(draft).map((entry) => entry.claim))]) problems.push(`공고에 없는 답을 단정함 '${claim}' → 그 값은 {{빈칸}}으로`)
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
