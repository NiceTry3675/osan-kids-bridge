import jsQR from 'jsqr'
import sharp from 'sharp'
import type { Sharp } from 'sharp'

// QR 코드는 이미지 모델이 '비슷한 무늬'로 다시 그려 스캔되지 않는다.
// 원본 QR을 읽어 위치를 찾고, 번역본의 QR 자리를 찾아 원본 픽셀을 그대로 옮긴 뒤 다시 스캔해 주소가 같은지 확인한다.

export interface Box { x: number; y: number; width: number; height: number }

export interface QrRead {
  data: string
  box: Box
}

interface Raster { data: Uint8ClampedArray; width: number; height: number }

async function raster(image: Buffer | Sharp): Promise<Raster> {
  const pipeline = Buffer.isBuffer(image) ? sharp(image) : image
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height }
}

function boxOf(points: { x: number; y: number }[]): Box {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** 이미지 전체에서 QR을 읽는다. 작게 찍힌 QR을 위해 2배로 키워 한 번 더 본다 */
export async function readQr(image: Buffer): Promise<QrRead | null> {
  for (const scale of [1, 2]) {
    const meta = await sharp(image).metadata()
    const pipeline = scale === 1 ? sharp(image) : sharp(image).resize(Math.round((meta.width ?? 0) * scale), null, { kernel: 'nearest' })
    const { data, width, height } = await raster(pipeline)
    const found = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
    // 내용이 빈 판독은 무늬를 QR로 잘못 본 것이다
    if (!found?.data) continue
    const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = found.location
    const box = boxOf([topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner])
    return { data: found.data, box: { x: box.x / scale, y: box.y / scale, width: box.width / scale, height: box.height / scale } }
  }
  return null
}

/** 정해진 영역만 키워서 QR을 읽는다 (번역본 확인용) */
export async function readQrIn(image: Buffer, box: Box): Promise<string | null> {
  const meta = await sharp(image).metadata()
  const margin = Math.round(Math.max(box.width, box.height) * 0.3)
  const left = Math.max(0, Math.floor(box.x - margin))
  const top = Math.max(0, Math.floor(box.y - margin))
  const width = Math.min((meta.width ?? 0) - left, Math.ceil(box.width + margin * 2))
  const height = Math.min((meta.height ?? 0) - top, Math.ceil(box.height + margin * 2))
  for (const scale of [3, 2, 4]) {
    const { data, width: w, height: h } = await raster(sharp(image).extract({ left, top, width, height }).resize(width * scale, height * scale, { kernel: 'cubic' }))
    const found = jsQR(data, w, h, { inversionAttempts: 'attemptBoth' })
    if (found?.data) return found.data
  }
  return null
}

/**
 * 번역본에서 QR 자리를 찾는다: 원본 위치를 비율로 옮긴 곳 둘레에서 어두운 점이 가장 크게 뭉친 덩어리.
 * 이미지 모델이 그린 QR은 읽히지 않아도 검은 무늬 덩어리로는 남는다
 */
export function locateQrBlob(image: Raster, expected: Box): Box | null {
  const { data, width, height } = image
  const wx0 = Math.max(0, Math.floor(expected.x - expected.width / 2))
  const wy0 = Math.max(0, Math.floor(expected.y - expected.height / 2))
  const wx1 = Math.min(width, Math.ceil(expected.x + expected.width * 1.5))
  const wy1 = Math.min(height, Math.ceil(expected.y + expected.height * 1.5))
  const w = wx1 - wx0
  const h = wy1 - wy0
  if (w <= 0 || h <= 0) return null
  const dark = new Uint8Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((wy0 + y) * width + (wx0 + x)) * 4
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      dark[y * w + x] = luma < 70 ? 1 : 0
    }
  }
  // 닫기(팽창 후 침식)로 QR 모듈 사이의 흰 틈을 메워 한 덩어리로 만든다
  const radius = Math.max(2, Math.round(Math.min(expected.width, expected.height) / 25))
  const closed = erode(dilate(dark, w, h, radius), w, h, radius)
  const labels = new Int32Array(w * h)
  let best: { area: number; box: Box } | null = null
  let next = 0
  const stack: number[] = []
  for (let start = 0; start < w * h; start += 1) {
    if (!closed[start] || labels[start]) continue
    next += 1
    labels[start] = next
    stack.push(start)
    let area = 0
    let minX = w, minY = h, maxX = 0, maxY = 0
    while (stack.length) {
      const index = stack.pop()!
      const x = index % w
      const y = (index - x) / w
      area += 1
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const neighbor = ny * w + nx
        if (closed[neighbor] && !labels[neighbor]) { labels[neighbor] = next; stack.push(neighbor) }
      }
    }
    if (!best || area > best.area) best = { area, box: { x: wx0 + minX, y: wy0 + minY, width: maxX - minX + 1, height: maxY - minY + 1 } }
  }
  if (!best) return null
  // 원본 QR과 가로세로 비율이 비슷하고 기대 크기의 절반 이상이어야 QR로 본다 (포스터를 늘려 QR이 납작한 경우도 있다)
  const { box } = best
  const ratio = (box.width / box.height) / (expected.width / expected.height)
  if (ratio < 0.75 || ratio > 1.33 || box.width < expected.width * 0.5) return null
  return box
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(mask, w, h, r, 1)
}

