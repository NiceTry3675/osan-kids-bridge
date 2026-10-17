import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { posterDir } from '../config'
import { findSourcePoster, POSTER_LANGUAGES, readReport, translatePoster, writeReport } from '../poster/translate'
import type { PosterLanguage } from '../poster/tokens'

// 포스터 통번역 (원본 디자인 유지 + 검증 루프)
// npm run poster -- [ID ...] [--lang vi,zh] [--attempts 3] [--force]   inbox에 포스터가 있는 공고를 옮긴다
//   --demo-fault  시연용: 1회차 지시에 일부러 오류를 넣어 검증 루프가 잡아 고치는 장면을 만든다 (--force와 함께)
// npm run poster -- list                                              언어별 결과와 검증 상태
// npm run poster -- approve <ID> --lang vi --reviewer 이름              사람이 확인한 번역 포스터를 승인

const args = process.argv.slice(2)
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return undefined
  const value = args[index + 1]
  args.splice(index, 2)
  return value
}
const has = (name: string) => {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return false
  args.splice(index, 1)
  return true
}

const languages = (flag('lang') ?? 'vi,zh').split(',').map((value) => value.trim()) as PosterLanguage[]
for (const language of languages) {
  if (!POSTER_LANGUAGES.includes(language)) {
    console.error(`지원하지 않는 언어: ${language} (vi, zh)`)
    process.exit(1)
  }
}
const attempts = Number(flag('attempts') ?? 3)
const reviewer = flag('reviewer')
const force = has('force')
const demoFault = has('demo-fault')
const [command] = args

function postersInInbox(): string[] {
  const inbox = join(posterDir(), 'inbox')
  if (!existsSync(inbox)) return []
  return readdirSync(inbox).filter((id) => findSourcePoster(id) !== null).sort()
}

if (command === 'list') {
  for (const id of postersInInbox()) {
    const cells = POSTER_LANGUAGES.map((language) => {
      const report = readReport(id, language)
      if (!report) return `${language} -`
      const tries = report.attempts.length
      return `${language} ${report.status}${report.chosen_attempt ? ` (${report.chosen_attempt}/${tries}회차)` : ` (${tries}회 시도)`}`
    })
    console.log(`${id.padEnd(28)} ${cells.join('   ')}`)
  }
} else if (command === 'approve') {
  const id = args[1]
  if (!id || !reviewer) {
    console.error('사용법: npm run poster -- approve <ID> --lang vi --reviewer 이름')
    process.exit(1)
  }
  for (const language of languages) {
    const report = readReport(id, language)
    if (!report || report.chosen_attempt === null) {
      console.error(`${id} ${language}: 자동 검증을 통과한 번역 포스터가 없어 승인할 수 없습니다.`)
      process.exitCode = 1
      continue
    }
    writeReport({ ...report, status: 'approved', reviewer, approved_at: new Date().toISOString() })
    console.log(`승인 ${id} ${language} (${reviewer})`)
  }
} else {
  const ids = args.length ? args : postersInInbox()
  if (!ids.length) console.log(`${join(posterDir(), 'inbox')}에 포스터가 있는 공고가 없습니다.`)
  const summary: string[] = []
  for (const id of ids) {
    const source = findSourcePoster(id)
    if (!source) {
      console.error(`${id}: 포스터 이미지가 없습니다.`)
      process.exitCode = 1
      continue
    }
    for (const language of languages) {
      const existing = readReport(id, language)
      if (!force && existing && existing.source_sha256 === source.sha256 && existing.status !== 'failed') {
        summary.push(`${id} ${language}: 건너뜀 (이미 ${existing.status})`)
        continue
      }
      console.log(`\n■ ${id} → ${language}`)
      try {
        const report = await translatePoster(id, language, { maxAttempts: attempts, demoFault, log: (message) => console.log(message) })
        summary.push(`${id} ${language}: ${report.status}${report.chosen_attempt ? ` (${report.chosen_attempt}회차 통과)` : ''}`)
      } catch (error) {
        process.exitCode = 1
        summary.push(`${id} ${language}: 오류 ${(error as Error).message}`)
      }
    }
  }
  console.log(`\n${summary.join('\n')}`)
}
