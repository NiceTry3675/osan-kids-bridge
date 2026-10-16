import { DISPLAY_LANGUAGES } from '../types'
import type { AttendanceRule, CompanionRule, DisplayLanguage, Evidence, ProgramRecord } from '../types'
import { unverifiedFacts } from '../review/critical'
import { AUDIENCE_LABELS, formatTable, REVIEW_LABELS, summaryStatusText, TARGET_LABELS } from '../review/format'
import { effectiveReviewStatus, factsHash, isApprovedSummary } from '../review/hash'
import { approveRecord, LANGUAGES_NEEDING_REVIEWER, rejectRecord, resetReview } from '../review/lifecycle'
import { isValidProgramId, loadRecord, loadRecords, loadTranscripts, saveRecord } from '../store'

// 사람 검수 CLI. 승인할 때 사실 해시를 기록하고, 그 뒤 사실이 바뀌면 API에서 내려간다(stale).

const USAGE = `사용법:
  npm run review                                   공고 목록과 검수 상태
  npm run review -- show <ID>                      사실·근거 인용·경고·요약·판독문
  npm run review -- approve <ID> --reviewer 이름 [--summaries 언어,...] [--language-reviewer 이름] [--note "메모"] [--force]
      --reviewer           원문 사실 대조자 (필수)
      --summaries          함께 승인할 요약 언어 (ko-easy, vi, zh 중에서 쉼표로). 자동 대조를 통과한 요약만 승인
      --language-reviewer  그 언어의 최종 검수자. vi·zh 요약을 승인하려면 필수 (ko-easy는 없으면 --reviewer)
      --force              원문 근거가 확인되지 않은 핵심 사실이 있어도 승인
  npm run review -- reject <ID> --reviewer 이름 --note "사유"
  npm run review -- reset <ID>                     검수 대기로 되돌림 (승인한 요약도 '대조'로)`

interface ReviewArgs {
  command: string
  id: string | null
  reviewer: string | null
  languageReviewer: string | null
  note: string | null
  summaries: DisplayLanguage[]
  force: boolean
}

/** '--summaries vi,zh'의 언어 목록 */
function parseLanguages(value: string): DisplayLanguage[] {
  const languages = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
  const unknown = languages.filter((language) => !DISPLAY_LANGUAGES.includes(language as DisplayLanguage))
  if (!languages.length || unknown.length) throw new Error(`--summaries에는 ${DISPLAY_LANGUAGES.join(', ')} 중에서 적어 주세요${unknown.length ? ` (알 수 없음: ${unknown.join(', ')})` : ''}.`)
  return languages as DisplayLanguage[]
}

