import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { SUPPRESSION_THRESHOLD } from '@osan-kids-bridge/planning'
import type { DayPart, Dong, Interest, KoreanLevel, SafeCount, ScreenLanguage, SlotKey, Venue, Weekday } from '@osan-kids-bridge/planning'
import type { LanguageOption, LanguageState } from '@osan-kids-bridge/ui'

export type Locale = 'ko-easy' | 'vi' | 'zh'
const ko = {
  brand: '오산 아이 프로그램', institution: '운영기관 화면', language: '화면 언어', demo: '시연용 가상 응답이에요. 실제 보호자가 답한 것이 아니에요.',
  pickerMore: '다른 언어', pickerTitle: '화면 언어 고르기', pickerSearch: '언어 이름으로 찾기', close: '닫기', pickerCurrent: '지금 보는 언어', pickerDraft: '번역 초안', pickerInReview: '번역 검수 중', pickerNotOffered: '아직 제공하지 않아요', pickerNoMatch: '찾는 언어가 없어요', draftNotice: '이 언어의 화면 문구는 검수 전 초안이에요. 개발·시연 화면에서만 고를 수 있어요.', skip: '본문으로 건너뛰기', demandSummary: '{n}가정이 답했어요.', demandSummaryFiltered: '전체 {total}가정 중 {n}가정이 조건에 맞아요.', demandPeak: '가장 많이 몰린 시간은 {slots}이에요.', demandPeakHidden: '시간별 숫자는 개인 식별을 막으려고 가렸어요.', showRecommend: '추천 보기', detailsOpen: '{n}안 자세히 보기', detailsTitle: '{n}안 자세히', applyFilters: '적용하기', nextStepTitle: '다음 단계 (이번에는 만들지 않음)', nextStepBody: '보호자 웹의 익명 동의 → 서버 집계·가림 → 이 화면', programQuestion: '어떤 프로그램을 여나요?', venuesSummary: '{n}곳 중 {m}곳', baselineOnSummary: '켜짐', baselineOffSummary: '꺼짐',
  demandTab: '수요 현황', recommendTab: '일정·장소 추천', guideTab: '데이터 안내',
  filterTitle: '조건 선택', filterOpen: '조건 바꾸기', reset: '초기화', all: '전체', allFields: '전체 분야', allLanguages: '전체 언어',
  district: '동', selected: '{n}곳 선택', grade: '자녀 학년', startGrade: '시작 학년', endGrade: '끝 학년', gradeValue: '{n}학년',
  interest: '관심 분야', screenLanguage: '화면 언어', households: '응답 가정', avgSlots: '가정당 가능 시간', koreanResponse: '한국어 수준 응답률',
  avgEstimate: '21칸 중 평균 · 추정', slots: '{n}칸',
  heatTitle: '언제 참여할 수 있나요?', heatCaption: '요일·시간대별 참여 가능 가정 수', districtTitle: '어느 동에 있나요?', languageTitle: '화면 언어', levelTitle: '자녀 한국어 수준',
  districtCount: '동별 응답 가정 수', languageCount: '화면 언어별 응답 가정 수', levelCount: '자녀 한국어 수준별 응답 가정 수',
  planTitle: '프로그램 조건', planField: '프로그램 분야', targetGrade: '대상 학년', classCount: '열 반 수', classes: '{n}개 반', capacity: '반당 정원', people: '{n}명',
  venues: '후보 장소', selectAll: '모두 선택', clearAll: '모두 해제', available: '대관 가능 {n}칸',
  baseline: '기존 계획', compareBaseline: '기존 계획과 비교', baselineClassSlot: '기존 계획 {n}반 요일·시간대', baselineClassVenue: '기존 계획 {n}반 장소',
  planForClass: '{n}반', noVenues: '후보 장소가 없어요', chooseVenue: '장소를 하나 이상 선택해 주세요.', noReach: '참여 가능한 가정이 없어요', widen: '장소를 추가하거나 조건을 넓혀 보세요.',
  heatPlanCaption: '대상 수요와 추천 시간',
  option: '{n}안', eligible: '대상 {n}', compared: '기존 계획 {rate} 대비',
  classDetails: '반별 내역', class: '반', time: '요일·시간대', place: '장소', reached: '닿는 가정', added: '새로 더함', expected: '예상 신청 / 정원',
  sameEffect: '같은 효과', overCapacity: '정원 초과', estimatedNote: '예상 신청: 시연용 신청률 {n}% 기준',
  guideCollected: '사용한 항목', guideNotCollected: '사용하지 않은 항목', guidePrivacy: '표시 기준',
  guideDistrict: '거주 동', guideDistrictValue: '오산시 6개 동', guideChildGrade: '자녀 학년', guideChildGradeValue: '초등 1~6학년',
  guideTime: '참여 가능 시간', guideTimeValue: '요일 × 오전·오후·저녁', guideInterest: '관심 분야', guideInterestValue: '체험·문화, 한국어, 예술·체육, 진로',
  guideKoreanLevel: '자녀 한국어 수준', guideKoreanLevelValue: '초급·중급·유창 (선택)', guideLanguage: '화면 언어', guideLanguageValue: '쉬운 한국어·베트남어·중국어',
  name: '이름', contact: '연락처', address: '상세 주소', origin: '출신 국가',
  privacy1: '개별 응답은 표시하지 않고 집계만 표시', privacy2: '1~{n}가정인 집계는 “{threshold} 미만”으로 표시', privacy3: '합계로 역산될 수 있는 칸은 “가림” 처리', privacy4: '조건에 맞는 응답이 {n}가정 미만이면 결과 미표시',
  hidden: '가림', below: '{n} 미만', belowHouseholds: '{n}가정 미만', maskedNote: '가림: 개인 식별 방지를 위해 비공개',
  householdValue: '{n}가정', approxPeople: '약 {n}명', belowPeople: '{n}명 미만', peopleValue: '{n}명',
  insufficientTitle: '표시할 수 없어요', insufficientText: '조건에 맞는 응답이 {n}가정 미만이라 표시하지 않습니다.',
  morning: '오전', afternoon: '오후', evening: '저녁', householdCount: '가정 수', recommended: '추천', existing: '기존', dayMon: '월', dayTue: '화', dayWed: '수', dayThu: '목', dayFri: '금', daySat: '토', daySun: '일',
  levelBeginner: '초급', levelIntermediate: '중급', levelFluent: '유창', levelNone: '미응답', easyKorean: '쉬운 한국어', vietnamese: '베트남어', chinese: '중국어',
  interestExperience: '체험·문화', interestKorean: '한국어', interestSports: '예술·체육', interestCareer: '진로',
  demoResultNote: '이 결과는 시연용 가정과 가상 장소를 사용합니다. 실제 편성 전 확인이 필요합니다.', approximate: '조합이 많아 근사 방식으로 추천했습니다.',
  insights: '추천 이유와 준비할 점', insightSummary: '시간과 장소를 조합해 더 많은 가정에 닿도록 골랐습니다.', languageAdvice: '사용 언어 분포에 맞춰 번역 안내와 통역을 준비하세요.', teachingAdvice: '자녀 한국어 수준에 맞춰 쉬운 설명 자료와 보조 인력을 준비하세요.', originalDetails: '한국어 세부 분석', originalNote: '아래 분석 문장은 한국어 원문입니다.',
  questionsTab: '보호자 질문', questionsLead: '보호자가 AI 상담에서 공고로 답을 찾지 못해, 이름 없이 기관에 알린 질문이에요.', questionsTotal: '질문 {n}건 · 공고 {m}개',
  questionsLive: '보호자 웹에서 들어온 질문 {n}건 포함', questionsDemo: '시연용 예시 질문이 섞여 있어요.', questionsEmpty: '아직 들어온 질문이 없어요.',
  questionsOffline: '질문 서버에 연결하지 못해 시연용 예시만 보여요.', questionsLiveLabel: '(보호자 웹에서 들어온 질문)',
  questionsCount: '{n}명이 물었어요', questionsTopicCount: '주제별 질문 수', questionsRefresh: '새로고침',
  topicFamily: '참여 자격', topicCompanion: '동반', topicKoreanLevel: '한국어 수준·통역', topicSchedule: '일정·참석 방식', topicAgeGrade: '나이·학년', topicMaterials: '준비물·복장', topicOther: '비용 등 그 밖의 내용',
  programsTab: '공고 관리', navOperate: '공고 운영', navPlan: '프로그램 편성', navBadge: '처리할 것 {n}건', reviewerName: '담당자 이름', reviewerPlaceholder: '예: 김오산',
  reviewPending: '검수 대기', reviewApproved: '게시 중', reviewStale: '원문 바뀜 · 재검수', reviewRejected: '반려',
  summaryApproved: '사람 승인', summaryChecked: 'AI 자동 대조 통과', summaryDraft: '초안 · 문제 있음', summaryWithdrawn: '승인 풀림',
  posterApproved: '담당자 승인', posterFailed: '검증 실패 · 게시 안 함', posterChecked: 'AI 검증 통과 ({n}회차)',
  loading: '불러오는 중이에요', noApiTitle: '프로그램 API에 연결되지 않았어요', noApiHint: 'VITE_API_BASE_URL로 서버 주소를 주면 공고 검수와 공고 보완 도우미를 쓸 수 있어요.',
  adminOffTitle: '관리자 API가 꺼져 있어요', adminOffHint: 'npm run demo로 켜거나, 서버를 ADMIN_API=1로 실행해 주세요. 로그인이 없으므로 시연·내부망에서만 켭니다.',
  apiErrorTitle: '서버에 연결하지 못했어요', apiErrorHint: '서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.', retry: '다시 시도',
  programsLead: 'AI가 공고 원문과 포스터를 읽어 사실을 뽑고 번역 포스터를 만들어요. 담당자가 원문과 대조해 승인해야 보호자 화면에 게시돼요.',
  filterAll: '전체', filterReview: '검수 필요', filterPublished: '게시 중', filterPosters: '번역 포스터',
  kpiTitle: '공고 현황', kpiTotal: '전체 공고', kpiPublished: '게시 중 {n}건', kpiNeedsReview: '검수가 필요한 공고', kpiUnverified: '근거 확인이 필요한 공고 {n}건',
  kpiPosters: 'AI 검증을 통과한 번역 포스터', kpiPostersApproved: '담당자 승인 {n}건', kpiAddenda: '기관 추가 안내', kpiAddendaHint: '보호자 질문으로 보완한 문장',
  searchPrograms: '공고 이름으로 찾기', colProgram: '공고', colReview: '검수', colEvidence: '원문 근거', colSummaries: '안내 요약', colPosters: '번역 포스터', colQuestions: '보호자 질문', colSchedule: '일정',
  demoNotice: '시연용 공고', addendaCount: '추가 안내 {n}건', unverifiedCount: '확인 필요 {n}', allVerified: '모두 확인', noPrograms: '조건에 맞는 공고가 없어요.',
  programsLegend: '안내 요약·번역 포스터: 진한 칩은 담당자 승인, 테두리 칩은 AI 자동 검증만 통과(시연에서는 담당자 확인 전으로 표시해 보여 줌), 노란 칩은 문제 있음.',
  sourceLink: '원문 공고', paneSource: '원본 공고', sourcePoster: '포스터', sourceText: '원문 글', posterOriginalAlt: '{title} 원본 포스터', noSourceText: '저장된 원문 글이 없어요.', retrievedAt: '원문 확인일 {date}',
  paneFacts: 'AI가 읽은 사실', onlyUnverified: '확인 필요만', factsLead: '공고에 적힌 사실 {n}개 중 {m}개는 원문 문장으로 확인했어요. 근거 문장을 원본과 대조해 주세요.',
  unverifiedNotice: '원문 근거로 확인되지 않은 사실: {labels}', extractWarnings: 'AI 추출 경고', toConfirmTitle: "보호자 화면의 '기관에 확인할 점'", toConfirmNone: '없어요.',
  openQuestions: '이 공고의 보호자 질문 보기', addendaTitle: '기관 추가 안내 (게시 중)', draftedByAi: 'AI 초안에서 시작', remove: '지우기', addendumRemoved: '추가 안내를 지웠어요.',
  summariesTitle: '보호자 화면 3줄 안내', noSummaries: '만든 요약이 없어요.', panePoster: '번역 포스터', noTranslatedPoster: '아직 번역 포스터가 없어요. npm run poster로 만들 수 있어요.', noPosterAtAll: '이 공고에는 포스터 이미지가 없어요.',
  posterTranslatedAlt: '{title} {language} 번역 포스터', viewingAttempt: '{n}회차 시도를 보고 있어요.', viewFinal: '내보내는 번역본 보기',
  posterApprovedBy: '담당자 승인: {name} · {date}', posterFailedLong: '3회 안에 검증을 통과하지 못해 보호자에게 내보내지 않아요.', posterCheckedLong: 'AI 검증 통과 ({n}회차 결과) · 담당자 확인 전',
  stepTable: '원본 판독 · 문구 {n}개 번역표 (숫자·날짜·전화는 코드 검사)', attemptN: '{n}회차', attemptPassed: '다른 AI가 다시 읽어 대조 · 통과', attemptIssues: '다른 AI가 다시 읽어 대조 · 문제 {n}건 → 그 부분만 다시 생성', attemptChosen: '내보냄',
  qrMatches: 'QR 원본 이식 · 다시 읽어 주소 일치', qrMismatch: 'QR 주소가 원본과 다름', injectedFault: '시연용: 1회차 지시에 일부러 넣은 오류 ({fault})를 검증이 잡았어요.',
  posterSourceChanged: '번역한 뒤 원본 포스터가 바뀌었어요. 다시 번역해야 해요.', posterApprovedDone: '번역 포스터를 승인했어요.', approvePoster: '이 번역 포스터 승인', needReviewer: '왼쪽 아래에 담당자 이름을 적으면 승인할 수 있어요.',
  factVerified: '원문으로 확인', factUnverified: '근거 확인 필요', factNotStated: '공고에 없음',
  decisionTitle: '검수 결정', lastReview: '마지막 검수: {name} · {date}', notReviewedYet: '아직 사람이 검수하지 않았어요.', approveSummaries: '함께 승인할 안내 요약',
  languageReviewer: '베트남어·중국어 검수자', languageReviewerHint: '그 언어를 확인한 사람', reviewNote: '메모', reviewNoteHint: '반려할 때는 사유를 적어 주세요',
  confirmUnverified: '근거가 확인되지 않은 사실 {n}개를 원문과 직접 대조했어요', resetReview: '검수 대기로', resetDone: '검수 대기로 되돌렸어요. 보호자 화면에서 내려갑니다.',
  reject: '반려', rejectNeedsNote: '메모에 반려 사유를 적어 주세요', rejectDone: '반려했어요.', approve: '승인하고 게시', approveDone: '승인했어요. 보호자 화면에 게시됩니다.',
  questionsByProgram: '공고별 질문', questionsAsked: '질문 {n}건', openCount: '답 없음 {n}', allAnswered: '모두 답함', openReview: '공고 검수 화면', answeredBy: '추가 안내로 답함 · {date}',
  stepReadNotice: '공고 읽기', stepReadQuestions: '질문 {n}개 읽기', stepCheck: '초안 코드 검사', stepSubmit: '제출', stepProblems: '문제 {n}건 → 고쳐 쓰기', agentSteps: '에이전트가 한 일',
  improveTitle: '공고 보완 도우미', aiAgent: 'AI 에이전트', improveLead: '답하지 못한 보호자 질문으로 공고에 덧붙일 안내 초안을 써요. 공고에 없는 답(금액·가능 여부 등)은 AI가 정하지 않고 빈칸으로 남기고, 코드가 빈칸 밖의 숫자·날짜·단정하는 말을 공고 원문과 대조해요.',
  addendaSaved: '추가 안내 {n}건을 공고에 덧붙였어요.', addendaSavedHint: '이제 보호자 AI 상담이 이 안내를 근거로 답하고, 보호자 화면의 \'기관에 확인할 점\'에서 고른 항목이 빠져요.',
  improveNoProgram: '이 공고는 서버에 없어 보완할 수 없어요.', improveNeedsApi: '관리자 API에 연결하면 공고 보완 도우미를 쓸 수 있어요.', improveStart: '답하지 못한 질문 {n}개로 보완 초안 만들기', improveAllAnswered: '모든 질문에 답했어요.',
  improveRunning: '공고와 질문을 읽고 초안을 쓴 뒤 코드로 검사하고 있어요 (보통 10초 안팎).',
  improvePassed: '코드 검사 통과 ({n}회 검사) · 빈칸 밖에 공고에 없는 숫자·날짜·수량이나 답을 단정하는 말이 없어요', improveNotPassed: '코드 검사를 통과하지 못한 항목이 있어요. 문제를 확인하고 고쳐 주세요.', improveUncovered: '초안이 다루지 않은 질문: {list}',
  authorName: '확정하는 담당자', fillBlanksFirst: '빈칸 {n}곳을 채워야 덧붙일 수 있어요.', addendaPublishHint: '덧붙인 안내는 담당자 이름과 함께 바로 보호자 AI 상담의 근거가 돼요.', cancel: '닫기', addAddenda: '고른 {n}건을 공고에 덧붙이기',
  kindAlready: '공고에 이미 있음', kindAdd: '공고에 덧붙일 안내', askedBy: '{n}명이 물음', quoteFromNotice: '공고 원문', draftSentence: '덧붙일 문장 (고칠 수 있어요)', blankPlaceholder: '기관이 정한 내용', draftPreview: '게시될 문장', resolvesLegend: "보호자 화면의 '기관에 확인할 점'에서 뺄 항목",
  demandLead: '보호자가 익명으로 남긴 희망 조건을 모아 봐요. 적은 수의 집계는 가려요.', recommendLead: '조건을 바꾸면 오른쪽 추천이 바로 바뀌어요. 계산은 코드가 하고, 시연용 가정과 가상 장소를 써요.', guideLead: '이 화면이 쓰는 데이터와 쓰지 않는 데이터예요.',
  questionsPrivacy: '이름·연락처·대화 내용은 받지 않고, 공고·주제·일반화한 질문·날짜만 받아요.',
} as const
type Key = keyof typeof ko
type Dictionary = Record<Key, string>
const vi: Dictionary = {
  brand: 'Chương trình cho trẻ em Osan', institution: 'Dành cho đơn vị', language: 'Ngôn ngữ', demo: 'Dữ liệu mô phỏng · Không phải phản hồi thực tế',
  pickerMore: 'Ngôn ngữ khác', pickerTitle: 'Chọn ngôn ngữ màn hình', pickerSearch: 'Tìm theo tên ngôn ngữ', close: 'Đóng', pickerCurrent: 'Đang dùng', pickerDraft: 'Bản dịch nháp', pickerInReview: 'Đang kiểm tra bản dịch', pickerNotOffered: 'Chưa hỗ trợ', pickerNoMatch: 'Không tìm thấy ngôn ngữ', draftNotice: 'Chữ trên màn hình bằng ngôn ngữ này là bản nháp chưa được kiểm tra. Chỉ chọn được trong bản phát triển và trình diễn.', skip: 'Chuyển đến nội dung chính', demandSummary: '{n} gia đình đã trả lời.', demandSummaryFiltered: 'Có {n} trong {total} gia đình phù hợp điều kiện.', demandPeak: 'Thời gian đông nhất: {slots}.', demandPeakHidden: 'Số theo giờ đã được ẩn để bảo vệ thông tin cá nhân.', showRecommend: 'Xem gợi ý', detailsOpen: 'Xem chi tiết phương án {n}', detailsTitle: 'Chi tiết phương án {n}', applyFilters: 'Áp dụng', nextStepTitle: 'Bước tiếp theo (chưa làm lần này)', nextStepBody: 'Đồng ý ẩn danh trên web phụ huynh → máy chủ tổng hợp, che số nhỏ → màn hình này', programQuestion: 'Bạn sẽ mở chương trình nào?', venuesSummary: '{m}/{n} nơi', baselineOnSummary: 'Bật', baselineOffSummary: 'Tắt',
  demandTab: 'Tổng quan nhu cầu', recommendTab: 'Lịch & địa điểm', guideTab: 'Thông tin dữ liệu',
  filterTitle: 'Chọn điều kiện', filterOpen: 'Đổi điều kiện', reset: 'Đặt lại', all: 'Tất cả', allFields: 'Mọi lĩnh vực', allLanguages: 'Mọi ngôn ngữ',
  district: 'Phường', selected: 'Đã chọn {n}', grade: 'Lớp của trẻ', startGrade: 'Từ lớp', endGrade: 'Đến lớp', gradeValue: 'Lớp {n}',
  interest: 'Lĩnh vực', screenLanguage: 'Ngôn ngữ giao diện', households: 'Gia đình phản hồi', avgSlots: 'Thời gian mỗi gia đình', koreanResponse: 'Tỷ lệ trả lời trình độ tiếng Hàn',
  avgEstimate: 'Trung bình 21 ô · ước tính', slots: '{n} ô',
  heatTitle: 'Có thể tham gia khi nào?', heatCaption: 'Số gia đình theo ngày và buổi', districtTitle: 'Ở phường nào?', languageTitle: 'Ngôn ngữ giao diện', levelTitle: 'Trình độ tiếng Hàn của trẻ',
  districtCount: 'Số gia đình theo phường', languageCount: 'Số gia đình theo ngôn ngữ', levelCount: 'Số gia đình theo trình độ tiếng Hàn',
  planTitle: 'Điều kiện chương trình', planField: 'Lĩnh vực chương trình', targetGrade: 'Lớp phù hợp', classCount: 'Số lớp', classes: '{n} lớp', capacity: 'Sức chứa mỗi lớp', people: '{n} người',
  venues: 'Địa điểm đề xuất', selectAll: 'Chọn tất cả', clearAll: 'Bỏ chọn', available: 'Có {n} khung giờ',
  baseline: 'Kế hoạch hiện tại', compareBaseline: 'So với kế hoạch hiện tại', baselineClassSlot: 'Thời gian lớp {n} hiện tại', baselineClassVenue: 'Địa điểm lớp {n} hiện tại',
  planForClass: 'Lớp {n}', noVenues: 'Không có địa điểm', chooseVenue: 'Hãy chọn ít nhất một địa điểm.', noReach: 'Không có gia đình phù hợp', widen: 'Thêm địa điểm hoặc mở rộng điều kiện.',
  heatPlanCaption: 'Nhu cầu và thời gian gợi ý',
  option: 'Phương án {n}', eligible: 'Trong {n} gia đình', compared: 'So với kế hoạch {rate}',
  classDetails: 'Chi tiết từng lớp', class: 'Lớp', time: 'Ngày và buổi', place: 'Địa điểm', reached: 'Gia đình tiếp cận', added: 'Thêm mới', expected: 'Dự kiến / sức chứa',
  sameEffect: 'Hiệu quả tương đương', overCapacity: 'Vượt sức chứa', estimatedNote: 'Dự kiến theo tỷ lệ đăng ký mô phỏng {n}%',
  guideCollected: 'Dữ liệu sử dụng', guideNotCollected: 'Không thu thập', guidePrivacy: 'Cách hiển thị',
  guideDistrict: 'Phường cư trú', guideDistrictValue: '6 phường ở Osan', guideChildGrade: 'Lớp của trẻ', guideChildGradeValue: 'Tiểu học lớp 1–6',
  guideTime: 'Thời gian có thể tham gia', guideTimeValue: 'Ngày × sáng·chiều·tối', guideInterest: 'Lĩnh vực quan tâm', guideInterestValue: 'Trải nghiệm, tiếng Hàn, nghệ thuật·thể thao, định hướng nghề',
  guideKoreanLevel: 'Trình độ tiếng Hàn của trẻ', guideKoreanLevelValue: 'Sơ cấp·trung cấp·thành thạo (tùy chọn)', guideLanguage: 'Ngôn ngữ giao diện', guideLanguageValue: 'Tiếng Hàn đơn giản·Việt·Trung',
  name: 'Tên', contact: 'Liên hệ', address: 'Địa chỉ chi tiết', origin: 'Quốc gia xuất thân',
  privacy1: 'Chỉ hiển thị số tổng hợp, không hiển thị từng câu trả lời', privacy2: 'Ô có 1–{n} gia đình được ghi “dưới {threshold}”', privacy3: 'Ẩn thêm ô có thể suy ngược từ tổng', privacy4: 'Không hiển thị kết quả dưới {n} gia đình',
  hidden: 'Ẩn', below: 'Dưới {n}', belowHouseholds: 'Dưới {n} gia đình', maskedNote: 'Ẩn để bảo vệ thông tin cá nhân',
  householdValue: '{n} gia đình', approxPeople: 'Khoảng {n} người', belowPeople: 'Dưới {n} người', peopleValue: '{n} người',
  insufficientTitle: 'Không thể hiển thị', insufficientText: 'Có dưới {n} gia đình phù hợp nên kết quả được ẩn.',
  morning: 'Sáng', afternoon: 'Chiều', evening: 'Tối', householdCount: 'Số gia đình', recommended: 'Gợi ý', existing: 'Hiện tại', dayMon: 'T2', dayTue: 'T3', dayWed: 'T4', dayThu: 'T5', dayFri: 'T6', daySat: 'T7', daySun: 'CN',
  levelBeginner: 'Sơ cấp', levelIntermediate: 'Trung cấp', levelFluent: 'Thành thạo', levelNone: 'Chưa trả lời', easyKorean: 'Tiếng Hàn đơn giản', vietnamese: 'Tiếng Việt', chinese: 'Tiếng Trung',
  interestExperience: 'Trải nghiệm·văn hóa', interestKorean: 'Tiếng Hàn', interestSports: 'Nghệ thuật·thể thao', interestCareer: 'Định hướng nghề',
  demoResultNote: 'Kết quả dựa trên giả định và địa điểm mô phỏng. Hãy xác minh trước khi tổ chức.', approximate: 'Quá nhiều tổ hợp nên kết quả dùng phương pháp xấp xỉ.',
  insights: 'Lý do và việc cần chuẩn bị', insightSummary: 'Lịch và địa điểm được chọn để tiếp cận nhiều gia đình hơn.', languageAdvice: 'Chuẩn bị bản dịch và phiên dịch theo phân bố ngôn ngữ.', teachingAdvice: 'Chuẩn bị tài liệu dễ hiểu và người hỗ trợ theo trình độ tiếng Hàn của trẻ.', originalDetails: 'Phân tích chi tiết bằng tiếng Hàn', originalNote: 'Các nhận xét dưới đây chỉ có bản tiếng Hàn.',
  questionsTab: 'Câu hỏi', questionsLead: 'Câu hỏi phụ huynh không tìm được câu trả lời trong thông báo khi hỏi trợ lý AI, và đã báo cho đơn vị (không ghi tên).', questionsTotal: '{n} câu hỏi · {m} thông báo',
  questionsLive: 'Gồm {n} câu hỏi từ web phụ huynh', questionsDemo: 'Có lẫn câu hỏi mẫu để trình diễn.', questionsEmpty: 'Chưa có câu hỏi nào.',
  questionsOffline: 'Không kết nối được máy chủ câu hỏi nên chỉ hiện câu hỏi mẫu.', questionsLiveLabel: '(câu hỏi từ web phụ huynh)',
  questionsCount: '{n} người đã hỏi', questionsTopicCount: 'Số câu hỏi theo chủ đề', questionsRefresh: 'Làm mới',
  topicFamily: 'Điều kiện tham gia', topicCompanion: 'Đi cùng', topicKoreanLevel: 'Tiếng Hàn·phiên dịch', topicSchedule: 'Lịch·cách tham gia', topicAgeGrade: 'Tuổi·lớp', topicMaterials: 'Đồ chuẩn bị·trang phục', topicOther: 'Chi phí và nội dung khác',
  programsTab: 'Quản lý thông báo', navOperate: 'Vận hành thông báo', navPlan: 'Lập chương trình', navBadge: '{n} việc cần xử lý', reviewerName: 'Tên người phụ trách', reviewerPlaceholder: 'VD: Kim Osan',
  reviewPending: 'Chờ kiểm tra', reviewApproved: 'Đang đăng', reviewStale: 'Bản gốc đã đổi · kiểm tra lại', reviewRejected: 'Từ chối',
  summaryApproved: 'Người đã duyệt', summaryChecked: 'AI đối chiếu tự động đạt', summaryDraft: 'Bản nháp · có lỗi', summaryWithdrawn: 'Hết hiệu lực duyệt',
  posterApproved: 'Người phụ trách đã duyệt', posterFailed: 'Kiểm tra không đạt · không đăng', posterChecked: 'AI kiểm tra đạt (lần {n})',
  loading: 'Đang tải', noApiTitle: 'Chưa kết nối API chương trình', noApiHint: 'Đặt địa chỉ máy chủ bằng VITE_API_BASE_URL để dùng kiểm tra thông báo và trợ lý bổ sung thông báo.',
  adminOffTitle: 'API quản trị đang tắt', adminOffHint: 'Bật bằng npm run demo hoặc chạy máy chủ với ADMIN_API=1. Không có đăng nhập nên chỉ bật khi trình diễn hoặc trong mạng nội bộ.',
  apiErrorTitle: 'Không kết nối được máy chủ', apiErrorHint: 'Hãy kiểm tra máy chủ đang chạy rồi thử lại.', retry: 'Thử lại',
  programsLead: 'AI đọc thông báo gốc và áp phích để rút ra thông tin và tạo áp phích dịch. Chỉ đăng lên màn hình phụ huynh sau khi người phụ trách đối chiếu và duyệt.',
  filterAll: 'Tất cả', filterReview: 'Cần kiểm tra', filterPublished: 'Đang đăng', filterPosters: 'Áp phích dịch',
  kpiTitle: 'Tình hình thông báo', kpiTotal: 'Tổng số thông báo', kpiPublished: 'Đang đăng {n}', kpiNeedsReview: 'Thông báo cần kiểm tra', kpiUnverified: 'Cần xác nhận căn cứ {n}',
  kpiPosters: 'Áp phích dịch đạt kiểm tra AI', kpiPostersApproved: 'Đã duyệt {n}', kpiAddenda: 'Thông tin bổ sung của đơn vị', kpiAddendaHint: 'Câu bổ sung từ câu hỏi phụ huynh',
  searchPrograms: 'Tìm theo tên thông báo', colProgram: 'Thông báo', colReview: 'Kiểm tra', colEvidence: 'Căn cứ gốc', colSummaries: 'Tóm tắt', colPosters: 'Áp phích dịch', colQuestions: 'Câu hỏi', colSchedule: 'Lịch',
  demoNotice: 'Thông báo mô phỏng', addendaCount: 'Bổ sung {n}', unverifiedCount: 'Cần xác nhận {n}', allVerified: 'Đã xác nhận hết', noPrograms: 'Không có thông báo phù hợp.',
  programsLegend: 'Tóm tắt·áp phích dịch: chip đậm là người phụ trách đã duyệt, chip viền là chỉ đạt kiểm tra tự động của AI, chip vàng là có lỗi.',
  sourceLink: 'Thông báo gốc', paneSource: 'Thông báo gốc', sourcePoster: 'Áp phích', sourceText: 'Văn bản gốc', posterOriginalAlt: 'Áp phích gốc {title}', noSourceText: 'Không có văn bản gốc đã lưu.', retrievedAt: 'Ngày xác nhận bản gốc {date}',
  paneFacts: 'Thông tin AI đã đọc', onlyUnverified: 'Chỉ mục cần xác nhận', factsLead: 'Trong {n} thông tin có trong thông báo, {m} đã được xác nhận bằng câu gốc. Hãy đối chiếu câu căn cứ với bản gốc.',
  unverifiedNotice: 'Thông tin chưa xác nhận bằng căn cứ gốc: {labels}', extractWarnings: 'Cảnh báo khi AI trích xuất', toConfirmTitle: "Mục 'cần hỏi đơn vị' trên màn hình phụ huynh", toConfirmNone: 'Không có.',
  openQuestions: 'Xem câu hỏi của phụ huynh cho thông báo này', addendaTitle: 'Thông tin bổ sung của đơn vị (đang đăng)', draftedByAi: 'Bắt đầu từ bản nháp AI', remove: 'Xóa', addendumRemoved: 'Đã xóa thông tin bổ sung.',
  summariesTitle: 'Hướng dẫn 3 dòng trên màn hình phụ huynh', noSummaries: 'Chưa có tóm tắt.', panePoster: 'Áp phích dịch', noTranslatedPoster: 'Chưa có áp phích dịch. Có thể tạo bằng npm run poster.', noPosterAtAll: 'Thông báo này không có ảnh áp phích.',
  posterTranslatedAlt: 'Áp phích {title} bản {language}', viewingAttempt: 'Đang xem lần thử {n}.', viewFinal: 'Xem bản được đăng',
  posterApprovedBy: 'Đã duyệt: {name} · {date}', posterFailedLong: 'Không đạt kiểm tra trong 3 lần nên không gửi cho phụ huynh.', posterCheckedLong: 'AI kiểm tra đạt (kết quả lần {n}) · chưa được người phụ trách xác nhận',
  stepTable: 'Đọc bản gốc · bảng dịch {n} cụm (số·ngày·điện thoại do mã kiểm tra)', attemptN: 'Lần {n}', attemptPassed: 'AI khác đọc lại và đối chiếu · đạt', attemptIssues: 'AI khác đọc lại · {n} lỗi → chỉ tạo lại phần đó', attemptChosen: 'được đăng',
  qrMatches: 'Ghép QR gốc · đọc lại, địa chỉ khớp', qrMismatch: 'Địa chỉ QR khác bản gốc', injectedFault: 'Để trình diễn: lỗi cố ý đưa vào lần 1 ({fault}) đã bị kiểm tra phát hiện.',
  posterSourceChanged: 'Áp phích gốc đã đổi sau khi dịch. Cần dịch lại.', posterApprovedDone: 'Đã duyệt áp phích dịch.', approvePoster: 'Duyệt áp phích dịch này', needReviewer: 'Nhập tên người phụ trách ở góc dưới bên trái để duyệt.',
  factVerified: 'Đã xác nhận bằng bản gốc', factUnverified: 'Cần xác nhận căn cứ', factNotStated: 'Không có trong thông báo',
  decisionTitle: 'Quyết định kiểm tra', lastReview: 'Lần kiểm tra cuối: {name} · {date}', notReviewedYet: 'Chưa có người kiểm tra.', approveSummaries: 'Tóm tắt duyệt cùng',
  languageReviewer: 'Người kiểm tra tiếng Việt·Trung', languageReviewerHint: 'Người đã kiểm tra ngôn ngữ đó', reviewNote: 'Ghi chú', reviewNoteHint: 'Khi từ chối, hãy ghi lý do',
  confirmUnverified: 'Tôi đã tự đối chiếu {n} thông tin chưa có căn cứ với bản gốc', resetReview: 'Về chờ kiểm tra', resetDone: 'Đã chuyển về chờ kiểm tra. Thông báo sẽ bị gỡ khỏi màn hình phụ huynh.',
  reject: 'Từ chối', rejectNeedsNote: 'Hãy ghi lý do từ chối vào ghi chú', rejectDone: 'Đã từ chối.', approve: 'Duyệt và đăng', approveDone: 'Đã duyệt. Thông báo sẽ được đăng lên màn hình phụ huynh.',
  questionsByProgram: 'Câu hỏi theo thông báo', questionsAsked: '{n} câu hỏi', openCount: 'Chưa trả lời {n}', allAnswered: 'Đã trả lời hết', openReview: 'Màn hình kiểm tra thông báo', answeredBy: 'Đã trả lời bằng thông tin bổ sung · {date}',
  stepReadNotice: 'Đọc thông báo', stepReadQuestions: 'Đọc {n} câu hỏi', stepCheck: 'Mã kiểm tra bản nháp', stepSubmit: 'Gửi', stepProblems: '{n} lỗi → viết lại', agentSteps: 'Việc tác tử đã làm',
  improveTitle: 'Trợ lý bổ sung thông báo', aiAgent: 'Tác tử AI', improveLead: 'Từ các câu hỏi chưa được trả lời, AI viết bản nháp thông tin bổ sung. AI không tự quyết giá trị không có trong thông báo (phí, có được hay không...) mà để trống; số, ngày và câu khẳng định được mã đối chiếu với thông báo gốc.',
  addendaSaved: 'Đã bổ sung {n} thông tin vào thông báo.', addendaSavedHint: "Từ giờ trợ lý AI cho phụ huynh sẽ trả lời dựa trên thông tin này, và các mục đã chọn sẽ bị bỏ khỏi 'cần hỏi đơn vị'.",
  improveNoProgram: 'Thông báo này không có trên máy chủ nên không thể bổ sung.', improveNeedsApi: 'Kết nối API quản trị để dùng trợ lý bổ sung thông báo.', improveStart: 'Tạo bản nháp từ {n} câu hỏi chưa trả lời', improveAllAnswered: 'Đã trả lời mọi câu hỏi.',
  improveRunning: 'Đang đọc thông báo và câu hỏi, viết bản nháp rồi kiểm tra bằng mã (thường khoảng 10 giây).',
  improvePassed: 'Đạt kiểm tra bằng mã ({n} lần) · ngoài chỗ trống không có số, ngày, số lượng hay câu khẳng định câu trả lời không có trong thông báo', improveNotPassed: 'Có mục chưa đạt kiểm tra bằng mã. Hãy xem lỗi và sửa.', improveUncovered: 'Câu hỏi bản nháp chưa xử lý: {list}',
  authorName: 'Người phụ trách xác nhận', fillBlanksFirst: 'Cần điền {n} chỗ trống trước khi bổ sung.', addendaPublishHint: 'Thông tin bổ sung kèm tên người phụ trách sẽ ngay lập tức làm căn cứ cho trợ lý AI của phụ huynh.', cancel: 'Đóng', addAddenda: 'Bổ sung {n} mục đã chọn',
  kindAlready: 'Đã có trong thông báo', kindAdd: 'Thông tin cần bổ sung', askedBy: '{n} người hỏi', quoteFromNotice: 'Câu gốc trong thông báo', draftSentence: 'Câu sẽ bổ sung (có thể sửa)', blankPlaceholder: 'Nội dung đơn vị quyết định', draftPreview: 'Câu sẽ được đăng', resolvesLegend: "Mục bỏ khỏi 'cần hỏi đơn vị' trên màn hình phụ huynh",
  demandLead: 'Tổng hợp điều kiện phụ huynh để lại ẩn danh. Số nhỏ được che.', recommendLead: 'Đổi điều kiện thì gợi ý bên phải đổi ngay. Mã tính toán, dùng giả định và địa điểm mô phỏng.', guideLead: 'Dữ liệu màn hình này dùng và không dùng.',
  questionsPrivacy: 'Không nhận tên, liên lạc hay nội dung trò chuyện; chỉ nhận thông báo, chủ đề, câu hỏi đã khái quát và ngày.',
}
const zh: Dictionary = {
  brand: '乌山市儿童活动', institution: '机构端', language: '页面语言', demo: '模拟数据 · 并非真实家长反馈',
  pickerMore: '其他语言', pickerTitle: '选择界面语言', pickerSearch: '按语言名称搜索', close: '关闭', pickerCurrent: '当前语言', pickerDraft: '翻译草稿', pickerInReview: '翻译审核中', pickerNotOffered: '暂不提供', pickerNoMatch: '没有找到该语言', draftNotice: '此语言的界面文字是未经审核的草稿，仅在开发和演示版本中可选。', skip: '跳到正文', demandSummary: '共有{n}户回答。', demandSummaryFiltered: '{total}户中有{n}户符合条件。', demandPeak: '人数最多的时间是{slots}。', demandPeakHidden: '为保护个人信息，各时段人数已隐藏。', showRecommend: '查看推荐', detailsOpen: '查看方案{n}详情', detailsTitle: '方案{n}详情', applyFilters: '应用', nextStepTitle: '下一步（本次不做）', nextStepBody: '家长网页匿名同意 → 服务器汇总并隐藏小数 → 本页面', programQuestion: '要开设什么活动？', venuesSummary: '{n}处中{m}处', baselineOnSummary: '开启', baselineOffSummary: '关闭',
  demandTab: '需求概览', recommendTab: '日程·地点推荐', guideTab: '数据说明',
  filterTitle: '选择条件', filterOpen: '更改条件', reset: '重置', all: '全部', allFields: '全部领域', allLanguages: '全部语言',
  district: '街区', selected: '已选{n}处', grade: '孩子年级', startGrade: '起始年级', endGrade: '结束年级', gradeValue: '{n}年级',
  interest: '兴趣领域', screenLanguage: '界面语言', households: '回应家庭', avgSlots: '每户可参与时段', koreanResponse: '韩语水平回答率',
  avgEstimate: '21格平均 · 估算', slots: '{n}格',
  heatTitle: '何时可以参加？', heatCaption: '按星期和时段汇总的家庭数', districtTitle: '来自哪个街区？', languageTitle: '界面语言', levelTitle: '孩子的韩语水平',
  districtCount: '按街区汇总的家庭数', languageCount: '按语言汇总的家庭数', levelCount: '按韩语水平汇总的家庭数',
  planTitle: '活动条件', planField: '活动领域', targetGrade: '适合年级', classCount: '班级数', classes: '{n}个班', capacity: '每班名额', people: '{n}人',
  venues: '候选地点', selectAll: '全选', clearAll: '清空', available: '可预约{n}个时段',
  baseline: '现有计划', compareBaseline: '与现有计划比较', baselineClassSlot: '现有计划第{n}班时段', baselineClassVenue: '现有计划第{n}班地点',
  planForClass: '第{n}班', noVenues: '没有候选地点', chooseVenue: '请至少选择一个地点。', noReach: '没有符合条件的家庭', widen: '请增加地点或放宽条件。',
  heatPlanCaption: '需求与推荐时段',
  option: '方案{n}', eligible: '对象{n}户', compared: '对比现有计划{rate}',
  classDetails: '各班详情', class: '班级', time: '星期·时段', place: '地点', reached: '可覆盖家庭', added: '新增覆盖', expected: '预计报名 / 名额',
  sameEffect: '效果相同', overCapacity: '超过名额', estimatedNote: '预计报名按模拟转化率{n}%计算',
  guideCollected: '使用的数据', guideNotCollected: '不收集的信息', guidePrivacy: '显示规则',
  guideDistrict: '居住街区', guideDistrictValue: '乌山市6个街区', guideChildGrade: '孩子年级', guideChildGradeValue: '小学1–6年级',
  guideTime: '可参与时间', guideTimeValue: '星期 × 上午·下午·晚上', guideInterest: '兴趣领域', guideInterestValue: '体验文化、韩语、艺术体育、职业探索',
  guideKoreanLevel: '孩子的韩语水平', guideKoreanLevelValue: '初级·中级·流利（可选）', guideLanguage: '界面语言', guideLanguageValue: '简明韩语·越南语·中文',
  name: '姓名', contact: '联系方式', address: '详细地址', origin: '原籍国',
  privacy1: '仅显示汇总数据，不显示单条回答', privacy2: '1–{n}户的统计格显示为“少于{threshold}”', privacy3: '可由总数反推的格子也会隐藏', privacy4: '少于{n}户时不显示结果',
  hidden: '隐藏', below: '少于{n}', belowHouseholds: '少于{n}户', maskedNote: '为保护个人信息而隐藏',
  householdValue: '{n}户', approxPeople: '约{n}人', belowPeople: '少于{n}人', peopleValue: '{n}人',
  insufficientTitle: '无法显示', insufficientText: '符合条件的家庭少于{n}户，因此隐藏结果。',
  morning: '上午', afternoon: '下午', evening: '晚上', householdCount: '家庭数', recommended: '推荐', existing: '原计划', dayMon: '一', dayTue: '二', dayWed: '三', dayThu: '四', dayFri: '五', daySat: '六', daySun: '日',
  levelBeginner: '初级', levelIntermediate: '中级', levelFluent: '流利', levelNone: '未回答', easyKorean: '简明韩语', vietnamese: '越南语', chinese: '中文',
  interestExperience: '体验·文化', interestKorean: '韩语', interestSports: '艺术·体育', interestCareer: '职业探索',
  demoResultNote: '结果使用模拟假设和虚构地点。实际安排前请核实。', approximate: '组合过多，已使用近似推荐方法。',
  insights: '推荐理由与准备事项', insightSummary: '通过组合时段和地点，让更多家庭能够参加。', languageAdvice: '根据语言分布准备翻译资料和口译支持。', teachingAdvice: '根据孩子的韩语水平准备简明资料和辅助人员。', originalDetails: '韩语详细分析', originalNote: '以下分析内容仅提供韩语原文。',
  questionsTab: '家长提问', questionsLead: '家长在AI咨询中没能从公告找到答案，并匿名告诉机构的问题。', questionsTotal: '问题{n}条 · 公告{m}个',
  questionsLive: '含家长网页提交的问题{n}条', questionsDemo: '其中混有演示用的示例问题。', questionsEmpty: '还没有收到问题。',
  questionsOffline: '无法连接问题服务器，目前只显示演示示例。', questionsLiveLabel: '（来自家长网页的问题）',
  questionsCount: '{n}人问过', questionsTopicCount: '各主题的问题数', questionsRefresh: '刷新',
  topicFamily: '参加资格', topicCompanion: '陪同', topicKoreanLevel: '韩语水平·翻译', topicSchedule: '日程·参加方式', topicAgeGrade: '年龄·年级', topicMaterials: '准备物品·服装', topicOther: '费用等其他内容',
  programsTab: '公告管理', navOperate: '公告运营', navPlan: '项目编排', navBadge: '待处理 {n} 项', reviewerName: '负责人姓名', reviewerPlaceholder: '例：金乌山',
  reviewPending: '待审核', reviewApproved: '发布中', reviewStale: '原文已变更·需重审', reviewRejected: '已驳回',
  summaryApproved: '人工已批准', summaryChecked: 'AI自动核对通过', summaryDraft: '草稿·有问题', summaryWithdrawn: '批准已失效',
  posterApproved: '负责人已批准', posterFailed: '核验未通过·不发布', posterChecked: 'AI核验通过（第{n}次）',
  loading: '正在加载', noApiTitle: '未连接项目API', noApiHint: '用 VITE_API_BASE_URL 设置服务器地址后，可使用公告审核和公告补充助手。',
  adminOffTitle: '管理API已关闭', adminOffHint: '请用 npm run demo 开启，或以 ADMIN_API=1 运行服务器。没有登录功能，仅在演示或内网中开启。',
  apiErrorTitle: '无法连接服务器', apiErrorHint: '请确认服务器已运行后重试。', retry: '重试',
  programsLead: 'AI读取公告原文和海报，提取信息并生成翻译海报。负责人与原文核对并批准后，才会发布到家长页面。',
  filterAll: '全部', filterReview: '需审核', filterPublished: '发布中', filterPosters: '翻译海报',
  kpiTitle: '公告概况', kpiTotal: '全部公告', kpiPublished: '发布中 {n} 条', kpiNeedsReview: '需审核的公告', kpiUnverified: '需确认依据 {n} 条',
  kpiPosters: '通过AI核验的翻译海报', kpiPostersApproved: '负责人已批准 {n} 张', kpiAddenda: '机构补充说明', kpiAddendaHint: '根据家长提问补充的句子',
  searchPrograms: '按公告名称查找', colProgram: '公告', colReview: '审核', colEvidence: '原文依据', colSummaries: '说明摘要', colPosters: '翻译海报', colQuestions: '家长提问', colSchedule: '日程',
  demoNotice: '演示公告', addendaCount: '补充 {n} 条', unverifiedCount: '需确认 {n}', allVerified: '全部确认', noPrograms: '没有符合条件的公告。',
  programsLegend: '摘要·翻译海报：实心标签为负责人已批准，描边标签为仅通过AI自动核验，黄色标签为有问题。',
  sourceLink: '原公告', paneSource: '原始公告', sourcePoster: '海报', sourceText: '原文', posterOriginalAlt: '{title} 原始海报', noSourceText: '没有保存的原文。', retrievedAt: '原文确认日 {date}',
  paneFacts: 'AI读取的信息', onlyUnverified: '只看需确认', factsLead: '公告中的 {n} 项信息里，{m} 项已用原文句子确认。请将依据句与原件核对。',
  unverifiedNotice: '未经原文依据确认的信息：{labels}', extractWarnings: 'AI提取警告', toConfirmTitle: '家长页面的“需向机构确认事项”', toConfirmNone: '没有。',
  openQuestions: '查看此公告的家长提问', addendaTitle: '机构补充说明（发布中）', draftedByAi: '由AI草稿开始', remove: '删除', addendumRemoved: '已删除补充说明。',
  summariesTitle: '家长页面三行说明', noSummaries: '没有生成摘要。', panePoster: '翻译海报', noTranslatedPoster: '还没有翻译海报。可用 npm run poster 生成。', noPosterAtAll: '此公告没有海报图片。',
  posterTranslatedAlt: '{title} {language}翻译海报', viewingAttempt: '正在查看第{n}次尝试。', viewFinal: '查看发布版本',
  posterApprovedBy: '负责人批准：{name} · {date}', posterFailedLong: '3次内未通过核验，不向家长发布。', posterCheckedLong: 'AI核验通过（第{n}次结果）·负责人确认前',
  stepTable: '读取原件·{n}条译文对照表（数字·日期·电话由代码检查）', attemptN: '第{n}次', attemptPassed: '另一个AI重新读取核对·通过', attemptIssues: '另一个AI重新读取·{n}个问题→只重新生成该部分', attemptChosen: '已发布',
  qrMatches: '移植原QR·重新扫描地址一致', qrMismatch: 'QR地址与原件不同', injectedFault: '演示用：第1次指令中故意加入的错误（{fault}）被核验发现。',
  posterSourceChanged: '翻译后原始海报已变更，需要重新翻译。', posterApprovedDone: '已批准翻译海报。', approvePoster: '批准此翻译海报', needReviewer: '在左下角填写负责人姓名后即可批准。',
  factVerified: '已用原文确认', factUnverified: '需确认依据', factNotStated: '公告中没有',
  decisionTitle: '审核决定', lastReview: '最近审核：{name} · {date}', notReviewedYet: '尚未经人工审核。', approveSummaries: '一并批准的说明摘要',
  languageReviewer: '越南语·中文审核人', languageReviewerHint: '确认该语言的人', reviewNote: '备注', reviewNoteHint: '驳回时请填写理由',
  confirmUnverified: '我已亲自将 {n} 项无依据的信息与原文核对', resetReview: '退回待审核', resetDone: '已退回待审核，将从家长页面撤下。',
  reject: '驳回', rejectNeedsNote: '请在备注中填写驳回理由', rejectDone: '已驳回。', approve: '批准并发布', approveDone: '已批准，将发布到家长页面。',
  questionsByProgram: '按公告分类的提问', questionsAsked: '提问 {n} 条', openCount: '未回答 {n}', allAnswered: '已全部回答', openReview: '公告审核页面', answeredBy: '已用补充说明回答 · {date}',
  stepReadNotice: '读取公告', stepReadQuestions: '读取 {n} 个提问', stepCheck: '草稿代码检查', stepSubmit: '提交', stepProblems: '{n} 个问题→改写', agentSteps: '智能体做了什么',
  improveTitle: '公告补充助手', aiAgent: 'AI智能体', improveLead: '根据未能回答的家长提问，AI撰写要补充到公告中的说明草稿。公告中没有的值（费用、是否可以等）AI不会自行决定而是留空；数字、日期和断定表达由代码与公告原文核对。',
  addendaSaved: '已向公告补充 {n} 条说明。', addendaSavedHint: '今后家长AI咨询将以此说明为依据回答，所选项目会从“需向机构确认事项”中移除。',
  improveNoProgram: '服务器上没有此公告，无法补充。', improveNeedsApi: '连接管理API后可使用公告补充助手。', improveStart: '用 {n} 个未回答的提问生成补充草稿', improveAllAnswered: '所有提问都已回答。',
  improveRunning: '正在读取公告和提问、撰写草稿并用代码检查（通常约10秒）。',
  improvePassed: '代码检查通过（检查 {n} 次）·空白之外没有公告中没有的数字、日期、数量或断定答案的表达', improveNotPassed: '有项目未通过代码检查，请查看问题并修改。', improveUncovered: '草稿未处理的提问：{list}',
  authorName: '确认的负责人', fillBlanksFirst: '需填写 {n} 处空白后才能补充。', addendaPublishHint: '补充说明会连同负责人姓名立即成为家长AI咨询的依据。', cancel: '关闭', addAddenda: '将所选 {n} 条补充到公告',
  kindAlready: '公告中已有', kindAdd: '需补充的说明', askedBy: '{n} 人提问', quoteFromNotice: '公告原文', draftSentence: '要补充的句子（可修改）', blankPlaceholder: '机构决定的内容', draftPreview: '将发布的句子', resolvesLegend: '从家长页面“需向机构确认事项”中移除的项目',
  demandLead: '汇总家长匿名留下的期望条件。数量少的统计会被遮盖。', recommendLead: '修改条件后右侧推荐会立即变化。由代码计算，使用演示假设和虚拟场所。', guideLead: '本页面使用和不使用的数据。',
  questionsPrivacy: '不收集姓名、联系方式和聊天内容，只收集公告、主题、概括后的问题和日期。',
}
const dictionaries: Record<Locale, Dictionary> = { 'ko-easy': ko, vi, zh }
const storageKey = 'osan-dashboard-locale'
/** 화면 언어 공개 정책: 공개 빌드에는 검수된 문구만, 초안은 개발·시연 빌드에서만(보호자 웹과 같은 규칙). */
export const UI_REVIEW: Record<Locale, 'reviewed' | 'draft'> = { 'ko-easy': 'reviewed', vi: 'draft', zh: 'draft' }
export const draftLocalesAllowed = (): boolean => import.meta.env.DEV || import.meta.env.VITE_DATA_MODE === 'demo' || import.meta.env.VITE_ALLOW_DRAFT_LOCALES === 'true'
export function localeState(locale: Locale, allowDraft = draftLocalesAllowed()): LanguageState {
  return UI_REVIEW[locale] === 'reviewed' ? 'available' : allowDraft ? 'draft' : 'in_review'
}
const NATIVE: Record<Locale, { native: string; aliases: string[] }> = {
  'ko-easy': { native: '쉬운 한국어', aliases: ['한국어', 'korean', 'ko', 'tieng han', '韩语'] },
  vi: { native: 'Tiếng Việt', aliases: ['베트남어', 'vietnamese', 'vi', 'tieng viet', '越南语'] },
  zh: { native: '中文', aliases: ['중국어', 'chinese', 'zh', 'zhongwen', '汉语', 'tieng trung'] },
}
export const languageOptions = (allowDraft = draftLocalesAllowed()): LanguageOption<Locale>[] =>
  (['ko-easy', 'vi', 'zh'] as Locale[]).map((code) => ({ code, ...NATIVE[code], state: localeState(code, allowDraft) }))
