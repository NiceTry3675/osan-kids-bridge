import React, { useEffect } from "react";
import { AbsoluteFill, getRemotionEnvironment, prefetch, Sequence, Track } from "remotion";
import { Brand, Tracker } from "./components/Chrome";
import { Caption } from "./components/Text";
import { DeskFill, DeskPlan } from "./scenes/DeskScenes";
import { EndCard } from "./scenes/EndCard";
import { FirstFamily } from "./scenes/FirstFamily";
import { NextFamily } from "./scenes/NextFamily";
import { ALL_FILES, C, FONT, src } from "./theme";

/**
 * 포스터 발표 옆 노트북에서 반복 재생할 무음 시연영상(50초, 30fps).
 * 부모님 휴대폰 → 센터 화면 → 다음 가정 휴대폰 → 센터 편성으로 질문 하나가 한 바퀴 도는 모습.
 * 화면은 presentation/build/capture-video.js로 찍은 실제 앱 캡처(public/shots).
 */
export const PosterDemo: React.FC = () => {
  useEffect(() => {
    if (!getRemotionEnvironment().isStudio) return;
    const handles = ALL_FILES.map((file) => prefetch(src(file), { method: "blob-url" }));
    return () => handles.forEach((handle) => handle.free());
  }, []);

  return (
    <AbsoluteFill style={{ backgroundColor: C.cream, fontFamily: FONT }}>
      <Track name="Stage">
        <Sequence name="첫 가정 휴대폰" durationInFrames={630}>
          <FirstFamily />
        </Sequence>
        <Sequence name="센터 · 공고 보완" from={630} durationInFrames={330}>
          <DeskFill />
        </Sequence>
        <Sequence name="다음 가정 휴대폰" from={960} durationInFrames={240}>
          <NextFamily />
        </Sequence>
        <Sequence name="센터 · 편성" from={1200} durationInFrames={210}>
          <DeskPlan />
        </Sequence>
        <Sequence name="끝 장면" from={1410} durationInFrames={90}>
          <EndCard />
        </Sequence>
      </Track>
      <Track name="Captions">
        <Sequence name="① 읽기" durationInFrames={210}>
          <Caption kicker="부모님 휴대폰" title={"한국어 공고를\n편한 언어로"} sub={"언어를 고르면 화면 글자와\n포스터 글이 함께 바뀌어요"} />
        </Sequence>
        <Sequence name="② 묻기" from={210} durationInFrames={300}>
          <Caption kicker="부모님 휴대폰" title={"궁금한 건\nAI에게 바로 물어요"} sub={"공고에 적힌 내용으로 답하고\n없는 건 따로 표시해요"} />
        </Sequence>
        <Sequence name="알리기" from={510} durationInFrames={120}>
          <Caption kicker="부모님 휴대폰" title={"공고에 없는 건\n센터에 알려요"} sub={"이름·연락처 없이\n질문만 센터로 가요"} />
        </Sequence>
        <Sequence name="③ 빈칸 채우기" from={630} durationInFrames={330}>
          <Caption kicker="센터 담당자 화면" title={"센터는\n빈칸만 채워요"} sub={"AI가 덧붙일 문장을 쓰고\n센터만 아는 값은 담당자가"} />
        </Sequence>
        <Sequence name="다음 가정" from={960} durationInFrames={240}>
          <Caption kicker="다른 가정의 휴대폰" title={"다음 가정은\n바로 답을 받아요"} sub={"센터가 덧붙인 안내가\n공고와 상담 답에 들어가요"} />
        </Sequence>
        <Sequence name="④ 편성" from={1200} durationInFrames={210}>
          <Caption
            kicker="센터 담당자 화면"
            title={"모인 조건으로\n다음 반을 짜요"}
            sub={"이름 없이 모인 시간·동네 조건과\n못 찾은 질문을 함께 봐요"}
            stat={{ label: "시간·동네가 맞는 가정", value: "23% → 39%", at: 132 }}
          />
        </Sequence>
      </Track>
      <Brand hideFrom={1410} />
      <Tracker
        labels={["① 편한 언어로 읽기", "② AI에게 묻기", "센터에 알리기", "③ 빈칸 채우기", "다음 가정의 답", "④ 다음 프로그램"]}
        stops={[0, 210, 510, 630, 960, 1200]}
        allFrom={1410}
        end={1500}
      />
    </AbsoluteFill>
  );
};
