import { DEMO_NOW } from '../config'
import { approveRecord } from '../review/lifecycle'
import { unverifiedFacts } from '../review/critical'
import { effectiveReviewStatus } from '../review/hash'

// 시연용 데이터(demo/)로 서버를 띄우거나, 시연 공고를 한 번에 승인한다.
// npm run demo            : demo 데이터의 사본(data/local/demo-session)으로 API 실행 (기준 시각 고정, 자동 대조를 통과한 요약도 표시, 관리자 API 켬)
// npm run demo:approve    : demo 공고 중 근거가 확인된 공고를 '시연 데이터' 검수자로 승인
// npm run demo:ingest -- <ID ...> : demo/inbox의 공고를 Gemini로 추출·요약한 뒤 바로 승인 (현장 시연용, 키 필요)
// npm run demo:headings -- [ID ...] : demo 요약에 베트남어·중국어 머리글(제목·기관·대상)만 채운다 (키 필요)

const DEMO_REVIEWER = '시연 데이터'
/** 시연 서버가 쓰는 사본 (gitignore된 data/local 아래). 기관 대시보드에서 승인·보완해도 커밋된 demo/는 바뀌지 않는다 */
const DEMO_SESSION_DIR = 'data/local/demo-session'

const [command = 'serve'] = process.argv.slice(2)
const ownDataDir = process.env.PROGRAM_DATA_DIR !== undefined

process.env.PROGRAM_DATA_DIR ??= 'demo'
process.env.PROGRAM_API_NOW ??= DEMO_NOW
process.env.SHOW_MACHINE_CHECKED_SUMMARIES ??= '1'

/**
 * demo/의 공고·원문을 사본 폴더에 새로 복사하고 서버가 그 사본을 쓰게 한다 (서버를 켤 때마다 처음 상태).
 * 보호자가 '기관에 알리기'로 보낸 질문(questions/)은 사본 폴더에 그대로 남긴다. DEMO_KEEP_SESSION=1이면 이전 사본을 이어 쓴다
 */
async function prepareSession(): Promise<void> {
  const { cpSync, existsSync, rmSync } = await import('node:fs')
  const { APP_ROOT } = await import('../config')
  const { join } = await import('node:path')
  const session = join(APP_ROOT, DEMO_SESSION_DIR)
  if (process.env.DEMO_KEEP_SESSION !== '1' || !existsSync(join(session, 'programs'))) {
    for (const folder of ['programs', 'inbox']) {
      rmSync(join(session, folder), { recursive: true, force: true })
      cpSync(join(APP_ROOT, 'demo', folder), join(session, folder), { recursive: true })
    }
  }
  process.env.PROGRAM_DATA_DIR = DEMO_SESSION_DIR
}

/** 같은 폴더의 CLI를 시연 환경 변수와 나머지 인자로 실행한다. 실패하면 그 종료 코드로 끝낸다 */
async function runCli(script: string): Promise<void> {
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const path = fileURLToPath(new URL(script, import.meta.url))
  const result = spawnSync(process.execPath, ['--import', 'tsx', path, ...process.argv.slice(3)], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

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
  // 기관 대시보드의 관리자 API를 켠다 (로그인이 없으므로 시연에서만)
  process.env.ADMIN_API ??= '1'
  if (!ownDataDir) await prepareSession()
  const { startServer } = await import('../server')
  startServer()
} else if (command === 'approve') {
  await approveAll()
} else if (command === 'headings') {
  // 3줄 안내는 두고 베트남어·중국어 머리글만 채운다 (키 필요)
  await runCli('./headings.ts')
} else if (command === 'ingest') {
  await runCli('./ingest.ts')
  await approveAll()
} else {
  console.error('사용법: npm run demo | npm run demo:approve | npm run demo:ingest -- <ID ...> | npm run demo:headings -- [ID ...]')
  process.exit(1)
}
