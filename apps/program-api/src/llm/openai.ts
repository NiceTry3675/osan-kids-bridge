import { openaiConfig } from '../config'

// OpenAI 이미지 편집 (포스터 통번역). 의존성 없이 fetch + FormData로 부른다.

export interface EditImageInput {
  /** 첫 장이 편집할 이미지, 나머지는 참고 이미지 */
  images: { data: Buffer; mimeType: string; name: string }[]
  prompt: string
  size: '1024x1024' | '1024x1536' | '1536x1024'
  quality?: 'low' | 'medium' | 'high'
}

export interface EditImageResult {
  png: Buffer
  model: string
  usage: unknown
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export async function editImage(input: EditImageInput, attempts = 3): Promise<EditImageResult> {
  const { apiKey, imageModel } = openaiConfig()
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const form = new FormData()
    form.append('model', imageModel)
    form.append('prompt', input.prompt)
    form.append('size', input.size)
    form.append('quality', input.quality ?? 'high')
    for (const image of input.images) form.append('image[]', new Blob([new Uint8Array(image.data)], { type: image.mimeType }), image.name)
    try {
      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(300_000),
      })
      const body = await response.json() as { data?: { b64_json?: string }[]; usage?: unknown; error?: { message?: string } }
      if (!response.ok) {
        const error = new Error(`OpenAI 이미지 편집 실패 (${response.status}): ${body.error?.message ?? '알 수 없는 오류'}`)
        if (!RETRYABLE_STATUS.has(response.status)) throw Object.assign(error, { fatal: true })
        throw error
      }
      const b64 = body.data?.[0]?.b64_json
      if (!b64) throw new Error('OpenAI 이미지 편집 응답에 이미지가 없습니다.')
      return { png: Buffer.from(b64, 'base64'), model: imageModel, usage: body.usage ?? null }
    } catch (error) {
      lastError = error
      if ((error as { fatal?: boolean }).fatal || attempt === attempts - 1) break
      await new Promise((done) => setTimeout(done, 2000 * 2 ** attempt))
    }
  }
  throw lastError
}
