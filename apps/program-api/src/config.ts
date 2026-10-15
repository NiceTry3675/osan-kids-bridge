import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** apps/program-api/.env.local, .env 를 읽어 process.env에 없는 값만 채운다 */
function loadEnvFiles(): void {
  for (const name of ['.env.local', '.env']) {
    const file = resolve(APP_ROOT, name)
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!match || line.trimStart().startsWith('#')) continue
      const [, key, raw] = match
      if (process.env[key] === undefined) process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2')
    }
  }
}

loadEnvFiles()

function resolveFromApp(path: string): string {
  return resolve(APP_ROOT, path)
}

export interface GeminiConfig {
  keyFile: string
  project: string
  location: string
  model: string
}

export function geminiConfig(): GeminiConfig {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS에 서비스 계정 키 파일 경로를 설정해 주세요. (.env.example 참고)')
  const keyFile = resolveFromApp(keyPath)
  if (!existsSync(keyFile)) throw new Error(`서비스 계정 키 파일을 찾을 수 없습니다: ${keyFile}`)
  const key = JSON.parse(readFileSync(keyFile, 'utf8')) as { project_id?: string }
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? key.project_id
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT를 설정하거나 project_id가 있는 키 파일을 사용해 주세요.')
  return {
    keyFile,
    project,
    location: process.env.GEMINI_LOCATION ?? 'global',
    model: process.env.GEMINI_MODEL ?? 'gemini-3.8-flash',
  }
}

export function dataDir(): string {
  return resolveFromApp(process.env.PROGRAM_DATA_DIR ?? 'data/local')
}

export function serverPort(): number {
  return Number(process.env.PORT ?? 8787)
}

export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean)
}
