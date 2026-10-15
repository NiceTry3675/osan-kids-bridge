/** scripts/embeds.mjs가 만든 두 앱의 시연 빌드. 서체는 한 번만 풀어 모든 틀이 같이 씁니다. */
import guardianCss from './generated/guardian.css.txt?raw'
import guardianJs from './generated/guardian.js.txt?raw'
import dashboardCss from './generated/dashboard.css.txt?raw'
import dashboardJs from './generated/dashboard.js.txt?raw'
import pretendardData from './generated/pretendard.woff2?inline'
import type { AppName } from './flows'
import type { AppBundle } from './frame'

let fontUrl: string | null = null

/** data: 주소를 blob 주소로 바꿔 둡니다. 틀마다 2MB 문자열을 복사하지 않기 위해서입니다. */
export function pretendardUrl(): string {
  if (fontUrl) return fontUrl
  try {
    const base64 = pretendardData.slice(pretendardData.indexOf(',') + 1)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    fontUrl = URL.createObjectURL(new Blob([bytes], { type: 'font/woff2' }))
  } catch {
    fontUrl = pretendardData
  }
  return fontUrl
}

const cache = new Map<AppName, AppBundle>()

export function bundleFor(app: AppName): AppBundle {
  const hit = cache.get(app)
  if (hit) return hit
  const css = (app === 'guardian' ? guardianCss : dashboardCss).replaceAll('__PRETENDARD_URL__', pretendardUrl())
  const bundle = { css, js: app === 'guardian' ? guardianJs : dashboardJs }
  cache.set(app, bundle)
  return bundle
}