function savedLocale(): Locale {
  try { const saved = localStorage.getItem(storageKey); if ((saved === 'ko-easy' || saved === 'vi' || saved === 'zh') && localeState(saved) !== 'in_review') return saved } catch { /* Ignore unavailable storage. */ }
  return 'ko-easy'
}
interface ContextValue { locale: Locale; setLocale: (locale: Locale) => void; t: (key: Key, values?: Record<string, string | number>) => string }
const LanguageContext = createContext<ContextValue | null>(null)
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(savedLocale)
  useEffect(() => {
    document.documentElement.lang = locale === 'ko-easy' ? 'ko' : locale
    document.title = dictionaries[locale].brand
    try { localStorage.setItem(storageKey, locale) } catch { /* Keep selection for this visit. */ }
  }, [locale])
  const t: ContextValue['t'] = (key, values) => {
    let result: string = dictionaries[locale][key]
    for (const [name, value] of Object.entries(values ?? {})) result = result.replaceAll('{' + name + '}', String(value))
    return result
  }
  return <LanguageContext.Provider value={{ locale, setLocale, t }}>{children}</LanguageContext.Provider>
}
export function useLanguage() { const context = useContext(LanguageContext); if (!context) throw new Error('LanguageProvider is missing'); return context }
export function localizedCount(count: SafeCount, t: ContextValue['t'], unit: 'short' | 'households' = 'households') {
  if (count.suppressed) return count.masked ? t('hidden') : t(unit === 'short' ? 'below' : 'belowHouseholds', { n: SUPPRESSION_THRESHOLD })
  return unit === 'short' ? count.value.toLocaleString() : t('householdValue', { n: count.value.toLocaleString() })
}
export function localizedPeople(value: number, t: ContextValue['t']) {
  const rounded = Math.round(value)
  return value <= 0 ? t('peopleValue', { n: 0 }) : rounded < SUPPRESSION_THRESHOLD ? t('belowPeople', { n: SUPPRESSION_THRESHOLD }) : t('approxPeople', { n: rounded.toLocaleString() })
}
const dayKeys: Record<Weekday, Key> = { mon: 'dayMon', tue: 'dayTue', wed: 'dayWed', thu: 'dayThu', fri: 'dayFri', sat: 'daySat', sun: 'daySun' }
const partKeys: Record<DayPart, Key> = { morning: 'morning', afternoon: 'afternoon', evening: 'evening' }
export function localizedSlot(slot: SlotKey, t: ContextValue['t']) { const [day, part] = slot.split('-') as [Weekday, DayPart]; return t(dayKeys[day]) + ' ' + t(partKeys[part]) }
export function localizedDay(day: Weekday, t: ContextValue['t']) { return t(dayKeys[day]) }
export function localizedPart(part: DayPart, t: ContextValue['t']) { return t(partKeys[part]) }
const interestKeys: Record<Interest, Key> = { experience_culture: 'interestExperience', korean_study: 'interestKorean', sports_arts: 'interestSports', career: 'interestCareer' }
export function localizedInterest(value: Interest, t: ContextValue['t']) { return t(interestKeys[value]) }
const languageKeys: Record<ScreenLanguage, Key> = { 'ko-easy': 'easyKorean', vi: 'vietnamese', zh: 'chinese' }
export function localizedLanguage(value: ScreenLanguage, t: ContextValue['t']) { return t(languageKeys[value]) }
const levelKeys: Record<KoreanLevel | 'none', Key> = { beginner: 'levelBeginner', intermediate: 'levelIntermediate', fluent: 'levelFluent', none: 'levelNone' }
export function localizedLevel(value: KoreanLevel | 'none', t: ContextValue['t']) { return t(levelKeys[value]) }
const dongNames: Record<Dong, [string, string]> = {
  중앙동: ['Jungang-dong', '中央洞'], 대원동: ['Daewon-dong', '大院洞'], 남촌동: ['Namchon-dong', '南村洞'],
  신장동: ['Sinjang-dong', '新场洞'], 세마동: ['Sema-dong', '洗马洞'], 초평동: ['Chopyeong-dong', '草坪洞'],
}
export function localizedDong(value: Dong, locale: Locale) { return locale === 'ko-easy' ? value : dongNames[value][locale === 'vi' ? 0 : 1] }
const venueNames: Record<string, [string, string]> = {
  'v-jungang-library': ['Thư viện Jungang', '中央洞图书馆'], 'v-jungang-hall': ['Hội trường Jungang', '中央洞居民中心礼堂'],
  'v-daewon-youth': ['Nhà văn hóa thanh thiếu niên Daewon', '大院洞青少年文化馆'], 'v-namchon-library': ['Thư viện nhỏ Namchon', '南村洞小图书馆'],
  'v-sinjang-gym': ['Nhà thi đấu Sinjang', '新场洞体育馆'], 'v-sinjang-family': ['Trung tâm gia đình Sinjang', '新场洞家庭中心'],
  'v-sema-culture': ['Trung tâm văn hóa Sema', '洗马洞综合文化中心'], 'v-sema-school': ['Lớp chăm sóc trẻ Sema', '洗马洞小学托管教室'],
  'v-chopyeong-center': ['Trung tâm hành chính Chopyeong', '草坪洞行政福利中心'],
}
export function localizedVenue(value: Venue, locale: Locale) { return locale === 'ko-easy' ? value.name : venueNames[value.id]?.[locale === 'vi' ? 0 : 1] ?? value.name }
