import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'

// inbox/<program-id>/ 폴더 하나 읽기: source.json, 게시글 텍스트, 포스터 이미지

export const PROGRAM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/

export interface InboxSource {
  url: string | null
  /** YYYY-MM-DD */
  retrieved_at: string | null
  institution_hint: string | null
  note: string | null
}

export interface InboxText {
  file: string
  text: string
}

export interface InboxImage {
  file: string
  mimeType: string
  data: Buffer
}

export interface InboxItem {
  programId: string
  dir: string
  source: InboxSource
  texts: InboxText[]
  images: InboxImage[]
}

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.html', '.htm'])
const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export async function readInboxItem(dir: string): Promise<InboxItem> {
  const absolute = resolve(dir)
  const programId = basename(absolute)
  if (!PROGRAM_ID_PATTERN.test(programId)) {
    throw new Error(`폴더 이름을 프로그램 ID로 쓸 수 없습니다: '${programId}' (영문 소문자·숫자·하이픈, 2~64자)`)
  }
  const source = parseSource(await readFile(join(absolute, 'source.json'), 'utf8').catch(() => {
    throw new Error(`${programId}: source.json이 없습니다.`)
  }), programId)

  const names = (await readdir(absolute)).filter((name) => !name.startsWith('.') && !name.startsWith('_')).sort()
  const texts: InboxText[] = []
  const images: InboxImage[] = []
  for (const name of names) {
    const path = join(absolute, name)
    if (!(await stat(path)).isFile()) continue
    const ext = extname(name).toLowerCase()
    if (TEXT_EXTENSIONS.has(ext)) {
      const raw = await readFile(path, 'utf8')
      const text = (ext === '.html' || ext === '.htm' ? htmlToText(raw) : raw).replace(/\r\n?/g, '\n').trim()
      if (text) texts.push({ file: name, text })
    } else if (IMAGE_TYPES[ext]) {
      const data = await readFile(path)
      if (data.length > MAX_IMAGE_BYTES) throw new Error(`${programId}/${name}: 이미지가 너무 큽니다 (15MB 이하).`)
      images.push({ file: name, mimeType: IMAGE_TYPES[ext], data })
    }
  }
  if (!texts.length && !images.length) throw new Error(`${programId}: 게시글 텍스트나 포스터 이미지가 없습니다.`)
  return { programId, dir: absolute, source, texts, images }
}

function parseSource(json: string, programId: string): InboxSource {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    throw new Error(`${programId}: source.json을 해석하지 못했습니다.`)
  }
  const optionalString = (key: string): string | null => {
    const value = data[key]
    if (value === undefined || value === null || value === '') return null
    if (typeof value !== 'string') throw new Error(`${programId}: source.json의 ${key}는 문자열이어야 합니다.`)
    return value.trim()
  }
  const url = optionalString('url')
  if (url && !/^https?:\/\//.test(url)) throw new Error(`${programId}: source.json의 url은 http(s) 주소여야 합니다.`)
  const retrieved = optionalString('retrieved_at')
  const retrieved_at = retrieved ? retrieved.slice(0, 10) : null
  if (retrieved_at && !/^\d{4}-\d{2}-\d{2}$/.test(retrieved_at)) {
    throw new Error(`${programId}: source.json의 retrieved_at은 YYYY-MM-DD여야 합니다.`)
  }
  return { url, retrieved_at, institution_hint: optionalString('institution_hint'), note: optionalString('note') }
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", middot: '·', hellip: '…', ndash: '–', mdash: '—', tilde: '~' }

/** HTML 태그를 걷어내고 줄 구조만 남긴다 */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|dt|dd|table|ul|ol)\s*>/gi, '\n')
    .replace(/<\/(td|th)\s*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === '#') {
        const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match
      }
      return ENTITIES[code.toLowerCase()] ?? match
    })
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').replace(/(\s*\|\s*)+$/, '').trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join('\n')
    .trim()
}
