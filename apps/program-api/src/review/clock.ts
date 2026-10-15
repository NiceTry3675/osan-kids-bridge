// 요청 시점. PROGRAM_API_NOW(ISO 시각)가 있으면 그 시각으로 고정한다 (시연·시험용).

export function nowSource(value: string | undefined = process.env.PROGRAM_API_NOW): () => Date {
  if (!value?.trim()) return () => new Date()
  const fixed = new Date(value.trim())
  if (Number.isNaN(fixed.getTime())) throw new Error(`PROGRAM_API_NOW가 올바른 ISO 시각이 아닙니다: ${value}`)
  return () => new Date(fixed.getTime())
}