function parseArgs(argv: string[]): ReviewArgs {
  const args: ReviewArgs = { command: 'list', id: null, reviewer: null, languageReviewer: null, note: null, summaries: [], force: false }
  const positional: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = () => {
      const next = argv[++index]
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} 뒤에 값을 적어 주세요.`)
      return next.trim()
    }
    if (arg === '--reviewer') args.reviewer = value() || null
    else if (arg === '--language-reviewer') args.languageReviewer = value() || null
    else if (arg === '--note') args.note = value() || null
    else if (arg === '--summaries') args.summaries = parseLanguages(value())
    else if (arg === '--force') args.force = true
    else if (arg === '--help' || arg === '-h') positional.splice(0, positional.length, 'help')
    else if (arg.startsWith('-')) throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    else positional.push(arg)
  }
  args.command = positional[0] ?? 'list'
  args.id = positional[1] ?? null
  return args
}

function requireRecord(id: string | null): ProgramRecord {
  if (!id) throw new Error('프로그램 ID를 적어 주세요.')
  if (!isValidProgramId(id)) throw new Error(`프로그램 ID가 올바르지 않습니다: ${id}`)
  const record = loadRecord(id)
  if (!record) throw new Error(`저장된 공고가 없습니다: ${id} (npm run ingest -- ${id})`)
  return record
}

// ---- 목록 ----

function list(): void {
  const records = loadRecords(undefined, (message) => console.log(`! ${message}`))
  if (!records.length) {
    console.log('저장된 공고가 없습니다. npm run ingest 로 inbox의 공고를 먼저 처리하세요.')
    return
  }
  const counts = { pending: 0, approved: 0, rejected: 0, stale: 0 }
  const rows = records.map((record) => {
    const status = effectiveReviewStatus(record)
    counts[status] += 1
    return [
      record.program_id,
      record.title,
      REVIEW_LABELS[status],
      `${AUDIENCE_LABELS[record.audience]} (${TARGET_LABELS[record.target_type]})`,
      String(record.warnings.length),
      summaryStatusText(record),
    ]
  })
  console.log(formatTable(['ID', '제목', '검수 상태', '대상', '경고', '요약'], rows, 36))
  console.log(`\n공고 ${records.length}건 · 게시 ${counts.approved} · 검수 대기 ${counts.pending} · stale ${counts.stale} · 반려 ${counts.rejected}`)
}

// ---- 상세 ----

const ATTENDANCE_LABELS: Record<AttendanceRule, string> = { all_sessions: '전 회차 참석', choose_one: '한 회차 선택', unknown: '미상' }
const COMPANION_LABELS: Record<CompanionRule, string> = { required: '필수', allowed: '가능', not_allowed: '불가', unknown: '미상' }

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '미상'
  if (typeof value === 'boolean') return value ? '예' : '아니오'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '없음(확인됨)'
  return String(value)
}

const rangeText = (range: [number, number] | null) => (range ? `${range[0]}~${range[1]}` : null)

function printFact(label: string, value: unknown, evidence: Evidence[], used: Set<Evidence>, fields: string[]): void {
  const quotes = evidence.filter((entry) => fields.includes(entry.field))
  quotes.forEach((entry) => used.add(entry))
  const known = valueText(value) !== '미상'
  const flag = known && fields.length && !quotes.some((entry) => entry.verified) ? '  [근거 미확인]' : ''
  console.log(`■ ${label}: ${valueText(value)}${flag}`)
  for (const entry of quotes) console.log(`    ${entry.verified ? '✓' : '✗'} "${entry.quote}"${entry.verified ? '' : '  (원문에서 찾지 못함)'}`)
}

function show(id: string | null): void {
  const record = requireRecord(id)
  const status = effectiveReviewStatus(record)
  const { review, source } = record
  const used = new Set<Evidence>()
  const fact = (label: string, value: unknown, fields: string[] = []) => printFact(label, value, record.evidence, used, fields)

  console.log(`${record.title}  [${record.program_id}]`)
  console.log(`검수 상태: ${REVIEW_LABELS[status]}${review.reviewer ? ` · 검수자 ${review.reviewer}` : ''}${review.reviewed_at ? ` · ${review.reviewed_at}` : ''}`)
  if (review.notes) console.log(`검수 메모: ${review.notes}`)
  if (status === 'stale') console.log(`  승인 때 사실 해시 ${review.facts_hash?.slice(0, 12)}… ≠ 지금 ${factsHash(record).slice(0, 12)}…`)
  console.log(`원문: ${source.url ?? '(주소 없음)'} · 확인일 ${source.retrieved_at ?? '미상'} · 파일 ${source.files.join(', ') || '없음'}`)
  console.log(`추출: ${record.extracted_at} · ${record.model} · 원문 해시 ${source.content_hash.slice(0, 12)}…`)

  console.log('\n[사실과 원문 근거]  ✓ 원문에서 찾은 인용  ✗ 찾지 못한 인용')
  fact('제목', record.title, ['title'])
  fact('기관', record.institution, ['institution'])
  fact('분야', record.category)
  fact('참여하는 사람', record.audience === 'unknown' ? null : `${AUDIENCE_LABELS[record.audience]} (${record.audience})`, ['audience'])
  fact('대상 구분', record.target_type === 'unknown' ? null : `${TARGET_LABELS[record.target_type]} (${record.target_type})`, ['target_type'])
  fact('대상 원문 표현', record.target_raw, ['target_raw'])
  fact('학년 범위 (1~6 초등, 7~9 중, 10~12 고)', rangeText(record.grade_range), ['grade_range'])
  fact('나이 범위', rangeText(record.age_range), ['age_range'])
  fact('참여 자격', record.eligibility_requirements, ['eligibility_requirements'])
  fact('보호자 동반', COMPANION_LABELS[record.guardian_companion], ['guardian_companion'])
  fact('형제자매 동반', COMPANION_LABELS[record.sibling_companion], ['sibling_companion'])
  fact('필요 한국어 수준', record.korean_level_required, ['korean_level_required'])
  fact('기관 지원 언어', record.support_languages, ['support_languages'])
  fact('신청 페이지 언어', record.application_languages, ['application_languages'])
  if (record.evidence.some((entry) => entry.field === 'venue')) fact('공통 장소 (회차 장소의 근거)', '아래 회차 참고', ['venue'])
  if (!record.sessions.length) console.log('■ 회차: 날짜가 확인된 회차 없음')
  for (const session of record.sessions) {
    const time = session.start_time || session.end_time ? `${session.start_time ?? '?'}~${session.end_time ?? '?'}` : '시각 미상'
    const place = [session.place_name, session.address && `(${session.address})`].filter(Boolean).join(' ') || '장소 미상'
    const extra = [session.dong ? `행정동 ${session.dong}` : '행정동 미상', session.online ? '온라인' : null].filter(Boolean).join(' · ')
    fact(`회차 ${session.id}`, `${session.date ?? '날짜 미상'} ${time} · ${place} · ${extra}`,
      ['date', 'time', 'place'].map((suffix) => `sessions[${session.id}].${suffix}`))
  }
  fact('운영 기간', record.period_start || record.period_end ? `${record.period_start ?? '?'} ~ ${record.period_end ?? '?'}` : null, ['period'])
  fact('총 회차 수', record.session_count, ['session_count'])
  fact('참석 방식', ATTENDANCE_LABELS[record.attendance_rule], ['attendance_rule'])
  fact('중도 참여 허용', record.mid_join_allowed, ['mid_join_allowed'])
  fact('비용', record.cost_krw === null && record.cost_raw === null ? null : `${record.cost_krw === null ? '금액 미상' : `${record.cost_krw}원`}${record.cost_raw ? ` (원문: ${record.cost_raw})` : ''}`, ['cost'])
  fact('정원', record.capacity, ['capacity'])
  fact('신청 기간', record.application_start || record.application_end ? `${record.application_start ?? '?'} ~ ${record.application_end ?? '?'}` : null, ['application_period'])
  if (!record.application_methods.length) console.log('■ 신청 방법: 미상')
  for (const method of record.application_methods) {
    const detail = [method.url, method.phone, method.address].filter(Boolean).join(' · ')
    fact(`신청 방법 (${method.type})`, `${method.label}${detail ? ` — ${detail}` : ''}`, [`application_methods.${method.type}`])
  }
  fact('소개 (모델 작성, 원문 인용 아님)', record.description)
  const rest = record.evidence.filter((entry) => !used.has(entry))
  if (rest.length) {
    console.log('■ 그 밖의 근거')
    for (const entry of rest) console.log(`    ${entry.verified ? '✓' : '✗'} [${entry.field}] "${entry.quote}"`)
  }

  const missing = unverifiedFacts(record)
  console.log(`\n[승인 전 확인] ${missing.length
    ? `원문 근거가 없거나 지금 값이 근거 인용과 맞지 않는 핵심 사실 ${missing.length}개: ${missing.join(', ')}`
    : '핵심 사실의 지금 값이 모두 원문 인용과 맞음'}`)
  console.log(`\n[경고 ${record.warnings.length}개]`)
  for (const warning of record.warnings) console.log(`  - ${warning}`)
  console.log(`\n[확인 필요 사항 ${record.uncertain_items.length}개]`)
  for (const item of record.uncertain_items) console.log(`  - ${item}`)

  console.log('\n[언어별 요약]')
  for (const language of DISPLAY_LANGUAGES) {
    const summary = record.summaries_by_language[language]
    if (!summary) {
      console.log(`${language}: 없음`)
      continue
    }
    const approval = summary.status !== 'approved' ? ''
      : !isApprovedSummary(record, language, summary) ? ' · 승인 뒤 사실이나 문구가 바뀌어 내보내지 않음 (다시 승인 필요)'
        : language !== 'ko-easy' && !summary.heading
          ? ` · 머리글(제목·기관·대상)이 없어 내보내지 않음 (npm run headings -- ${record.program_id} --language ${language} --force 뒤 다시 승인)`
          : ` · 최종 검수자 ${summary.reviewer ?? '미기재'} · 승인 ${summary.approved_at ?? '?'}`
    console.log(`${language}: ${summary.status} · ${summary.generated_at}${approval}`)
    if (summary.heading) console.log(`  제목 ${summary.heading.title}\n  기관 ${summary.heading.institution}\n  대상 ${summary.heading.target}`)
    summary.lines.forEach((line, index) => console.log(`  ${index + 1}. ${line}`))
    for (const issue of summary.issues) console.log(`  ! ${issue}`)
  }

  const transcripts = loadTranscripts(record.program_id, undefined, (message) => console.log(`! ${message}`))
  console.log(`\n[포스터 판독문 ${transcripts.length}개]`)
  for (const transcript of transcripts) {
    console.log(`--- ${transcript.file}`)
    console.log(transcript.text)
  }
}

// ---- 상태 변경 ----

function requireReviewer(args: ReviewArgs): string {
  if (!args.reviewer) throw new Error('검수자 이름을 --reviewer 이름 으로 적어 주세요 (검수 기록에 남습니다).')
  return args.reviewer
}

function approve(args: ReviewArgs): void {
  const record = requireRecord(args.id)
  const reviewer = requireReviewer(args)
  const needLanguageReviewer = args.summaries.filter((language) => LANGUAGES_NEEDING_REVIEWER.includes(language))
  if (needLanguageReviewer.length && !args.languageReviewer) {
    throw new Error(`${needLanguageReviewer.join(', ')} 요약은 그 언어의 최종 검수자가 원문 사실과 대조한 뒤 승인합니다. --language-reviewer 이름 을 적어 주세요.`)
  }
  const missing = unverifiedFacts(record)
  if (missing.length && !args.force) {
    console.log(`원문 근거가 없거나 근거와 맞지 않는 핵심 사실이 있어 승인하지 않았습니다: ${missing.join(', ')}`)
    console.log(`npm run review -- show ${record.program_id} 로 원문과 대조한 뒤, 맞으면 --force를 붙여 승인하세요.`)
    process.exitCode = 1
    return
  }
  const updated = approveRecord(record, {
    reviewer, now: new Date(), notes: args.note, summaries: args.summaries, languageReviewer: args.languageReviewer,
  })
  saveRecord(updated)
  console.log(`승인했습니다: ${record.program_id} (검수자 ${reviewer}, 사실 해시 ${updated.review.facts_hash!.slice(0, 12)}…)`)
  if (missing.length) console.log(`  --force: 근거 미확인 사실 ${missing.join(', ')}`)
  if (record.warnings.length) console.log(`  추출 경고 ${record.warnings.length}개가 있습니다 (show로 확인).`)
  for (const language of DISPLAY_LANGUAGES) {
    const before = record.summaries_by_language[language]
    const after = updated.summaries_by_language[language]
    if (!after) {
      if (args.summaries.includes(language)) console.log(`  ${language}: 요약 없음`)
    } else if (args.summaries.includes(language)) {
      if (after.status === 'approved') console.log(`  ${language}: 요약 승인 (최종 검수자 ${after.reviewer})`)
      else console.log(`  ${language}: 자동 대조를 통과하지 못해 승인하지 않았습니다 (문제 ${after.issues.length}개, show로 확인)`)
    } else if (after.status === 'approved') {
      console.log(`  ${language}: 이전 요약 승인 유지 (사실·문구가 승인 때와 같음)`)
    } else if (before?.status === 'approved') {
      console.log(`  ${language}: 사실이나 문구가 승인 때와 달라 요약 승인을 거뒀습니다 (--summaries ${language}로 다시 승인)`)
    }
  }
  if (!DISPLAY_LANGUAGES.some((language) => updated.summaries_by_language[language]?.status === 'approved')) {
    console.log('  승인된 언어별 요약이 없습니다. API는 승인된 요약만 내보냅니다 (--summaries 언어 로 함께 승인).')
  }
}

function reject(args: ReviewArgs): void {
  const record = requireRecord(args.id)
  const reviewer = requireReviewer(args)
  if (!args.note) throw new Error('반려 사유를 --note "..."로 적어 주세요.')
  saveRecord(rejectRecord(record, { reviewer, now: new Date(), notes: args.note }))
  console.log(`반려했습니다: ${record.program_id} — ${args.note}`)
}

function reset(args: ReviewArgs): void {
  const record = requireRecord(args.id)
  saveRecord(resetReview(record))
  console.log(`검수 대기로 되돌렸습니다: ${record.program_id} (이전 상태: ${REVIEW_LABELS[effectiveReviewStatus(record)]})`)
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  switch (args.command) {
    case 'list': return list()
    case 'show': return show(args.id)
    case 'approve': return approve(args)
    case 'reject': return reject(args)
    case 'reset': return reset(args)
    case 'help': return console.log(USAGE)
    default: throw new Error(`알 수 없는 명령입니다: ${args.command}`)
  }
}

try {
  main()
} catch (error) {
  console.error(`오류: ${(error as Error)?.message ?? error}\n\n${USAGE}`)
  process.exitCode = 1
}
