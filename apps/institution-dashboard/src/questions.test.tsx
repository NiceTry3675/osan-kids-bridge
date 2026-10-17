// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { loadQuestions } from './data/questions'
import { QuestionsView } from './components/QuestionsView'
import { LanguageProvider } from './i18n'

// 서버가 연결된 대시보드처럼: 주소는 모듈을 읽을 때 정해지므로 먼저 바꿉니다.
vi.hoisted(() => { vi.stubEnv('VITE_API_BASE_URL', 'http://api.test') })

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const LIVE = { programs: [{ program_id: 'osan-fc-sports-day', title: '운동회', questions: [{ question_ko: '주차할 곳이 있나요?', topic: 'other', count: 2, last_date: '2026-10-16' }] }] }
const serve = (respond: (url: string, init?: RequestInit) => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(respond))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('보호자 질문 불러오기', () => {
  it('서버에서 받은 질문을 예시와 합치고 실패로 표시하지 않는다', async () => {
    serve(async () => json(LIVE))
    const summary = await loadQuestions()
    expect(summary.liveFailed).toBe(false)
    expect(summary.live).toBe(2)
    expect(summary.programs.find((program) => program.program_id === 'osan-fc-sports-day')!.questions.some((question) => question.live)).toBe(true)
  })

  it('들어온 질문이 없으면 실패가 아니다', async () => {
    serve(async () => json({ programs: [] }))
    expect(await loadQuestions()).toMatchObject({ live: 0, liveFailed: false })
  })

  it('연결 실패·오류 응답·이상한 응답은 예시만 보여 주되 실패로 표시한다', async () => {
    for (const respond of [async () => { throw new TypeError('fetch failed') }, async () => json({ error: 'down' }, 503), async () => json({ nope: true })]) {
      serve(respond)
      const summary = await loadQuestions()
      expect(summary.liveFailed).toBe(true)
      expect(summary.live).toBe(0)
      expect(summary.programs.length).toBeGreaterThan(0)
    }
  })

  it('취소된 요청은 결과 대신 취소로 끝난다', async () => {
    serve(async () => { throw new DOMException('aborted', 'AbortError') })
    const controller = new AbortController()
    controller.abort()
    await expect(loadQuestions(controller.signal)).rejects.toThrow('aborted')
  })
})

describe('보호자 질문 화면', () => {
  const renderView = () => render(<LanguageProvider><QuestionsView /></LanguageProvider>)

  it('서버에 연결하지 못하면 짧게 알린다', async () => {
    serve(async () => { throw new TypeError('fetch failed') })
    renderView()
    expect(await screen.findByText('질문 서버에 연결하지 못해 시연용 예시만 보여요.')).toBeTruthy()
  })

  it('보호자 웹에서 들어온 질문은 점과 함께 글자로도 알린다', async () => {
    serve(async () => json(LIVE))
    renderView()
    expect(await screen.findByText('보호자 웹에서 들어온 질문 2건 포함')).toBeTruthy()
    expect(screen.getByText('(보호자 웹에서 들어온 질문)').className).toBe('visually-hidden')
    expect(screen.queryByText('질문 서버에 연결하지 못해 시연용 예시만 보여요.')).toBeNull()
  })

  it('새로고침으로 취소된 요청이 늦게 끝나도 새 결과를 덮지 않는다', async () => {
    let late!: () => void
    const responses = [new Promise<Response>((resolve) => { late = () => resolve(json({ error: 'down' }, 503)) }), Promise.resolve(json(LIVE))]
    serve(() => responses.shift()!)
    renderView()
    fireEvent.click(screen.getByText('새로고침'))
    expect(await screen.findByText('보호자 웹에서 들어온 질문 2건 포함')).toBeTruthy()
    await act(async () => { late(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(screen.queryByText('질문 서버에 연결하지 못해 시연용 예시만 보여요.')).toBeNull()
  })

  it('화면을 떠나 취소된 요청은 처리되지 않은 오류를 남기지 않는다', async () => {
    serve((_url, init) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))
    renderView().unmount()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
