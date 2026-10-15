/**
 * 보드의 휴대폰 틀 안에서 돌릴 두 앱을 시연 모드로 빌드해 src/generated/에 문자열로 둡니다.
 * - 보호자 웹: 시연 데이터, 해시 주소(#/programs/id)
 * - 운영기관 대시보드: 시연 데이터. 서체 파일은 따로 빼서 보드가 한 번만 싣습니다.
 */
import { build } from 'vite'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const apps = resolve(here, '../..')
const out = resolve(here, '../src/generated')
mkdirSync(out, { recursive: true })

async function buildApp(name, dir, env) {
  const tmp = mkdtempSync(join(tmpdir(), `flow-${name}-`))
  const saved = { ...process.env }
  Object.assign(process.env, env)
  try {
    await build({ root: join(apps, dir), base: './', logLevel: 'warn', build: { outDir: tmp, emptyOutDir: true } })
  } finally {
    for (const key of Object.keys(env)) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]
  }
  const assets = join(tmp, 'assets')
  const files = readdirSync(assets)
  const pick = (ext) => files.filter((file) => file.endsWith(ext)).map((file) => readFileSync(join(assets, file), 'utf8')).join('\n')
  let css = pick('.css')
  const font = files.find((file) => file.endsWith('.woff2'))
  if (font) {
    copyFileSync(join(assets, font), join(out, 'pretendard.woff2'))
    css = css.replace(new RegExp(`url\\(["']?\\.?/?(assets/)?${font.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\)`, 'g'), 'url(__PRETENDARD_URL__)')
  }
  writeFileSync(join(out, `${name}.css.txt`), css)
  writeFileSync(join(out, `${name}.js.txt`), pick('.js').replace(/<\/script/gi, '<\\/script'))
  rmSync(tmp, { recursive: true, force: true })
  console.log(`embeds: ${name} css ${(css.length / 1024).toFixed(0)}KB`)
}

await buildApp('guardian', 'guardian-web', { VITE_DATA_MODE: 'demo', VITE_ROUTER: 'hash' })
await buildApp('dashboard', 'institution-dashboard', { VITE_DATA_MODE: 'demo' })
