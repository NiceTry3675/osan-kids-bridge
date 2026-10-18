// 시연영상에 TTS 내레이션 얹기. record-demo.js의 SCENES 대본을 장면별로 gemini-3.8-flash-tts로 읽히고,
// render/video/timings.json의 장면 시작 시각에 맞춰 붙인 뒤 영상과 합친다.
// 실행(키는 program-api 설정을 그대로 씀): cd apps/program-api && npx tsx ../../presentation/build/narrate.mts [prompter]
// - 대본이 바뀐 장면만 다시 만든다(render/narration/<장면>.json에 대본을 같이 저장)
// - 소리 없는 원본은 osan-kids-bridge-demo-silent.mp4로 남기고, 제출용 mp4에 소리를 넣는다
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { geminiClient } from '../../apps/program-api/src/llm/gemini.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const prompter = process.argv[2] === 'prompter'
const VIDEO = process.env.NARRATE_VIDEO ?? path.resolve(here, prompter ? '../osan-kids-bridge-demo-prompter.mp4' : '../osan-kids-bridge-demo.mp4')
const SILENT = VIDEO.replace(/\.mp4$/, '-silent.mp4')
const TIMINGS = path.resolve(here, prompter ? 'render/video-prompter/timings.json' : 'render/video/timings.json')
const DIR = path.resolve(here, 'render/narration')
const MODEL = 'gemini-3.8-flash-tts'
// 차분한 목소리 하나로 통일. 지시문을 대본에 붙이면 지시문까지 소리 내 읽으므로 대본만 보낸다
const VOICE = process.env.NARRATION_VOICE ?? 'Kore'

/** record-demo.js의 SCENES 객체를 그대로 읽는다(대본은 한 곳에서만 고친다) */
function readScenes(): { key: string; say: string }[] {
  const source = readFileSync(path.resolve(here, 'record-demo.js'), 'utf8')
  const match = source.match(/const SCENES = \{([\s\S]*?)\n\}/)
  if (!match) throw new Error('record-demo.js에서 SCENES를 찾지 못했습니다.')
  const scenes = new Function(`return ({${match[1]}})`)() as Record<string, { say: string }>
  return Object.entries(scenes).map(([key, scene]) => ({ key, say: scene.say }))
}

const ffprobeSeconds = (file: string) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString())

async function speak(text: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await geminiClient().models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text }] }],
        config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
      })
      const data = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData?.data
      if (data) return Buffer.from(data, 'base64')
      throw new Error('음성이 비어 있습니다.')
    } catch (error) {
      if (attempt === 3) throw error
      console.warn(`다시 시도 ${attempt}:`, (error as Error).message.slice(0, 120))
    }
  }
  throw new Error('unreachable')
}

async function main() {
  mkdirSync(DIR, { recursive: true })
  // 방금 녹화한 영상(소리 없음)이면 그것을 원본으로 남긴다. 이미 소리를 넣은 영상이면 남겨 둔 원본을 쓴다
  const hasAudio = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', VIDEO]).toString().trim() !== ''
  if (!hasAudio) copyFileSync(VIDEO, SILENT)
  if (!existsSync(SILENT)) throw new Error(`소리 없는 원본이 없습니다: ${SILENT}. record-demo.js로 다시 녹화하세요.`)
  const timings = JSON.parse(readFileSync(TIMINGS, 'utf8')) as { key: string; start: number; seconds: number }[]
  const clips: { file: string; at: number }[] = []
  for (const scene of readScenes()) {
    const timing = timings.find((entry) => entry.key === scene.key)
    if (!timing) throw new Error(`timings.json에 ${scene.key} 장면이 없습니다.`)
    const meta = path.join(DIR, `${scene.key}.json`)
    const clip = path.join(DIR, `${scene.key}.wav`)
    const cached = existsSync(meta) && existsSync(clip) && JSON.parse(readFileSync(meta, 'utf8')).say === scene.say && JSON.parse(readFileSync(meta, 'utf8')).voice === VOICE
    if (!cached) {
      const raw = path.join(DIR, `${scene.key}.raw.wav`)
      writeFileSync(raw, await speak(scene.say))
      // 앞뒤 무음만 자른다(문장 사이 쉼은 그대로)
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse', clip])
      writeFileSync(meta, JSON.stringify({ say: scene.say, voice: VOICE, model: MODEL }))
    }
    const length = ffprobeSeconds(clip)
    const room = timing.seconds - length
    if (room < 0.2) throw new Error(`${scene.key}: 음성 ${length.toFixed(2)}초가 장면 ${timing.seconds.toFixed(2)}초보다 깁니다. 대본을 줄이거나 장면을 늘리세요.`)
    // 장면 시작 직후(남는 시간의 절반, 최대 0.6초 뒤)에 말을 시작한다
    const at = timing.start + Math.min(0.6, room / 2)
    clips.push({ file: clip, at })
    console.log(`${scene.key.padEnd(9)} ${length.toFixed(2)}초 / 장면 ${timing.seconds.toFixed(2)}초 · ${at.toFixed(2)}초에 시작`)
  }
  // 장면별 음성을 제자리에 놓고 섞은 뒤 소리 크기를 맞춰(-16 LUFS) 영상과 합친다. 음성 뒤는 무음으로 채워 영상 길이를 그대로 둔다
  const inputs = clips.flatMap((clip) => ['-i', clip.file])
  const delays = clips.map((clip, index) => `[${index + 1}:a]adelay=${Math.round(clip.at * 1000)}:all=1[a${index}]`).join(';')
  const mix = `${clips.map((_, index) => `[a${index}]`).join('')}amix=inputs=${clips.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[voice]`
  const out = VIDEO.replace(/\.mp4$/, '.narrated.mp4')
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', SILENT, ...inputs, '-filter_complex', `${delays};${mix}`, '-map', '0:v', '-map', '[voice]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', out])
  copyFileSync(out, VIDEO)
  console.log(`내레이션을 넣은 영상: ${VIDEO} (${ffprobeSeconds(VIDEO).toFixed(1)}초), 소리 없는 원본: ${SILENT}`)
}

main().catch((error) => { console.error(error); process.exit(1) })
