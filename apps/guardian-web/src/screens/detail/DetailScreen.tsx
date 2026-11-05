import { useState } from 'react'
import { useI18n } from '../../i18n'
import type { Program, SearchFilters } from '../../data/types'
import { hasMatchConditions } from '../../data/api'
import { canApply, consultsIn, programText } from '../../lib/content'
import { isSafeUrl, screenLanguageName } from '../../lib/format'
import { backToList, navigate, programPath } from '../../lib/router'
import { Icon } from '../../components/Icon'
import { Notice, StatePanel } from '../../components/feedback'
import { ActionSheet } from './ActionSheet'
import type { ActionTab } from './ActionSheet'
import { AddendaSection, ApplicationIssueNotice, CompareSection, DescriptionSection, FactSheet, ParticipationSection, SessionsSection, StatusNote, ToCheck } from './sections'
import { PosterSection, PosterThumb } from './PosterSection'
import { usePosterInfo } from './usePosterInfo'
import { useProgram } from './useProgram'
import { ChatSheet } from '../chat/ChatSheet'
import { ConditionSheet } from '../home/ConditionSheet'

interface Props {
  id: string
  /** 목록이나 AI 상담에서 들어왔을 때만 조건을 넘깁니다. 공유 링크로 바로 열면 null. */
  filters: SearchFilters | null
  /** 지금 넣어 둔 아이 조건. 상세에서 조건을 넣어 바로 비교할 때 씁니다. */
  conditions?: SearchFilters
  onConditionsChange?: (filters: SearchFilters) => void
}

/** 05 상세 페이지(/programs/{id}). 07 ‘내 언어 안내가 없을 때’도 이 페이지의 상태입니다. */
export function DetailScreen({ id, filters, conditions, onConditionsChange }: Props) {
  const { locale, t } = useI18n()
  const [state, retry] = useProgram(id, filters, locale)

  return (
    <main className="page page--detail" id="main" tabIndex={-1}>
      <div className="bar-top">
        <button type="button" className="btn btn--quiet btn--back" onClick={backToList}><Icon name="back" />{t('back')}</button>
        {state.status === 'ready' && <CopyLink />}
      </div>
      {state.status === 'loading' && <StatePanel busy title={t('loading')} />}
      {state.status === 'error' && (state.missingApi
        ? <StatePanel title={t('missingApi')} hint={t('missingApiHint')} />
        : <StatePanel title={t('loadError')} hint={t('loadErrorHint')} action={<button type="button" className="btn btn--secondary" onClick={retry}>{t('retry')}</button>} />)}
      {state.status === 'missing' && (
        <StatePanel title={t('missingTitle')} hint={t('missingHint')} action={<button type="button" className="btn btn--primary" onClick={() => navigate('/')}>{t('browseOthers')}</button>} />
      )}
      {state.status === 'ready' && <ProgramDetail id={id} program={state.program} compared={filters !== null && hasMatchConditions(filters)} conditions={conditions} onConditionsChange={onConditionsChange} />}
    </main>
  )
}

interface DetailProps {
  id: string
  program: Program
  compared: boolean
  conditions?: SearchFilters
  onConditionsChange?: (filters: SearchFilters) => void
}

/**
 * 순서: 머리글 → 신청 기간 경고 → 조건을 넣고 왔으면 ‘맞아요’ 요약 → 핵심 사실 → 기관이 덧붙인 안내 → 기관에 확인할 점 →
 * 포스터 → 전체 회차 → 소개 → 확인된 참여 정보. 신청 전에 알아야 할 경고는 버튼에 가려지지 않게 맨 위에 둡니다.
 * 비교하지 않았으면 비교 구역을 두지 않고, 여기서 바로 조건을 넣어 비교할 수 있게 합니다.
 */
