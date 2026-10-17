import { LANGUAGES } from '@osan-kids-bridge/planning'
import type { Grade, Interest, ProgramPlan, RecommendResult, ScreenLanguage } from '@osan-kids-bridge/planning'

// 편성 도우미의 코드 검사: 모델이 낸 편성안이 계산 결과에서 고른 것인지, 근거 문장의 숫자가 도구가 낸 숫자(fact)와 같은지 본다.
// 언제·어디서·몇 가정에 닿는지는 모두 코드가 계산하고, 모델은 무엇을·누구에게와 근거 문장만 고른다.

/** 도구가 모델에게 보인 숫자 하나. 근거 문장은 이 id를 인용해야 숫자를 쓸 수 있다 */
export interface PlanFact {
  id: string
  label: string
  value: number
  unit: string
}

/** 이번 실행에서 도구가 내보낸 숫자 모음. 소수 셀 억제로 가린 칸은 들어가지 않는다 */
export class FactLedger {
  private readonly facts = new Map<string, PlanFact>()

  add(id: string, label: string, value: number, unit: string): { fact: string; value: number } {
    this.facts.set(id, { id, label, value, unit })
    return { fact: id, value }
  }

  get(id: string): PlanFact | undefined {
    return this.facts.get(id)
  }

  get size(): number {
    return this.facts.size
  }
}

/** simulate_plan 한 번의 결과 */
export interface Simulation {
  id: string
  plan: ProgramPlan & { interest: Interest | 'all'; gradeRange: [Grade, Grade] }
  result: RecommendResult
}

export interface ReasonDraft {
  text: string
  facts: string[]
}

export interface ProposalDraft {
  simulation_id: string
  rank: number
  title: string
  language_support: ScreenLanguage[]
  reasons: ReasonDraft[]
}

export interface PlanCheckContext {
  ledger: FactLedger
  simulations: Map<string, Simulation>
}

export const MAX_PROPOSALS = 2
export const MAX_TITLE_LENGTH = 40
export const MAX_REASON_LENGTH = 140

/** 단정·보장 표현, 그리고 받지 않는 개인 정보(국적·출신·체류 자격)를 가리키는 말. 띄어쓰기를 지운 글에서 찾는다 */
const BANNED = /보장(?!(?:되|하)지(?:는|도)?않|되진않|은아니)|반드시|(?<!불)확실|무조건|틀림없|전원|모든가정|국적|출신|체류|비자|나라별|국가별/g

/** 숫자 뒤에 오는 단위(같은 뜻의 말 포함). 인용한 fact의 단위와 맞아야 한다(가정 수를 %로, %를 가정 수로 바꿔 쓰지 못하게) */
const UNIT_AFTER = /^\s*(%|퍼센트|프로|가정|가구|세대|가족|집|개|건|명|분|곳|군데|칸|회)/
const UNIT_OF: Record<string, string> = {
  '%': '%', 퍼센트: '%', 프로: '%', 가정: '가정', 가구: '가정', 세대: '가정', 가족: '가정', 집: '가정',
  개: '개', 건: '건', 명: '명', 분: '명', 곳: '곳', 군데: '곳', 칸: '칸', 회: '회',
}

/**
 * 한글로 쓴 수 + 단위 ('네 가정', '열두 명', '삼십 퍼센트'). 숫자는 아라비아 숫자로만 쓰게 해서 코드가 대조할 수 있게 한다.
 * '이 반'(지시어), '한 가정이 여러 분야를…'(일반적인 말), '새로 열 반'(열다)처럼 수가 아닌 말은 잡지 않도록 홑 '한'·'열'과 십·백 없는 한자어 수는 뺀다
 */
const NATIVE = '(?:열(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉)|(?:스물|스무|서른|마흔|쉰|예순|일흔|여든|아흔)(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉)?|두|세|네|다섯|여섯|일곱|여덟|아홉)'
const SINO = '[일이삼사오육칠팔구]?[십백천만](?:[일이삼사오육칠팔구]?[십백천만])*[일이삼사오육칠팔구]?'
const NUMBER_WORDS = new RegExp(`(?<![가-힣])(${NATIVE}|${SINO})\\s*(%|퍼센트|프로|가정|가구|세대|가족|집|명|분|곳|군데|개|건|회|칸|번(?!째))`, 'g')

