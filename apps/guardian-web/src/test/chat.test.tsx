// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import type { MessageKey } from '../i18n'
import { ChatSheet } from '../screens/chat/ChatSheet'
import { HISTORY_LIMIT, MESSAGE_LIMIT, recentHistory } from '../data/agent'
import type { AgentReply, ChatMessage } from '../data/agent'

// 서버가 연결된 화면처럼: agentAvailable은 모듈을 읽을 때 정해지므로 먼저 바꿉니다.
vi.hoisted(() => { vi.stubEnv('VITE_API_BASE_URL', 'http://api.test'); vi.stubEnv('VITE_DATA_MODE', 'live') })

interface ChatBody { messages: ChatMessage[]; locale: string; program_id: string | null }
interface QuestionBody { program_id: string; topic: string; question_ko: string }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const reply = (overrides: Partial<AgentReply> = {}): AgentReply => ({
  reply: '공고에 적힌 내용으로 답해요.', citations: [], follow_ups: [], steps: [], programs: [], inquiry: null, unanswered: [], ...overrides,
})

/** program-api 대신: 상담은 chat, 기관에 알리기는 questions가 받습니다. */
function serve(chat: (body: ChatBody) => Response | Promise<Response>, questions: (body: QuestionBody) => Response = () => json({ ok: true }, 201)) {
  const sent = { chat: [] as ChatBody[], questions: [] as QuestionBody[] }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    if (url === 'http://api.test/agent/chat') { sent.chat.push(body); return chat(body) }
    if (url === 'http://api.test/agent/questions') { sent.questions.push(body); return questions(body) }
    return json({}, 404)
  }))
  return sent
}

const renderChat = (suggestions: MessageKey[] = ['chatSuggestFit']) =>
  render(<I18nProvider initial="ko-easy"><ChatSheet open onClose={() => {}} program={null} suggestions={suggestions} /></I18nProvider>)

async function ask(text: string) {
  const input = screen.getByLabelText('궁금한 것을 쓰세요')
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(screen.queryByText('공고를 확인하고 있어요')).toBeNull())
}

