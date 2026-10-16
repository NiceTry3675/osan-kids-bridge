import { generateJson, modelName } from '../llm/gemini'
import type { ProgramRecord } from '../types'
import { readInboxItem } from './inbox'
import type { InboxItem } from './inbox'
import { toProgramRecord } from './normalize'
import { buildExtractionPrompt, combineSourceText, EXTRACTION_SYSTEM_PROMPT, sourceBlocks } from './prompt'
import { EXTRACTION_SCHEMA } from './schema'
import type { RawExtraction } from './schema'
import { transcribePoster } from './transcribe'

// inbox 폴더 → 포스터 판독 → 구조화 추출 → 정규화

export interface Transcript {
  file: string
  text: string
}

export interface ExtractionResult {
  record: ProgramRecord
  transcripts: Transcript[]
}

export async function extractInboxItem(dir: string, options: { now?: Date } = {}): Promise<ExtractionResult> {
  const item = await readInboxItem(dir)
  const transcripts: Transcript[] = []
  for (const image of item.images) transcripts.push({ file: image.file, text: await transcribePoster(image) })
  return { record: await extractWithTranscripts(item, transcripts, options.now ?? new Date()), transcripts }
}

/** 판독문이 이미 있을 때(캐시 등) 추출·정규화만 한다 */
export async function extractWithTranscripts(item: InboxItem, transcripts: Transcript[], now: Date): Promise<ProgramRecord> {
  const blocks = sourceBlocks(item.texts, transcripts)
  const raw = await generateJson<RawExtraction>({
    system: EXTRACTION_SYSTEM_PROMPT,
    parts: [{ text: buildExtractionPrompt(item.source, blocks) }],
    schema: EXTRACTION_SCHEMA,
    temperature: 0,
  })
  return toProgramRecord(raw, {
    programId: item.programId,
    source: item.source,
    files: [...item.texts.map((text) => text.file), ...item.images.map((image) => image.file)].sort(),
    sourceText: combineSourceText(blocks),
    model: modelName(),
    now,
  })
}
