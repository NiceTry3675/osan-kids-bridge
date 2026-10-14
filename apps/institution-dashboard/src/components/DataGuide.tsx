import {
  BEGINNER_SHARE_FOR_ASSISTANT, DAY_PART_HOURS, DEFAULT_PLAN, DEMO_RECORD_COUNT, DEMO_SEED, DONGS, DONG_ADJACENCY, DONG_HOUSEHOLD_WEIGHTS,
  ENROLLMENT_RATE, EXACT_SEARCH_COMBO_LIMIT, FLUENT_SHARE_FOR_ADVANCED, GRADE_WEIGHTS, INTEREST_PROBABILITIES, KOREAN_LEVEL_RESPONSE_RATE,
  KOREAN_LEVEL_WEIGHTS, LOW_KOREAN_LEVEL_RESPONSE, MIN_SLOT_OVERLAP_MINUTES, SCREEN_LANGUAGE_WEIGHTS, SLOTS_PER_HOUSEHOLD_WEIGHTS,
  SLOT_WEIGHTS, SUPPRESSION_THRESHOLD,
} from '../data/assumptions'
import { VENUES, venueById } from '../data/venues'
import { GRADES, INTERESTS, INTEREST_LABELS, KOREAN_LEVELS, KOREAN_LEVEL_LABELS, LANGUAGES, LANGUAGE_LABELS, formatNumber } from '../lib/labels'
import { CLASS_COUNTS } from '../lib/plan'
import { choose } from '../lib/recommend'
import { DAY_PARTS, DAY_PART_LABELS, SLOTS, WEEKDAYS, WEEKDAY_LABELS, slotLabel } from '../lib/slots'

const pct = (value: number) => `${Math.round(value * 100)}%`
const pad = (hour: number) => String(hour).padStart(2, '0')
/** 지금 조건(6개 동 × 21칸, 반 최대 3개)에서 정확 탐색이 따지는 묶음 조합 수의 최댓값 */
const MAX_GROUPS = DONGS.length * SLOTS.length
const MAX_CLASSES = CLASS_COUNTS[CLASS_COUNTS.length - 1]
const MAX_COMBOS = Array.from({ length: MAX_CLASSES }, (_, at) => choose(MAX_GROUPS, at + 1)).reduce((sum, value) => sum + value, 0)

