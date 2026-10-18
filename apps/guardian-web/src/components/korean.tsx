/** 화면 언어 문장 틀에 끼워 넣을 자리 표시: t('sourceSays', { text: SLOT })처럼 넘깁니다. */
export const SLOT = '\u0000'

/**
 * 화면 언어 문장 속 한국어(원문 표현·주소·운영 시간)에만 lang="ko"를 붙입니다.
 * 문장 전체에 붙이면 읽기 프로그램이 ‘Đến’ 같은 화면 언어 글자까지 한국어 발음으로 읽습니다.
 */
export function WithKorean({ template, text }: { template: string; text: string }) {
  const [before, after = ''] = template.split(SLOT)
  return <>{before}<span lang="ko">{text}</span>{after}</>
}