beforeEach(() => { serve(() => json(reply())) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('상담 요청 대화 길이', () => {
  it('최근 대화만 보내고, 첫 메시지는 보호자 질문으로 맞추며, 빈 메시지는 뺀다', () => {
    const long: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `${i} `.padEnd(1200, '가') }))
    const recent = recentHistory([...long, { role: 'assistant', text: '   ' }, { role: 'user', text: '마지막 질문' }])
    expect(recent.length).toBeLessThanOrEqual(HISTORY_LIMIT)
    expect(recent[0].role).toBe('user')
    expect(recent.at(-1)).toEqual({ role: 'user', text: '마지막 질문' })
    expect(recent.every((message) => message.text.trim() && message.text.length <= MESSAGE_LIMIT)).toBe(true)
  })

  it('대화가 길어져도 서버 검사(32개·1,600자)를 넘지 않게 최근 대화만 잘라 보낸다', async () => {
    const sent = serve(() => json(reply({ reply: '가'.repeat(1500) })))
    renderChat()
    for (let i = 1; i <= 8; i++) await ask(`질문 ${i}`)
    expect(sent.chat).toHaveLength(8)
    expect(sent.chat[0].messages).toEqual([{ role: 'user', text: '질문 1' }])
    const last = sent.chat[7].messages
    // 질문 8개·답 7개(15개) 중 최근 12개에서 앞의 답 하나를 빼 질문 3부터 보냅니다.
    expect(last).toHaveLength(11)
    expect(last[0]).toEqual({ role: 'user', text: '질문 3' })
    expect(last.at(-1)).toEqual({ role: 'user', text: '질문 8' })
    expect(last.filter((message) => message.role === 'assistant').every((message) => message.text.length === MESSAGE_LIMIT)).toBe(true)
  })

  it('새로 묻기를 누르면 대화를 비우고 다음 질문은 처음부터 보낸다', async () => {
    const sent = serve(() => json(reply()))
    renderChat()
    expect(screen.queryByText('새로 묻기')).toBeNull()
    await ask('첫 질문')
    fireEvent.click(screen.getByText('새로 묻기'))
    expect(screen.queryByText('첫 질문')).toBeNull()
    expect(screen.getByText('우리 아이가 갈 수 있나요?')).toBeTruthy()
    await ask('새 질문')
    expect(sent.chat.at(-1)!.messages).toEqual([{ role: 'user', text: '새 질문' }])
  })

  it('답을 기다리는 중에 새로 묻기를 누르면 요청을 취소하고 늦게 온 답은 버린다', async () => {
    let late!: () => void
    serve(() => new Promise<Response>((resolve) => { late = () => resolve(json(reply({ reply: '늦게 온 답' }))) }))
    renderChat()
    const input = screen.getByLabelText('궁금한 것을 쓰세요')
    fireEvent.change(input, { target: { value: '첫 질문' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!
    fireEvent.click(await screen.findByText('새로 묻기'))
    expect(signal.aborted).toBe(true)
    late()
    await waitFor(() => expect(screen.queryByText('공고를 확인하고 있어요')).toBeNull())
    expect(screen.queryByText('늦게 온 답')).toBeNull()
    expect(screen.queryByText('첫 질문')).toBeNull()
  })
})

describe('기관에 이름 없이 알리기', () => {
  it('중간에 실패한 뒤 다시 누르면 아직 보내지 않은 질문만 보낸다', async () => {
    const unanswered = ['형제도 함께 갈 수 있나요?', '준비물이 있나요?', '통역이 있나요?']
      .map((question_ko) => ({ program_id: 'osan-fc-sports-day', title: '운동회', topic: 'other' as const, question_ko }))
    let posts = 0
    const sent = serve(() => json(reply({ unanswered })), () => (++posts === 2 ? json({ error: 'busy' }, 503) : json({ ok: true }, 201)))
    renderChat()
    await ask('형제도 갈 수 있어요?')
    fireEvent.click(screen.getByText('기관에 이름 없이 알리기'))
    expect(await screen.findByText('지금 답할 수 없어요. 잠시 후 다시 시도해 주세요.')).toBeTruthy()
    fireEvent.click(screen.getByText('기관에 이름 없이 알리기'))
    expect(await screen.findByText('기관에 알렸어요')).toBeTruthy()
    expect(sent.questions.map((item) => item.question_ko)).toEqual([unanswered[0], unanswered[1], unanswered[1], unanswered[2]].map((item) => item.question_ko))
  })
})

describe('기관에 물을 문장의 문의처', () => {
  const inquiry = (contacts: NonNullable<AgentReply['inquiry']>['contacts'], is_demo = false): AgentReply['inquiry'] =>
    ({ program_id: 'osan-fc-sports-day', title: '운동회', message_ko: '형제자매도 함께 참여할 수 있나요?', contacts, is_demo })

  it('방문 주소와 온라인 문의 페이지도 보여 준다', async () => {
    serve(() => json(reply({ inquiry: inquiry([{ type: 'visit', address: '경기도 오산시 시청로 1' }, { type: 'online', url: 'https://example.org/ask' }]) })))
    renderChat()
    await ask('형제도 갈 수 있어요?')
    expect(screen.getByText('방문 경기도 오산시 시청로 1')).toBeTruthy()
    const link = screen.getByText('문의 페이지 열기').closest('a')!
    expect(link.getAttribute('href')).toBe('https://example.org/ask')
    expect(screen.queryByText('공고에서 확인된 문의처가 없어요.')).toBeNull()
  })

  it('시연용 공고의 온라인 문의는 실제 주소로 보내지 않는다', async () => {
    serve(() => json(reply({ inquiry: inquiry([{ type: 'online', url: 'https://example.org/ask' }], true) })))
    renderChat()
    await ask('형제도 갈 수 있어요?')
    const button = screen.getByText('문의 페이지 열기').closest('button')!
    expect(button.closest('a')).toBeNull()
    fireEvent.click(button)
    expect(screen.getByText('시연용 공고라 실제 페이지로 연결하지 않아요.')).toBeTruthy()
  })

  it('보여 줄 수 있는 문의처가 없으면 없다고 말한다', async () => {
    serve(() => json(reply({ inquiry: inquiry([{ type: 'online', url: 'javascript:alert(1)' }, { type: 'phone' }, { type: 'visit', address: ' ' }]) })))
    renderChat()
    await ask('형제도 갈 수 있어요?')
    expect(screen.getByText('공고에서 확인된 문의처가 없어요.')).toBeTruthy()
    expect(screen.queryByText('문의 페이지 열기')).toBeNull()
  })
})