function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(mask, w, h, r, 0)
}

/** 가로·세로로 나눠 하는 사각형 최대(팽창)·최소(침식) 필터 */
function morph(mask: Uint8Array, w: number, h: number, r: number, target: 0 | 1): Uint8Array {
  const pass = (input: Uint8Array, horizontal: boolean) => {
    const output = new Uint8Array(w * h)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let value = target === 1 ? 0 : 1
        for (let d = -r; d <= r; d += 1) {
          const xx = horizontal ? x + d : x
          const yy = horizontal ? y : y + d
          const inside = xx >= 0 && yy >= 0 && xx < w && yy < h
          const cell = inside ? input[yy * w + xx] : (target === 1 ? 0 : 1)
          if (cell === target) { value = target; break }
        }
        output[y * w + x] = value
      }
    }
    return output
  }
  return pass(pass(mask, true), false)
}

export interface QrTransplant {
  source: string
  /** 옮긴 뒤 다시 읽은 주소. 원본과 같아야 한다 */
  output: string | null
  matches: boolean
  box: Box | null
  png: Buffer
}

/**
 * 원본 QR을 번역본의 QR 자리에 옮겨 붙이고 다시 스캔한다.
 * 원본에 QR이 없으면 null (옮길 것이 없다)
 */
export async function transplantQr(original: Buffer, generated: Buffer): Promise<QrTransplant | null> {
  const source = await readQr(original)
  if (!source) return null
  const [originalMeta, generatedRaster] = await Promise.all([sharp(original).metadata(), raster(generated)])
  const kx = generatedRaster.width / (originalMeta.width ?? 1)
  const ky = generatedRaster.height / (originalMeta.height ?? 1)
  const expected: Box = { x: source.box.x * kx, y: source.box.y * ky, width: source.box.width * kx, height: source.box.height * ky }
  const found = locateQrBlob(generatedRaster, expected)
  if (!found) return { source: source.data, output: null, matches: false, box: null, png: generated }

  // 원본 QR의 가로세로 비율(모듈 격자)을 지킨 채 번역본의 QR 자리를 덮을 만큼 키우고, 둘레에 흰 여백(quiet zone)을 둔다
  const sourceRatio = source.box.width / source.box.height
  const width = Math.round(Math.max(found.width, found.height * sourceRatio))
  const height = Math.round(width / sourceRatio)
  const centerX = found.x + found.width / 2
  const centerY = found.y + found.height / 2
  const pad = Math.round(Math.max(width, height) * 0.08)
  const sourceMargin = source.box.width * 0.03
  const crop = await sharp(original)
    .extract({
      left: Math.max(0, Math.floor(source.box.x - sourceMargin)),
      top: Math.max(0, Math.floor(source.box.y - sourceMargin * (source.box.height / source.box.width))),
      width: Math.ceil(source.box.width + sourceMargin * 2),
      height: Math.ceil(source.box.height + sourceMargin * 2 * (source.box.height / source.box.width)),
    })
    .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
    .png()
    .toBuffer()
  const quiet = await sharp({ create: { width: width + pad * 2, height: height + pad * 2, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const left = Math.round(centerX - width / 2)
  const top = Math.round(centerY - height / 2)
  const png = await sharp(generated)
    .composite([
      { input: quiet, left: Math.max(0, left - pad), top: Math.max(0, top - pad) },
      { input: crop, left: Math.max(0, left), top: Math.max(0, top) },
    ])
    .png()
    .toBuffer()
  const box: Box = { x: left - pad, y: top - pad, width: width + pad * 2, height: height + pad * 2 }
  const output = (await readQr(png))?.data ?? await readQrIn(png, box)
  return { source: source.data, output, matches: output === source.data, box, png }
}
