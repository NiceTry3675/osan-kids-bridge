# 프로그램 편성 계산 (`@osan-kids-bridge/planning`)

기관 대시보드 화면(수요 현황·일정·장소 추천·AI 편성 제안)과 program-api의 **편성 도우미**(`/admin/planning/propose`)가 같은 계산을 쓰도록 앱 밖에 둔 패키지입니다. React와 브라우저 API를 쓰지 않습니다.

- `generate.ts`: 고정 시드 합성 응답 400가정(실제 보호자 응답·통계가 아님). `assumptions.ts`에 모든 시연용 가정을 모았습니다.
- `aggregate.ts`: 필터·집계와 소수 셀 억제(1~4가정은 "5 미만", 합계와 함께 보이는 분포는 보조 억제).
- `recommend.ts`: 최대 커버리지 추천. (요일·시간대 칸, 장소) 조합을 모두 비교해 가장 많은 가정에 닿는 1~3안을 냅니다.
- `slots.ts`, `labels.ts`, `venues.ts`, `types.ts`: 21칸·이름표·가상 장소·데이터 항목.

편성 도우미는 이 계산을 시뮬레이션 도구로 돌립니다. 모델은 무엇을·누구에게와 근거 문장만 고르고, 언제·어디서와 숫자는 여기서 나옵니다. 자세한 설명은 [기관 대시보드 README](../../apps/institution-dashboard/README.md)에 있습니다.

```bash
npm test -w @osan-kids-bridge/planning      # 집계·억제·추천 테스트 (역산 방지 점검 포함)
npm run typecheck -w @osan-kids-bridge/planning
```