function ProgramDetail({ id, program, compared, conditions, onConditionsChange }: DetailProps) {
  const { locale, t } = useI18n()
  const [sheet, setSheet] = useState<ActionTab | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [conditionsOpen, setConditionsOpen] = useState(false)
  const posters = usePosterInfo(program)
  const text = programText(program, locale)
  const language = screenLanguageName(locale)

  return (
    <article className="detail">
      {program.review_state === 'recheck' && <Notice tone="warn" title={t('recheckTitle')}>{t('recheckBody')}</Notice>}
      {text.missingTranslation && (
        <Notice tone="mark" title={t('noSummaryTitle', { language })}>
          <p>{t('noSummaryBody', { language })}</p>
          <p>{consultsIn(program, locale) ? t('noSummaryAlt', { language }) : t('noSummaryNoAlt', { language })}</p>
        </Notice>
      )}

      <header className="detail-head">
        <div className="detail-head-top">
          <div className="detail-head-text">
            <h1 className="detail-title">
              <span lang={text.lang}>{text.title}</span>
              {text.missingTranslation && <span className="tag-original">{t('originalTag')}</span>}
            </h1>
          </div>
          <PosterThumb programId={program.program_id} posters={posters} />
        </div>
        {text.reviewed && locale !== 'ko-easy' && <p className="reviewed-line"><Icon name="check" />{t('reviewedSummary', { language })}</p>}
      </header>

      <ApplicationIssueNotice program={program} />
      {compared && <CompareSection program={program} />}
      <FactSheet program={program} text={text} />
      <StatusNote program={program} />
      {!compared && conditions && onConditionsChange && (
        <button type="button" className="link-btn detail-compare-link" onClick={() => setConditionsOpen(true)}>{t('compareLink')}</button>
      )}
      <AddendaSection program={program} />
      <ToCheck program={program} onAsk={() => setSheet('ask')} />
      <PosterSection programId={program.program_id} posters={posters} />
      <SessionsSection program={program} />
      <DescriptionSection program={program} text={text} />
      <ParticipationSection program={program} />

      <div className="action-bar">
        <button type="button" className="btn btn--outline btn--lg" onClick={() => setSheet('ask')}>{t('askButton')}</button>
        <PrimaryAction program={program} onOpen={() => setSheet('apply')} />
      </div>
      <ActionSheet program={program} tab={sheet} onTab={setSheet} onClose={() => setSheet(null)} onOpenChat={() => { setSheet(null); setChatOpen(true) }} />
      <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} program={program} suggestions={['chatSuggestFit', 'chatSuggestMaterials', 'chatSuggestHowApply']} />
      {conditions && onConditionsChange && (
        <ConditionSheet
          open={conditionsOpen}
          filters={conditions}
          submitLabel={t('compareApply')}
          onClose={() => setConditionsOpen(false)}
          onApply={(next) => {
            onConditionsChange(next)
            setConditionsOpen(false)
            // 시트의 기록이 빠진 뒤 이 공고의 기록에 표시해, 이 공고에 머물며 비교합니다. 뒤로 가기는 한 번에 앞 화면으로 갑니다.
            window.addEventListener('popstate', () => {
              navigate(programPath(id), { ...(window.history.state as object | null), compare: true }, { replace: true })
            }, { once: true })
          }}
        />
      )}
    </article>
  )
}

/** 하단 오른쪽 버튼: 신청 중이면 ‘신청하러 가기’, 마감이면 다른 프로그램, 그 밖에는 원문의 신청 방법 */
function PrimaryAction({ program, onOpen }: { program: Program; onOpen: () => void }) {
  const { t } = useI18n()
  if (program.application_status === 'closed') return <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('/')}>{t('browseOthers')}</button>
  return <button type="button" className="btn btn--primary btn--lg" onClick={onOpen}>{canApply(program) ? t('applyButton') : !program.application_methods.length && isSafeUrl(program.source_url) ? t('seeOriginalHowTo') : t('howToApply')}</button>
}

function CopyLink() {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch { /* 주소창에서 복사할 수 있습니다. */ }
  }
  return (
    <button type="button" className="btn btn--quiet" onClick={copy} aria-live="polite">
      <Icon name={copied ? 'check' : 'link'} />{copied ? t('linkCopied') : t('copyLink')}
    </button>
  )
}
