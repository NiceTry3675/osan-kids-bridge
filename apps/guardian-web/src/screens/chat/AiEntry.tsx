import { agentAvailable } from '../../data/agent'

/** AI 도우미로 들어가는 버튼. 쓸 수 없는 화면에서는 그리지 않습니다. */
export function AiEntry({ title, onOpen }: { title: string; onOpen: () => void }) {
  if (!agentAvailable) return null
  return <button type="button" className="btn btn--secondary btn--block" onClick={onOpen}>{title}</button>
}
