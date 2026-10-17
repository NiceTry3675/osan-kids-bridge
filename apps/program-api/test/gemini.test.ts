import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 실제 Vertex를 부르지 않고, 재시도·시간 제한이 마감을 지키는지만 본다
const generateContent = vi.fn()
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent } } }))
vi.mock('../src/config', () => ({ geminiConfig: () => ({ project: 'test', location: 'test', keyFile: 'test.json', model: 'test-model' }) }))

const { generateWithTools } = await import('../src/llm/gemini')

const answer = { candidates: [{ content: { role: 'model', parts: [{ text: '끝' }] } }], functionCalls: [] }
const turn = (deadline?: number) => generateWithTools({ system: '시스템', contents: [], tools: [], ...(deadline === undefined ? {} : { deadline }) })
const timeoutOf = (call: number) => (generateContent.mock.calls[call][0] as { config: { httpOptions: { timeout: number } } }).config.httpOptions.timeout

describe('generateWithTools 마감', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    generateContent.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('마감이 없으면 한 번에 45초까지 기다린다', async () => {
    generateContent.mockResolvedValue(answer)
    await turn()
    expect(timeoutOf(0)).toBe(45_000)
  })

  it('한 번의 시도는 마감까지 남은 시간보다 오래 기다리지 않는다', async () => {
    generateContent.mockResolvedValue(answer)
    await turn(Date.now() + 30_000)
    expect(timeoutOf(0)).toBe(30_000)
  })

  it('남은 시간이 짧아도 한 번은 10초를 준다', async () => {
    generateContent.mockResolvedValue(answer)
    await turn(Date.now() + 2_000)
    expect(timeoutOf(0)).toBe(10_000)
  })

  it('시간이 남아 있으면 일시적인 오류를 다시 시도한다', async () => {
    generateContent.mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED')).mockResolvedValueOnce(answer)
    const pending = turn(Date.now() + 120_000)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(pending).resolves.toMatchObject({ text: '끝' })
    expect(generateContent).toHaveBeenCalledTimes(2)
  })

  it('기다린 뒤 마감 안에 한 번 제대로 시도할 시간이 없으면 다시 시도하지 않는다', async () => {
    generateContent.mockRejectedValue(new Error('Request timed out'))
    const settled = expect(turn(Date.now() + 5_000)).rejects.toThrow('timed out')
    await vi.runAllTimersAsync()
    await settled
    expect(generateContent).toHaveBeenCalledTimes(1)
  })

  it('재시도가 이어져도 마감을 넘겨 새 시도를 시작하지 않는다', async () => {
    const deadline = Date.now() + 120_000
    const ends: number[] = []
    // 시도마다 시간 제한을 다 쓰고 끊기는 상황
    generateContent.mockImplementation(async (request: { config: { httpOptions: { timeout: number } } }) => {
      await new Promise((done) => setTimeout(done, request.config.httpOptions.timeout))
      ends.push(Date.now())
      throw new Error('Request timed out')
    })
    const settled = expect(turn(deadline)).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(300_000)
    await settled
    // 45초 + 45초 + 남은 27초로 세 번 시도하고, 마지막 시도도 마감에 맞춰 끝난다 (마감이 없으면 네 번, 약 3분)
    expect(generateContent).toHaveBeenCalledTimes(3)
    expect(timeoutOf(2)).toBeLessThan(45_000)
    expect(Math.max(...ends)).toBeLessThanOrEqual(deadline)
  })
})
