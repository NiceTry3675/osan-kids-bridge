import { GoogleGenAI } from '@google/genai'
import type { Content, FunctionDeclaration, Part, ThinkingLevel } from '@google/genai'
import { geminiConfig } from '../config'

let client: GoogleGenAI | null = null

export function geminiClient(): GoogleGenAI {
  if (client) return client
  const config = geminiConfig()
  client = new GoogleGenAI({
    vertexai: true,
    project: config.project,
    location: config.location,
    googleAuthOptions: { keyFile: config.keyFile, scopes: ['https://www.googleapis.com/auth/cloud-platform'] },
  })
  return client
}

export function modelName(): string {
  return geminiConfig().model
}

export interface GenerateOptions {
  system: string
  parts: Part[]
  /** JSON Schema. 주면 JSON으로 받아 파싱한다 */
  schema?: object
  temperature?: number
  /** 생각 단계 (주지 않으면 모델 기본값). 짧은 번역처럼 빨리 답해야 하는 요청은 낮춘다 */
  thinkingLevel?: ThinkingLevel
}

// 응답이 오지 않아 시간 제한으로 끊긴 요청(timeout·abort)도 다시 시도한다
const RETRYABLE = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|fetch failed|timed? ?out|abort/i
/** 도구를 쓰는 에이전트 한 턴의 시간 제한. 가끔 응답이 오지 않는 요청이 있어 무한정 기다리지 않는다 */
const TOOL_TURN_TIMEOUT_MS = 45_000
/** 마감이 있을 때 한 번의 시도에 최소한 주는 시간. 이만큼도 남지 않으면 다시 시도하지 않는다 */
const MIN_ATTEMPT_MS = 10_000

async function withRetry<T>(run: () => Promise<T>, { attempts = 4, deadline }: { attempts?: number; deadline?: number } = {}): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (!RETRYABLE.test(String((error as Error)?.message ?? error)) || attempt === attempts - 1) break
      const wait = 1000 * 2 ** attempt
      // 마감(밀리초 시각)이 있으면, 기다린 뒤 한 번 제대로 시도할 시간이 남을 때만 다시 시도한다
      if (deadline !== undefined && Date.now() + wait + MIN_ATTEMPT_MS > deadline) break
      await new Promise((done) => setTimeout(done, wait))
    }
  }
  throw lastError
}

export async function generateText(options: GenerateOptions): Promise<string> {
  const response = await withRetry(() => geminiClient().models.generateContent({
    model: modelName(),
    contents: [{ role: 'user', parts: options.parts }],
    config: {
      systemInstruction: options.system,
      temperature: options.temperature ?? 0,
      ...(options.schema ? { responseMimeType: 'application/json', responseJsonSchema: options.schema } : {}),
      ...(options.thinkingLevel ? { thinkingConfig: { thinkingLevel: options.thinkingLevel } } : {}),
    },
  }))
  const text = response.text
  if (!text) throw new Error('Gemini 응답이 비어 있습니다.')
  return text
}

export async function generateJson<T>(options: GenerateOptions & { schema: object }): Promise<T> {
  const text = await generateText(options)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Gemini JSON 응답을 해석하지 못했습니다: ${text.slice(0, 200)}`)
  }
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
  id?: string
}

export interface ToolTurn {
  calls: ToolCall[]
  text: string | null
  /** 다음 요청에 그대로 돌려줄 모델 차례 (thought signature 포함) */
  content: Content
}

/**
 * 도구를 쓸 수 있는 한 차례. JSON 응답 모드와 함께 쓰면 도구 호출을 끝내지 않아, 끝맺음도 도구(respond)로 받는다.
 * deadline(밀리초 시각)을 주면 시도마다 남은 시간보다 오래 기다리지 않고(최소 10초), 마감 안에 끝낼 수 없는 재시도는 하지 않는다.
 */
export async function generateWithTools(options: { system: string; contents: Content[]; tools: FunctionDeclaration[]; temperature?: number; thinkingLevel?: ThinkingLevel; deadline?: number }): Promise<ToolTurn> {
  const { deadline } = options
  const response = await withRetry(() => geminiClient().models.generateContent({
    model: modelName(),
    contents: options.contents,
    config: {
      systemInstruction: options.system,
      temperature: options.temperature ?? 0,
      tools: [{ functionDeclarations: options.tools }],
      ...(options.thinkingLevel ? { thinkingConfig: { thinkingLevel: options.thinkingLevel } } : {}),
      httpOptions: { timeout: deadline === undefined ? TOOL_TURN_TIMEOUT_MS : Math.max(MIN_ATTEMPT_MS, Math.min(TOOL_TURN_TIMEOUT_MS, deadline - Date.now())) },
    },
  }), { deadline })
  const content = response.candidates?.[0]?.content
  if (!content) throw new Error('Gemini 응답이 비어 있습니다.')
  const calls = (response.functionCalls ?? []).map((call) => ({ name: call.name ?? '', args: (call.args ?? {}) as Record<string, unknown>, id: call.id }))
  const text = content.parts?.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('').trim() || null
  return { calls, text, content }
}
