import { SUPPRESSION_THRESHOLD } from '../data/assumptions'

export function DataGuide() {
  return (
    <div className="view guide">
      <div className="guide-grid">
        <section className="card" aria-labelledby="guide-collect">
          <h2 id="guide-collect">수집 항목</h2>
          <table className="mini-table">
            <tbody>
              <tr><th scope="row">거주 동</th><td>오산시 6개 행정동</td></tr>
              <tr><th scope="row">자녀 학년</th><td>초등 1~6학년</td></tr>
              <tr><th scope="row">참여 가능 시간</th><td>요일 × 오전·오후·저녁</td></tr>
              <tr><th scope="row">관심 분야</th><td>체험·문화, 한국어, 예술·체육, 진로</td></tr>
              <tr><th scope="row">자녀 한국어 수준</th><td>초급·중급·유창 (선택)</td></tr>
              <tr><th scope="row">사용 언어</th><td>쉬운 한국어·베트남어·중국어</td></tr>
            </tbody>
          </table>
        </section>
        <section className="card" aria-labelledby="guide-not-collect">
          <h2 id="guide-not-collect">수집하지 않는 항목</h2>
          <ul className="plain-list">
            <li>이름</li>
            <li>연락처</li>
            <li>상세 주소</li>
            <li>출신 국가</li>
          </ul>
        </section>
        <section className="card" aria-labelledby="guide-privacy">
          <h2 id="guide-privacy">표시 기준</h2>
          <ul className="plain-list">
            <li>개별 응답은 표시하지 않고 집계만 표시</li>
            <li>1~{SUPPRESSION_THRESHOLD - 1}가정인 집계는 “{SUPPRESSION_THRESHOLD} 미만”으로 표시</li>
            <li>합계로 역산될 수 있는 칸은 “가림” 처리</li>
            <li>조건에 맞는 응답이 {SUPPRESSION_THRESHOLD}가정 미만이면 결과 미표시</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
