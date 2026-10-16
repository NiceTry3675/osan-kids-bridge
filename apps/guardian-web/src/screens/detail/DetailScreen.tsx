import { useState } from 'react'
import { useI18n } from '../../i18n'
import type { Program, SearchFilters } from '../../data/types'
import { canApply, consultsIn, programText } from '../../lib/content'
import { formatDate, interestLabel, isSafeUrl, screenLanguageName } from '../../lib/format'
import { backToList, navigate } from '../../lib/router'
import { Icon } from '../../components/Icon'
import { Notice, StatePanel } from '../../components/feedback'
import { ExternalLink } from '../../components/links'
import { ActionSheet } from './ActionSheet'
import type { ActionTab } from './ActionSheet'
import { CompareSection, DescriptionSection, FactSheet, LanguageSection, ParticipationSection, SessionsSection, StatusNote, ToCheck } from './sections'
import { PosterSection } from './PosterSection'
import { useProgram } from './useProgram'
import { ChatSheet } from '../chat/ChatSheet'
import { AiEntry } from '../chat/AiEntry'

interface Props {
  id: string
  /** 목록에서 들어왔을 때만 조건을 넘깁니다. 공유 링크로 바로 열면 null. */
  filters: SearchFilters | null
}

/** 05 상세 페이지(/programs/{id}). 07 ‘내 언어 안내가 없을 때’도 이 페이지의 상태입니다. */
export function DetailScreen({ id, filters }: Props) {
  const { locale, t } = useI18n()
  const [state, retry] = useProgram(id, filters, locale)

  return (
    <main className="page page--detail" id="main">
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
      {state.status === 'ready' && <ProgramDetail program={state.program} compared={filters !== null} />}
    </main>
  )
}

function ProgramDetail({ program, compared }: { program: Program; compared: boolean }) {
  const { locale, t } = useI18n()
  const [sheet, setSheet] = useState<ActionTab | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
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
        <p className="detail-category">{interestLabel(locale, program.category)}</p>
        <h1 className="detail-title" lang={text.lang}>
          {text.title}
          {text.missingTranslation && <span className="tag-original">{t('originalTag')}</span>}
        </h1>
        <p className="detail-org" lang={text.lang}>{text.institution}</p>
        <p className="detail-meta">
          {program.verified_at && <span>{t('verifiedAt', { date: formatDate(program.verified_at, locale) })}</span>}
          {isSafeUrl(program.source_url) && <ExternalLink href={program.source_url} demo={program.is_demo}>{t('sourceLink')}</ExternalLink>}
        </p>
        {text.reviewed && locale !== 'ko-easy' && <p className="reviewed-line"><Icon name="check" />{t('reviewedSummary', { language })}</p>}
      </header>

      <FactSheet program={program} text={text} />
      <AiEntry title={t('chatOpen')} body={t('chatOpenHomeBody')} onOpen={() => setChatOpen(true)} />
      <StatusNote program={program} />
      <ToCheck program={program} />
      <CompareSection program={program} compared={compared} />
      <PosterSection programId={program.program_id} />
      <DescriptionSection program={program} text={text} />
      <SessionsSection program={program} />
      <ParticipationSection program={program} />
      <LanguageSection program={program} />

      <div className="action-bar">
        <button type="button" className="btn btn--outline btn--lg" onClick={() => setSheet('ask')}>{t('askButton')}</button>
        <PrimaryAction program={program} onOpen={() => setSheet('apply')} />
      </div>
      <ActionSheet program={program} tab={sheet} onTab={setSheet} onClose={() => setSheet(null)} onOpenChat={() => { setSheet(null); setChatOpen(true) }} />
      <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} program={{ program_id: program.program_id, title: program.title }} suggestions={['chatSuggestFit', 'chatSuggestMaterials', 'chatSuggestHowApply']} />
    </article>
  )
}

/** 하단 오른쪽 버튼: 신청 중이면 ‘신청하러 가기’, 마감이면 다른 프로그램, 그 밖에는 원문의 신청 방법 */
function PrimaryAction({ program, onOpen }: { program: Program; onOpen: () => void }) {
  const { t } = useI18n()
  if (program.application_status === 'closed') return <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('/')}>{t('browseOthers')}</button>
  return <button type="button" className="btn btn--primary btn--lg" onClick={onOpen}>{canApply(program) ? t('applyButton') : t('seeOriginalHowTo')}</button>
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
