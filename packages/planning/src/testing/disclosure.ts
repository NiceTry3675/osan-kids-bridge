// 테스트 전용: 화면 숫자만으로 가린 칸을 역산할 수 있는지 점검하는 도구(앱 번들에는 들어가지 않음)
import { suppressPartition } from '../aggregate'
import type { PartitionOptions } from '../aggregate'
import type { SafeCount } from '../types'

const sameDisplay = <K extends string>(keys: readonly K[], a: Record<K, SafeCount>, b: Record<K, SafeCount>) =>
  keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]))

/**
 * "역산 공격" 점검. 화면에 보이는 분포 표시와 합계, 그리고 억제 규칙 자체를 모두 아는 사람이
 * 같은 화면을 만드는 원래 값을 전부 따져 봐도 1~4인 칸의 값이 하나로 정해지는지 봅니다. 하나로 정해지는 칸의 키를 돌려줍니다.
 * "5 미만" 칸은 1~4, "가림" 칸은 0 이상 아무 값이나 될 수 있다고 보고 모든 경우를 규칙에 다시 넣어 확인합니다.
 */
export function recoverableCells<K extends string>(keys: readonly K[], raw: Record<K, number>, options?: PartitionOptions): K[] {
  const shown = suppressPartition(keys, raw, options)
  const hidden = keys.filter((key) => shown[key].suppressed)
  if (!hidden.length) return []
  const total = keys.reduce((sum, key) => sum + raw[key], 0)
  const hiddenSum = keys.reduce((sum, key) => { const count = shown[key]; return count.suppressed ? sum : sum - count.value }, total)
  const small = hidden.filter((key) => raw[key] >= 1 && raw[key] <= 4)
  const seen = Object.fromEntries(hidden.map((key) => [key, new Set<number>()])) as Record<K, Set<number>>
  const candidate = { ...raw }
  // 1~4 칸마다 가능한 값이 둘 이상 나오면 더 볼 필요가 없어 멈춥니다.
  const settled = () => small.every((key) => seen[key].size > 1)
  const visit = (at: number, left: number): boolean => {
    const key = hidden[at]
    const count = shown[key]
    const [low, high] = count.suppressed && !count.masked ? [1, Math.min(4, left)] : [0, left]
    if (at === hidden.length - 1) {
      if (left < low || left > high) return false
      candidate[key] = left
      if (sameDisplay(keys, suppressPartition(keys, candidate, options), shown)) for (const item of hidden) seen[item].add(candidate[item])
      return settled()
    }
    for (let value = low; value <= high; value++) { candidate[key] = value; if (visit(at + 1, left - value)) return true }
    return false
  }
  visit(0, hiddenSum)
  return small.filter((key) => seen[key].size <= 1)
}

/** 합계에서 보이는 칸을 빼는 단순 계산만으로(규칙을 몰라도) 값이 정해지는 1~4 칸 */
export function subtractableCells<K extends string>(keys: readonly K[], raw: Record<K, number>, options?: PartitionOptions): K[] {
  const shown = suppressPartition(keys, raw, options)
  const hidden = keys.filter((key) => shown[key].suppressed)
  const total = keys.reduce((sum, key) => sum + raw[key], 0)
  const hiddenSum = keys.reduce((sum, key) => { const count = shown[key]; return count.suppressed ? sum : sum - count.value }, total)
  const bounds = (key: K): [number, number] => { const count = shown[key]; return count.suppressed && !count.masked ? [1, 4] : [0, Infinity] }
  return hidden.filter((key) => {
    const others = hidden.filter((item) => item !== key)
    const low = Math.max(bounds(key)[0], hiddenSum - others.reduce((sum, item) => sum + bounds(item)[1], 0))
    const high = Math.min(bounds(key)[1], hiddenSum - others.reduce((sum, item) => sum + bounds(item)[0], 0))
    return raw[key] >= 1 && raw[key] <= 4 && low === high
  })
}
