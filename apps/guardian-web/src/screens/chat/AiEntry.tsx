import { agentAvailable } from '../../data/agent'
import { Icon } from '../../components/Icon'

/** AI 상담 도우미를 여는 카드. 서버가 연결되지 않은 화면(시연 어댑터)에서는 보이지 않습니다. */
export function AiEntry({ title, body, onOpen }: { title: string; body: string; onOpen: () => void }) {
  if (!agentAvailable) return null
  return (
    <button type="button" className="ai-entry" onClick={onOpen}>
      <span className="chat-badge" aria-hidden="true">AI</span>
      <span><strong>{title}</strong><small>{body}</small></span>
      <Icon name="chevron" />
    </button>
  )
}
