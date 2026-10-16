import { GoogleGenAI } from '@google/genai'
import type { Part } from '@google/genai'
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
