import {
  DEMO_RECORD_COUNT, DEMO_SEED, DONG_HOUSEHOLD_WEIGHTS, GRADE_WEIGHTS, INTEREST_PROBABILITIES, KOREAN_LEVEL_RESPONSE_RATE,
  KOREAN_LEVEL_WEIGHTS, SCREEN_LANGUAGE_WEIGHTS, SLOTS_PER_HOUSEHOLD_WEIGHTS, SLOT_WEIGHTS,
} from './assumptions'
import { INTERESTS } from '../lib/labels'
import { SLOTS, slotParts, sortSlots } from '../lib/slots'
import type { DemandResponse, Grade, SlotKey } from '../types'

/** 32비트 시드 PRNG(mulberry32). 같은 시드면 항상 같은 수열을 냅니다. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function weightedPick<T>(entries: [T, number][], random: () => number): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let target = random() * total
  for (const [value, weight] of entries) {
    target -= weight
    if (target < 0) return value
  }
  return entries[entries.length - 1][0]
}

const entriesOf = <K extends string | number>(record: Record<K, number>): [K, number][] =>
  Object.entries(record).map(([key, weight]) => [(/^\d+$/.test(key) ? Number(key) : key) as K, weight as number])

const slotWeight = (slot: SlotKey): number => { const [day, part] = slotParts(slot); return SLOT_WEIGHTS[day][part] }

/** 가중치에 따라 겹치지 않게 count칸을 고릅니다. */
function pickSlots(count: number, random: () => number): SlotKey[] {
  const pool: [SlotKey, number][] = SLOTS.map((slot) => [slot, slotWeight(slot)])
  const chosen: SlotKey[] = []
  while (chosen.length < count && pool.length) {
    const slot = weightedPick(pool, random)
    chosen.push(slot)
    pool.splice(pool.findIndex(([candidate]) => candidate === slot), 1)
  }
  return sortSlots(chosen)
}

/**
 * 시연용 합성 수요 데이터를 만듭니다. 실제 응답이 아니며 assumptions.ts의 가정만 따릅니다.
 * 이름·연락처·주소·출신국 같은 항목은 만들지 않습니다.
 */
export function generateDemand(seed = DEMO_SEED, count = DEMO_RECORD_COUNT): DemandResponse[] {
  const random = mulberry32(seed)
  const dongs = entriesOf(DONG_HOUSEHOLD_WEIGHTS)
  const grades = entriesOf(GRADE_WEIGHTS) as [Grade, number][]
  const slotCounts = entriesOf(SLOTS_PER_HOUSEHOLD_WEIGHTS)
  const languages = entriesOf(SCREEN_LANGUAGE_WEIGHTS)
  const levels = entriesOf(KOREAN_LEVEL_WEIGHTS)
  return Array.from({ length: count }, (_, index) => {
    const response: DemandResponse = {
      id: `demo-${String(index + 1).padStart(4, '0')}`,
      dong: weightedPick(dongs, random),
      child_grade: weightedPick(grades, random),
      available_slots: pickSlots(weightedPick(slotCounts, random), random),
      interests: INTERESTS.filter((interest) => random() < INTEREST_PROBABILITIES[interest]),
      screen_language: weightedPick(languages, random),
    }
    if (random() < KOREAN_LEVEL_RESPONSE_RATE) response.korean_level = weightedPick(levels, random)
    return response
  })
}

/** 화면 전체가 함께 쓰는 시연 데이터(모듈을 처음 불러올 때 한 번 만듭니다) */
export const DEMO_RESPONSES: DemandResponse[] = generateDemand()
