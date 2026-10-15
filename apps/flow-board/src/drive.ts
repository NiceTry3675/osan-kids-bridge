/** 틀 안 앱을 사람이 누르듯 움직여 원하는 화면(시트, 결과, 다른 탭)까지 데려갑니다. */
export interface Step {
  /** 누를 요소의 CSS 선택자 */
  click: string
  /** 같은 선택자가 여럿이면 이 글자가 들어간 요소 */
  text?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function find(doc: Document, step: Step, timeout: number): Promise<HTMLElement> {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const match = [...doc.querySelectorAll<HTMLElement>(step.click)].find((node) => !step.text || (node.textContent ?? '').includes(step.text))
    if (match) return match
    await sleep(60)
  }
  throw new Error(`찾지 못함: ${step.click}${step.text ? ` (${step.text})` : ''}`)
}

/** 앱이 그려질 때까지 기다린 뒤 단계를 차례로 누릅니다. 단계 사이에는 화면이 바뀔 시간을 둡니다. */
export async function play(frame: HTMLIFrameElement, steps: Step[], isCancelled: () => boolean): Promise<void> {
  const doc = frame.contentDocument
  if (!doc) return
  await find(doc, { click: '#root > *' }, 8000)
  for (const step of steps) {
    if (isCancelled()) return
    const node = await find(doc, step, 6000)
    node.click()
    await sleep(260)
  }
}
