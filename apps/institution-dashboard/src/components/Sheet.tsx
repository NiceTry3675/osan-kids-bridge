import { Sheet as SharedSheet } from '@osan-kids-bridge/ui'
import type { SheetProps } from '@osan-kids-bridge/ui'
import { useLanguage } from '../i18n'

/** 보호자 웹과 같은 시트(packages/ui)에 화면 언어의 ‘닫기’만 붙입니다. */
export function Sheet(props: Omit<SheetProps, 'closeLabel'>) {
  const { t } = useLanguage()
  return <SharedSheet {...props} closeLabel={t('close')} />
}
