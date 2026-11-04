import { readFileSync } from 'node:fs'
import sharp from 'sharp'

// 보호자 목록·상세의 작은 포스터 그림. 원본·번역본(1~3MB)을 그대로 보내지 않고 너비를 줄인 webp를 보낸다.
// 같은 파일(SHA-256)·같은 너비면 메모리에 둔 것을 다시 쓴다.

/** 썸네일 너비. 요청한 너비는 이 중 같거나 큰 가장 가까운 값으로 맞춘다 (512보다 크면 512) */
export const THUMBNAIL_WIDTHS = [128, 256, 384, 512] as const

export function snapWidth(width: number): number {
  return THUMBNAIL_WIDTHS.find((value) => value >= width) ?? THUMBNAIL_WIDTHS[THUMBNAIL_WIDTHS.length - 1]
}

/** 메모리에 둘 썸네일 수 (512px webp 한 장이 수십 KB) */
const MAX_ENTRIES = 256
const cache = new Map<string, Promise<Buffer>>()

/**
 * 포스터 파일의 썸네일(webp). key는 파일 내용의 SHA-256과 원본·언어 구분.
 * 같은 썸네일을 동시에 여러 번 요청해도 한 번만 만든다. 만들지 못하면 기억하지 않는다
 */
export function posterThumbnail(path: string, key: string, width: number): Promise<Buffer> {
  const id = `${key}:${width}`
  const known = cache.get(id)
  if (known) {
    // 최근에 쓴 것을 뒤로 보내 오래 안 쓴 것부터 지운다
    cache.delete(id)
    cache.set(id, known)
    return known
  }
  // 파일 경로를 sharp에 넘기면 같은 경로의 예전 내용을 다시 쓸 수 있어 내용을 읽어 넘긴다
  const made = Promise.resolve()
    .then(() => sharp(readFileSync(path)).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer())
  cache.set(id, made)
  made.catch(() => cache.delete(id))
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  return made
}