export interface NumberToken {
  value: number
  /** 숫자 바로 뒤의 단위 (없으면 null) */
  unit: string | null
  start: number
  end: number
}

/** "1,234"·"48%"·"2.5" 같은 숫자 토큰. 쉼표는 세 자리마다 있을 때만 천 단위 구분으로 본다('1,2반'은 1과 2). 전각 숫자는 NFKC로 바꿔 읽는다 */
export function numberTokens(text: string): NumberToken[] {
  const normalized = text.normalize('NFKC')
  return [...normalized.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((match) => {
    const end = match.index + match[0].length
    const unit = UNIT_AFTER.exec(normalized.slice(end))?.[1] ?? null
    return { value: Number(match[0].replace(/,/g, '')), unit: unit ? UNIT_OF[unit] : null, start: match.index, end }
  })
}

export const numbersIn = (text: string): number[] => numberTokens(text).map((token) => token.value)

/**
 * 숫자 없이도 쓸 수 있는 자리: 학년('1~4학년', '초1~4', '초1~초4', '1학년부터 4학년까지', '3학년'), 반('2개 반', '1반', '1·2반', '반 2개'), 안 번호('1안').
 * 이 자리에 든 숫자만 fact 없이 받는다. 다른 숫자(예: '3가정')는 학년·반 번호와 값이 같아도 fact로 확인해야 한다.
 * 근거 문장(anyGrade)은 수요를 학년대로 나눠 본 이야기를 할 수 있어 초1~6 안의 어느 학년이든 받고, 제목은 이 안의 대상 학년만 받는다
 */
function contextSpans(text: string, simulation: Simulation, anyGrade: boolean): [number, number][] {
  const normalized = text.normalize('NFKC')
  const [low, high] = simulation.plan.gradeRange
  const okRange = (a: number, b: number) => (anyGrade ? a >= 1 && b <= 6 && a <= b : a === low && b === high)
  const okOne = (a: number) => (anyGrade ? a >= 1 && a <= 6 : low === high && a === low)
  const classes = simulation.plan.classCount
  const spans: [number, number][] = []
  const add = (match: RegExpMatchArray) => spans.push([match.index!, match.index! + match[0].length])
  const SCHOOL = '(?<![가-힣])초(?:등(?:학교)?)?\\s*'
  const DASH = '\\s*[~∼〜\\-–]\\s*'
  for (const match of normalized.matchAll(new RegExp(`(?:${SCHOOL})?(\\d)\\s*(?:학년)?${DASH}(?:초\\s*)?(\\d)\\s*학년|${SCHOOL}(\\d)${DASH}(?:초\\s*)?(\\d)`, 'g'))) {
    if (okRange(Number(match[1] ?? match[3]), Number(match[2] ?? match[4]))) add(match)
  }
  for (const match of normalized.matchAll(/(\d)\s*학년\s*부터\s*(\d)\s*학년\s*까지/g)) if (okRange(Number(match[1]), Number(match[2]))) add(match)
  for (const match of normalized.matchAll(new RegExp(`(\\d)\\s*학년|${SCHOOL}(\\d)(?!\\s*[~∼〜\\-–\\d])`, 'g'))) if (okOne(Number(match[1] ?? match[2]))) add(match)
  for (const match of normalized.matchAll(/(\d)\s*(?:개\s*)?반|반\s*(\d)\s*개/g)) {
    const value = Number(match[1] ?? match[2])
    if (value >= 1 && value <= classes) add(match)
  }
  for (const match of normalized.matchAll(/(\d(?:\s*[·,、]\s*\d)+)\s*반/g)) if ((match[1].match(/\d/g) ?? []).every((digit) => Number(digit) >= 1 && Number(digit) <= classes)) add(match)
  for (const match of normalized.matchAll(/([1-3])\s*안(?![내전정녕])/g)) add(match)
  return spans
}

const inSpan = (token: NumberToken, spans: [number, number][]) => spans.some(([from, to]) => token.start >= from && token.end <= to)

/** 숫자 쓰기 규칙: 아라비아 숫자만, 학년·반 자리 밖의 숫자는 인용한 fact와 값·단위가 같아야 한다 */
function numberWordProblems(where: string, text: string): string[] {
  const normalized = text.normalize('NFKC')
  const problems = [...normalized.matchAll(NUMBER_WORDS)].map((match) => `${where}: '${match[0]}'처럼 수를 한글로 쓰지 말고 숫자로 쓴 뒤 그 fact를 인용하세요.`)
  if (/[^0-9]/.test(normalized.replace(/[^\p{Nd}]/gu, ''))) problems.push(`${where}: 숫자는 0~9로만 쓰세요.`)
  return problems
}

function numberProblems(where: string, text: string, simulation: Simulation, cited: PlanFact[]): string[] {
  const problems = numberWordProblems(where, text)
  // 지금 관행과의 차이: gain(더 닿음)을 인용하고 '덜'이라 쓰거나, loss(덜 닿음)를 인용하고 '더'라 쓰면 방향이 틀린다
  if (cited.some((fact) => fact.id.endsWith('.gain')) && /덜|적게|줄어/.test(text)) problems.push(`${where}: 인용한 차이(gain)는 더 닿는 가정 수입니다. '덜·적게'로 쓰지 마세요.`)
  if (cited.some((fact) => fact.id.endsWith('.loss')) && /더\s*(?:닿|많)/.test(text)) problems.push(`${where}: 인용한 차이(loss)는 덜 닿는 가정 수입니다. '더'로 쓰지 마세요.`)
  const spans = contextSpans(text, simulation, true)
  for (const token of numberTokens(text)) {
    if (inSpan(token, spans)) continue
    if (cited.some((fact) => fact.value === token.value && (token.unit === null || fact.unit === token.unit))) continue
    const sameValue = cited.find((fact) => fact.value === token.value)
    problems.push(sameValue
      ? `${where}: 숫자 ${token.value}${token.unit ?? ''}의 단위가 인용한 fact(${sameValue.unit})와 다릅니다.`
      : `${where}: 숫자 ${token.value}는 인용한 fact의 값이 아닙니다. 도구 결과에 {fact, value}로 나온 숫자만 그대로 쓰고 그 fact를 인용하세요(직접 계산한 숫자는 쓰지 않습니다).`)
  }
  return problems
}

/** 띄어쓰기·가운뎃점·보이지 않는 글자를 지운 글에서 찾는다 ('보·장', '확 실') */
const bannedIn = (where: string, text: string) => [...text.normalize('NFKC').replace(/[^\p{L}]/gu, '').matchAll(BANNED)].map((match) => `${where}: '${match[0]}'는 쓰지 않습니다(단정이나 받지 않는 개인 정보).`)

export function checkProposal(proposal: ProposalDraft, context: PlanCheckContext): string[] {
  const problems: string[] = []
  const simulation = context.simulations.get(proposal.simulation_id)
  if (!simulation) return [`simulation_id ${JSON.stringify(proposal.simulation_id)}는 simulate_plan 결과에 없습니다.`]
  if (simulation.result.status !== 'ok') return [`${simulation.id}는 추천을 계산하지 못한 결과(${simulation.result.status})라 편성안으로 낼 수 없습니다.`]
  const recommendation = simulation.result.recommendations.find((item) => item.rank === proposal.rank)
  if (!recommendation) return [`${simulation.id}에 ${proposal.rank}안이 없습니다. 1~${simulation.result.recommendations.length}안 중에서 고르세요.`]

  const title = proposal.title.trim()
  if (!title || title.length > MAX_TITLE_LENGTH) problems.push(`title은 1~${MAX_TITLE_LENGTH}자여야 합니다.`)
  const titleSpans = contextSpans(title, simulation, false)
  for (const token of numberTokens(title)) if (!inSpan(token, titleSpans)) problems.push(`title의 숫자 ${token.value}는 이 안의 대상 학년이나 반 수가 아닙니다. 제목에는 다른 숫자를 넣지 마세요.`)
  problems.push(...numberWordProblems('title', title), ...bannedIn('title', title))

  if (proposal.reasons.length < 2 || proposal.reasons.length > 4) problems.push('reasons는 2~4개여야 합니다.')
  const ownPrefix = `${simulation.id}.r${recommendation.rank}.`
  let citesOwnResult = false
  proposal.reasons.forEach((reason, index) => {
    const where = `근거 ${index + 1}`
    const text = reason.text.trim()
    if (!text || text.length > MAX_REASON_LENGTH) problems.push(`${where}: 문장은 1~${MAX_REASON_LENGTH}자여야 합니다.`)
    if (!reason.facts.length) problems.push(`${where}: 인용한 fact가 없습니다. 근거로 쓴 도구 결과의 fact id를 facts에 넣으세요.`)
    const cited: PlanFact[] = []
    for (const id of new Set(reason.facts)) {
      const fact = context.ledger.get(id)
      if (!fact) problems.push(`${where}: fact ${JSON.stringify(id)}는 도구 결과에 없습니다(가린 칸은 인용할 수 없습니다).`)
      else cited.push(fact)
      if (id.startsWith(ownPrefix) && /\.(covered|pct|gain|loss)$/.test(id)) citesOwnResult = true
    }
    problems.push(...numberProblems(where, text, simulation, cited), ...bannedIn(where, text))
  })
  if (proposal.reasons.length && !citesOwnResult) problems.push(`적어도 한 근거는 이 편성안의 계산 결과(${ownPrefix}covered·pct·gain 같은 fact)를 인용해야 합니다.`)

  const seen = new Set<ScreenLanguage>()
  for (const language of proposal.language_support) {
    if (!LANGUAGES.includes(language)) problems.push(`language_support의 ${JSON.stringify(language)}는 vi·zh·ko-easy 중 하나가 아닙니다.`)
    else if (seen.has(language)) problems.push(`language_support에 ${language}가 두 번 있습니다.`)
    else {
      seen.add(language)
      const count = recommendation.languageBreakdown[language]
      if (!count.suppressed && count.value === 0) problems.push(`${language}: 이 안이 닿는 가정 중 이 화면 언어 가정이 없어 준비 언어로 넣지 않습니다.`)
    }
  }
  return [...new Set(problems)]
}

export interface PlanCheckResult {
  problems: string[][]
  general: string[]
}

export function checkPlan(proposals: ProposalDraft[], context: PlanCheckContext): PlanCheckResult {
  const general: string[] = []
  if (!proposals.length || proposals.length > MAX_PROPOSALS) general.push(`proposals는 1~${MAX_PROPOSALS}개여야 합니다.`)
  const keys = proposals.map((proposal) => `${proposal.simulation_id}|${proposal.rank}`)
  if (new Set(keys).size !== keys.length) general.push('같은 계산 결과의 같은 안을 두 번 냈습니다. 서로 다른 안을 고르세요.')
  return { problems: proposals.map((proposal) => checkProposal(proposal, context)), general }
}

export const problemCount = (result: PlanCheckResult): number =>
  result.general.length + result.problems.reduce((sum, list) => sum + list.length, 0)

const text = (value: unknown, limit: number): string => (typeof value === 'string' ? value.trim().slice(0, limit) : '')

/** 모델이 보낸 proposals를 모양만 맞춰 읽는다(내용 검사는 checkPlan) */
export function parseProposals(raw: unknown): ProposalDraft[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_PROPOSALS + 2).map((entry) => {
    const item = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
    const reasons = Array.isArray(item.reasons) ? item.reasons.slice(0, 6).map((reason) => {
      const value = typeof reason === 'object' && reason !== null ? reason as Record<string, unknown> : {}
      return {
        text: text(value.text, 400),
        facts: Array.isArray(value.facts) ? value.facts.filter((id): id is string => typeof id === 'string').slice(0, 8) : [],
      }
    }) : []
    return {
      simulation_id: text(item.simulation_id, 20),
      rank: typeof item.rank === 'number' && Number.isInteger(item.rank) ? item.rank : 0,
      title: text(item.title, 200),
      language_support: Array.isArray(item.language_support) ? item.language_support.filter((language): language is ScreenLanguage => typeof language === 'string').slice(0, 4) : [],
      reasons,
    }
  })
}
