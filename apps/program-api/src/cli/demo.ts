import { DEMO_NOW } from '../config'
import { approveRecord } from '../review/lifecycle'
import { unverifiedFacts } from '../review/critical'
import { effectiveReviewStatus } from '../review/hash'

// 시연용 데이터(demo/)로 서버를 띄우거나, 시연 공고를 한 번에 승인한다.
// npm run demo            : demo 데이터로 API 실행 (기준 시각 고정, 자동 대조를 통과한 요약도 표시, 응답의 is_demo는 true)
// npm run demo:approve    : demo 공고 중 근거가 확인된 공고를 '시연 데이터' 검수자로 승인
// npm run demo:ingest -- <ID ...> : demo/inbox의 공고를 Gemini로 추출·요약한 뒤 바로 승인 (현장 시연용, 키 필요)

const DEMO_REVIEWER = '시연 데이터'

process.env.PROGRAM_DATA_DIR ??= 'demo'
process.env.PROGRAM_API_NOW ??= DEMO_NOW
process.env.SHOW_MACHINE_CHECKED_SUMMARIES ??= '1'
process.env.PROGRAM_DEMO ??= '1'

const [command = 'serve'] = process.argv.slice(2)

async function approveAll(): Promise<void> {
  const { loadRecords, saveRecord } = await import('../store')
  const now = new Date(process.env.PROGRAM_API_NOW ?? DEMO_NOW)
  let approved = 0
  for (const record of loadRecords()) {
    if (effectiveReviewStatus(record) === 'approved') continue
    const missing = unverifiedFacts(record)
    if (missing.length) {
      console.log(`건너뜀 ${record.program_id}: 근거 미확인 ${missing.join(', ')}`)
      continue
    }
    saveRecord(approveRecord(record, { reviewer: DEMO_REVIEWER, now }))
    approved += 1
    console.log(`승인 ${record.program_id}`)
  }
  console.log(`시연 공고 ${approved}건 승인`)
}

if (command === 'serve') {
  const { startServer } = await import('../server')
  startServer()
} else if (command === 'approve') {
  await approveAll()
} else if (command === 'ingest') {
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const ingest = fileURLToPath(new URL('./ingest.ts', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', 'tsx', ingest, ...process.argv.slice(3)], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status ?? 1)
  await approveAll()
} else {
  console.error('사용법: npm run demo | npm run demo:approve | npm run demo:ingest -- <ID ...>')
  process.exit(1)
}
