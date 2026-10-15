import { DEFAULT_PLAN } from '../data/assumptions'
import { VENUES } from '../data/venues'
import type { ProgramOption, ProgramPlan } from '../types'

/** 반 수 선택지(1~3) */
export const CLASS_COUNTS = [1, 2, 3] as const
const MAX_CLASSES = CLASS_COUNTS[CLASS_COUNTS.length - 1]

/** 추천 화면의 입력 상태. 기존 계획은 최대 반 수만큼 기억해 두고 열 반 수만큼 앞에서부터 씁니다(비교를 껐다 켜도 유지). */
export interface PlanForm extends Omit<ProgramPlan, 'baseline'> {
  baselineOn: boolean
  baseline: ProgramOption[]
}

export const initialPlanForm = (): PlanForm => {
  const baseline = DEFAULT_PLAN.baseline ?? []
  return {
    interest: DEFAULT_PLAN.interest,
    gradeRange: DEFAULT_PLAN.gradeRange,
    classCount: DEFAULT_PLAN.classCount,
    capacity: DEFAULT_PLAN.capacity,
    venueIds: VENUES.map((venue) => venue.id),
    baselineOn: baseline.length > 0,
    baseline: Array.from({ length: MAX_CLASSES }, (_, at) => baseline[at] ?? baseline[0] ?? { slot: 'sat-morning', venueId: VENUES[at % VENUES.length].id }),
  }
}

/** 화면 입력을 추천 조건으로 바꿉니다. 기존 계획은 추천과 같은 반 수로 비교합니다. */
export const toProgramPlan = ({ baselineOn, baseline, ...plan }: PlanForm): ProgramPlan =>
  (baselineOn ? { ...plan, baseline: baseline.slice(0, plan.classCount) } : plan)