export function DataGuide() {
  const baseline = (DEFAULT_PLAN.baseline ?? []).map((option) => `${slotLabel(option.slot)} ${venueById(option.venueId)?.name ?? ''}`)
  return (
    <div className="view guide">
      <section className="card guide-lead" aria-labelledby="guide-synthetic">
        <h2 id="guide-synthetic">이 화면의 숫자는 모두 가상 데이터예요</h2>
        <p>브라우저가 고정 시드 <code>{DEMO_SEED}</code>로 가상 응답 {DEMO_RECORD_COUNT}가정을 만들어 계산해요. 새로고침해도 같은 결과가 나오며, 실제 보호자 응답·실제 통계·실제 시설이 아니에요. 장소 이름 앞의 “가상”도 같은 뜻이에요.</p>
      </section>

      <div className="guide-grid">
        <section className="card" aria-labelledby="guide-collect">
          <h2 id="guide-collect">모으는 것</h2>
          <p className="card-note">보호자 한 가정이 익명으로 남기는 희망 조건(데이터 항목 초안 v0.2)</p>
          <ul className="check-list">
            <li>사는 동(오산시 6개 행정동 중 하나)</li>
            <li>자녀 학년(1~6학년)</li>
            <li>참여 가능한 요일·시간대(7요일 × 오전·오후·저녁 21칸, 1칸 이상)</li>
            <li>관심 분야(체험·문화, 한국어, 예술·체육, 진로 중 0개 이상)</li>
            <li>자녀 한국어 수준(선택 항목: 초급·중급·유창)</li>
            <li>보호자 웹에서 고른 화면 언어(쉬운 한국어·베트남어·중국어)</li>
          </ul>
        </section>
        <section className="card" aria-labelledby="guide-not-collect">
          <h2 id="guide-not-collect">모으지 않는 것</h2>
          <p className="card-note">데이터 구조에 칸 자체가 없어요.</p>
          <ul className="cross-list">
            <li>이름</li>
            <li>연락처(전화번호·이메일)</li>
            <li>정확한 주소(동 단위까지만)</li>
            <li>출신국(대신 화면 언어만 봐요)</li>
          </ul>
        </section>
        <section className="card" aria-labelledby="guide-privacy">
          <h2 id="guide-privacy">개인정보 보호 장치</h2>
          <ul className="plain-list">
            <li>개별 응답은 보여 주지 않고 집계만 보여 줘요.</li>
            <li>집계가 1~{SUPPRESSION_THRESHOLD - 1}가정이면 숫자 대신 “{SUPPRESSION_THRESHOLD} 미만”으로 가려요(히트맵·동별·화면 언어·한국어 수준·추천 카드).</li>
            <li>동별·화면 언어·한국어 수준처럼 합계와 함께 보이는 분포는 합계에서 빼서 가린 칸을 알아낼 수 있으면 다른 칸도 함께 “가림”으로 가려요.</li>
            <li>비율(%)과 수업 제안은 화면에 보이는 숫자로만 계산해, 비율로 가린 칸을 거꾸로 셈할 수 없게 해요.</li>
            <li>필터를 많이 걸어 대상이 {SUPPRESSION_THRESHOLD}가정 미만이 되면 결과 대신 “조건을 넓혀 주세요”를 띄워요.</li>
          </ul>
        </section>
      </div>

      <section className="card" aria-labelledby="guide-assumptions">
        <div className="card-head">
          <h2 id="guide-assumptions">시연용 가정 목록</h2>
          <p>모두 한 설정 파일에 모아 둔 시연용 값이에요. 실제 통계가 아니며 실제 도입 전에 확인이 필요해요.</p>
        </div>
        <div className="assumption-grid">
          <div>
            <h3>동별 가구 비율과 이동 범위</h3>
            <table className="mini-table">
              <thead><tr><th scope="col">동</th><th scope="col">응답 비율</th><th scope="col">갈 수 있는 인접 동</th></tr></thead>
              <tbody>{DONGS.map((dong) => <tr key={dong}><th scope="row">{dong}</th><td className="num">{pct(DONG_HOUSEHOLD_WEIGHTS[dong])}</td><td>{DONG_ADJACENCY[dong].join(', ')}</td></tr>)}</tbody>
            </table>
            <p className="card-note">보호자는 같은 동 또는 인접 동의 장소까지 갈 수 있다고 봐요. 남북으로 긴 시 모양을 2열 × 3행 격자로 단순화한 표예요.</p>
          </div>
          <div>
            <h3>시간대와 칸별 인기 가중치</h3>
            <table className="mini-table weights">
              <thead><tr><th scope="col"><span className="sr-only">시간대</span></th>{WEEKDAYS.map((day) => <th key={day} scope="col">{WEEKDAY_LABELS[day]}</th>)}</tr></thead>
              <tbody>{DAY_PARTS.map((part) => (
                <tr key={part}><th scope="row">{DAY_PART_LABELS[part]} <small>{pad(DAY_PART_HOURS[part][0])}~{pad(DAY_PART_HOURS[part][1])}시</small></th>{WEEKDAYS.map((day) => <td key={day} className="num">{SLOT_WEIGHTS[day][part]}</td>)}</tr>
              ))}</tbody>
            </table>
            <p className="card-note">맞벌이 가정을 가정해 평일 저녁과 토요일 오전·오후를 높게, 평일 오전을 낮게 뒀어요. 한 가정은 {Object.entries(SLOTS_PER_HOUSEHOLD_WEIGHTS).map(([count, weight]) => `${count}칸 ${pct(weight)}`).join(', ')} 비율로 가능 칸을 골라요.</p>
          </div>
          <dl className="assumption-list">
            <div><dt>화면 언어 비율</dt><dd>{LANGUAGES.map((language) => `${LANGUAGE_LABELS[language]} ${pct(SCREEN_LANGUAGE_WEIGHTS[language])}`).join(' · ')}</dd></div>
            <div><dt>한국어 수준</dt><dd>응답률 {pct(KOREAN_LEVEL_RESPONSE_RATE)} · 응답 중 {KOREAN_LEVELS.map((level) => `${KOREAN_LEVEL_LABELS[level]} ${pct(KOREAN_LEVEL_WEIGHTS[level])}`).join(' · ')} (자녀 기준)</dd></div>
            <div><dt>학년 분포</dt><dd>{GRADES.map((grade) => `${grade}학년 ${pct(GRADE_WEIGHTS[grade])}`).join(' · ')}</dd></div>
            <div><dt>관심 분야 선택 확률</dt><dd>{INTERESTS.map((interest) => `${INTEREST_LABELS[interest]} ${pct(INTEREST_PROBABILITIES[interest])}`).join(' · ')} (분야마다 따로 뽑아 비어 있을 수 있음)</dd></div>
            <div><dt>시간 범위 → 21칸</dt><dd>칸과 {MIN_SLOT_OVERLAP_MINUTES}분 이상 겹치면 가능으로 셈. 모든 범위에 같은 기준이라 범위를 넓혀도 칸이 줄지 않고, 06~22시 안의 1시간 이상 범위는 늘 1칸 이상이 됨</dd></div>
            <div><dt>소수 셀 억제 기준</dt><dd>{SUPPRESSION_THRESHOLD}가정 미만(1~{SUPPRESSION_THRESHOLD - 1})은 “{SUPPRESSION_THRESHOLD} 미만”으로 표시, 0은 그대로. 합계에서 빼서 알아낼 수 있으면 다른 칸도 함께 “가림”</dd></div>
            <div><dt>정확 탐색 한도</dt><dd>조합 {formatNumber(EXACT_SEARCH_COMBO_LIMIT)}개 이하면 전부 비교, 넘으면 탐욕 알고리즘(최적의 약 63% 이상 보장). 지금 조건({DONGS.length}개 동 × {SLOTS.length}칸, 반 최대 {MAX_CLASSES}개)에서는 조합이 많아야 {formatNumber(MAX_COMBOS)}개라 늘 정확 탐색을 하고, 탐욕 대체는 더 큰 입력을 위한 장치예요.</dd></div>
            <div><dt>신청 전환율</dt><dd>반에 닿는 가정의 {pct(ENROLLMENT_RATE)}가 실제 신청한다고 보고 반별 예상 인원을 계산(가정당 아동 1명)</dd></div>
            <div><dt>수업 제안 규칙</dt><dd>초급 {pct(BEGINNER_SHARE_FOR_ASSISTANT)} 이상이면 보조교사, 유창 {pct(FLUENT_SHARE_FOR_ADVANCED)} 이상이면 심화 활동, 수준 응답률 {pct(LOW_KOREAN_LEVEL_RESPONSE)} 미만이면 신청서에서 재확인</dd></div>
            <div><dt>시연 기본 입력</dt><dd>{DEFAULT_PLAN.interest === 'all' ? '전체 분야' : INTEREST_LABELS[DEFAULT_PLAN.interest]} · {DEFAULT_PLAN.gradeRange[0]}~{DEFAULT_PLAN.gradeRange[1]}학년 · {DEFAULT_PLAN.classCount}개 반 · 정원 {DEFAULT_PLAN.capacity}명 · 후보 장소 {VENUES.length}곳 전체{baseline.length ? ` · 기존 계획(반을 모두 가장 붐비는 시간에 여는 관행) ${baseline.join(', ')}` : ''}</dd></div>
          </dl>
        </div>
      </section>

      <div className="guide-grid two">
        <section className="card" aria-labelledby="guide-future">
          <h2 id="guide-future">실제 서비스에서의 수집 경로</h2>
          <p className="card-note">이번 목업에서는 만들지 않아요. 보호자가 고른 시간 범위를 21칸으로 바꾸는 변환 기능만 미리 만들어 두었어요.</p>
          <ol className="step-list">
            <li><strong>보호자 웹에서 익명 동의 후 전송</strong>검색과 별도로 “희망 시간을 익명으로 기관에 알려 주기”에 동의한 경우에만 보내요. 검색 조건을 몰래 기록하지 않아요.</li>
            <li><strong>서버에서 21칸으로 바꿔 저장</strong>보호자가 고른 자유 시간 범위를 미리 만든 변환 기능으로 요일·시간대 칸으로 바꿔 저장해요.</li>
            <li><strong>기관은 집계된 숫자만 받기</strong>서버가 집계하고 작은 숫자를 가린 결과만 기관 화면에 보내요. 개별 응답은 기관에 전달하지 않아요.</li>
          </ol>
        </section>
        <section className="card" aria-labelledby="guide-check">
          <h2 id="guide-check">실제 도입 전 확인할 점</h2>
          <ul className="plain-list">
            <li>동 인접 관계와 동별 가구 비율 가정이 실제와 크게 어긋나지 않는지</li>
            <li>오전·오후·저녁 경계 시각({DAY_PARTS.map((part) => pad(DAY_PART_HOURS[part][0])).join('·')}·{pad(DAY_PART_HOURS.evening[1])}시)</li>
            <li>한국어 수준 3단계를 자녀 기준으로 물을지 보호자 기준으로 물을지(시연은 자녀 기준)</li>
            <li>여러 조건의 결과를 서로 비교해 가린 칸을 알아내지 못하도록 서버 집계에서 어떤 보호 규칙을 더 둘지</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
