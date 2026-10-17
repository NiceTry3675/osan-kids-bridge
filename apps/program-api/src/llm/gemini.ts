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
}

const RETRYABLE = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|fetch failed/i

async function withRetry<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (!RETRYABLE.test(String((error as Error)?.message ?? error)) || attempt === attempts - 1) break
      await new Promise((done) => setTimeout(done, 1000 * 2 ** attempt))
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

/** 도구를 쓸 수 있는 한 차례. JSON 응답 모드와 함께 쓰면 도구 호출을 끝내지 않아, 끝맺음도 도구(respond)로 받는다 */
export async function generateWithTools(options: { system: string; contents: Content[]; tools: FunctionDeclaration[]; temperature?: number; thinkingLevel?: ThinkingLevel }): Promise<ToolTurn> {
  const response = await withRetry(() => geminiClient().models.generateContent({
    model: modelName(),
    contents: options.contents,
    config: {
      systemInstruction: options.system,
      temperature: options.temperature ?? 0,
      tools: [{ functionDeclarations: options.tools }],
      ...(options.thinkingLevel ? { thinkingConfig: { thinkingLevel: options.thinkingLevel } } : {}),
    },
  }))
  const content = response.candidates?.[0]?.content
  if (!content) throw new Error('Gemini 응답이 비어 있습니다.')
  const calls = (response.functionCalls ?? []).map((call) => ({ name: call.name ?? '', args: (call.args ?? {}) as Record<string, unknown>, id: call.id }))
  const text = content.parts?.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('').trim() || null
  return { calls, text, content }
}
