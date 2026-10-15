import type { ReactNode } from 'react'

/** 탭마다 맨 위: 탭 이름을 제목으로, 오른쪽에 필요한 행동 하나 */
export function ViewHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="view-head">
      <h1>{title}</h1>
      {action}
    </div>
  )
}
