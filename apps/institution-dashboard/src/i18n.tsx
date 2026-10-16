import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { DayPart, Dong, Interest, KoreanLevel, SafeCount, ScreenLanguage, SlotKey, Venue, Weekday } from './types'
import { SUPPRESSION_THRESHOLD } from './data/assumptions'
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
