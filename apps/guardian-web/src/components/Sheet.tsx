import { Sheet as SharedSheet } from '@osan-kids-bridge/ui'
import type { SheetProps } from '@osan-kids-bridge/ui'
import { useI18n } from '../i18n'

/** 공통 시트(packages/ui)에 화면 언어의 ‘닫기’만 붙입니다. 조건 넣기(03)와 신청·물어보기(06)가 씁니다. */
export function Sheet(props: Omit<SheetProps, 'closeLabel'>) {
  const { t } = useI18n()
  return <SharedSheet {...props} closeLabel={t('close')} />
}
