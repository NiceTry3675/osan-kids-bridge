/**
 * 두 앱을 시연 모드로 빌드해, 휴대폰 틀 하나에 담은 단일 HTML로 만듭니다(dist-preview/).
 * 링크로 공유하는 시연 페이지용입니다. 서체 같은 CSS 안 파일은 data: 주소로 넣습니다.
 *   npm run preview            → dist-preview/guardian.html, dist-preview/dashboard.html
 */
import { build } from 'vite'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shellPage } from './src/shell.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const out = join(root, 'dist-preview')
mkdirSync(out, { recursive: true })

const APPS = [
  { name: 'guardian', dir: 'apps/guardian-web', title: '오산 아이 프로그램', label: '보호자 웹', env: { VITE_DATA_MODE: 'demo', VITE_ROUTER: 'hash' } },
  { name: 'dashboard', dir: 'apps/institution-dashboard', title: '오산 아이 프로그램 기관 화면', label: '운영기관 대시보드', env: { VITE_DATA_MODE: 'demo' } },
]

const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' }

async function bundle({ name, dir, title, label, env }) {
  const tmp = mkdtempSync(join(tmpdir(), `preview-${name}-`))
  const saved = { ...process.env }
  Object.assign(process.env, env)
  try {
    await build({ root: join(root, dir), base: './', logLevel: 'warn', build: { outDir: tmp, emptyOutDir: true } })
  } finally {
    for (const key of Object.keys(env)) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]
  }
  const assets = join(tmp, 'assets')
  const files = readdirSync(assets)
  const read = (ext) => files.filter((file) => file.endsWith(ext)).map((file) => readFileSync(join(assets, file), 'utf8')).join('\n')
  const css = read('.css').replace(/url\((['"]?)([^)'"]+)\1\)/g, (match, _q, ref) => {
    if (/^(data:|https?:|#)/.test(ref)) return match
    const file = join(assets, ref.replace(/^\.\/(assets\/)?/, ''))
    const ext = file.slice(file.lastIndexOf('.'))
    return `url(data:${MIME[ext] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')})`
  })
  const page = shellPage({ title, label, css, js: read('.js') })
  writeFileSync(join(out, `${name}.html`), page)
  rmSync(tmp, { recursive: true, force: true })
  console.log(`preview: dist-preview/${name}.html ${(page.length / 1024 / 1024).toFixed(1)}MB`)
}

for (const app of APPS) await bundle(app)
