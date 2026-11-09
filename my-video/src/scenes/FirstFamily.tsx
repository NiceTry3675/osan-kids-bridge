import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Phone } from "../components/Devices";
import { Layer, Outline, Reveal, Scroll, Shot, Tap, Typing } from "../components/Screen";
import { Note } from "../components/Text";
import { C, clamp, frames, keyed, OUT, SCREEN, src, still } from "../theme";

const introKo = still("vi-intro-ko");
const introVi = still("vi-intro-vi");
const detail = frames("vi-detail");
const ask = still("vi-ask");
const typed = still("vi-chat-typed");
const chat = frames("vi-chat");
const reported = still("vi-reported");
const { w: SW, h: SH } = SCREEN;

/** 센터 포스터(한국어 원본) */
const PosterCard: React.FC<{ to: number }> = ({ to }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [4, 22], [0, 1], { ...clamp, easing: OUT });
  const out = interpolate(frame, [to - 12, to], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 1450, top: 176, opacity: p * out, translate: `${(1 - p) * 30}px 0px` }}>
      <div
        style={{
          width: 370,
          padding: 12,
          background: C.white,
          borderRadius: 14,
          boxShadow: "0 18px 40px rgba(43,36,32,0.18)",
          rotate: "2.5deg",
        }}
      >
        <Img src={src("poster-sports-ko.jpg")} style={{ width: 346, height: 346, display: "block", borderRadius: 6 }} />
      </div>
      <div style={{ marginTop: 22, fontSize: 26, fontWeight: 700, color: C.muted, textAlign: "center", width: 370 }}>
        센터에서 받은 포스터 · 한국어
      </div>
    </div>
  );
};

/** 첫 가정(베트남어 화면): 언어 고르기 → 포스터 → AI에게 묻기 → 공고에 없는 질문을 센터에 알리기 */
export const FirstFamily: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const keys = [0, 136, 168, 198, 222, 368, 392, 470, 500, 630];
  const camera = {
    scale: keyed(frame, keys, [1, 1, 1.12, 1.12, 1, 1, 1.14, 1.14, 1.24, 1.24]),
    fx: 0.5,
    fy: keyed(frame, keys, [0.5, 0.5, 0.4, 0.4, 0.5, 0.5, 0.6, 0.62, 0.74, 0.74]),
  };
  const opacity = interpolate(frame, [0, 10, durationInFrames - 14, durationInFrames], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity }}>
      <PosterCard to={212} />
      <Phone camera={camera}>
        <Layer from={0} fade={0}>
          <Shot file={introKo.file} />
        </Layer>
        <Layer from={32} fade={6}>
          <Shot file={introVi.file} />
        </Layer>
        <Layer from={64} fade={8}>
          <Scroll entry={detail} from={76} dur={60} />
        </Layer>
        <Layer from={234} fade={7} rise={40}>
          <Shot file={ask.file} />
        </Layer>
        <Layer from={264} fade={6}>
          <Shot file="vi-chat-empty.png" />
        </Layer>
        <Typing file={typed.file} box={typed.marks.input} from={276} dur={40} cover={{ x: 0.6, y: 0.4 }} />
        <Layer from={316} fade={3}>
          <Shot file={typed.file} />
        </Layer>
        <Layer from={338} fade={0}>
          <Reveal from={338} dur={30} y0={0.17}>
            <Scroll entry={chat} from={400} dur={70} />
          </Reveal>
        </Layer>
        <Layer from={548} fade={6}>
          <Shot file={reported.file} />
        </Layer>

        <Outline from={142} to={206} box={detail.lastMarks.poster} w={SW} h={SH} />
        <Outline from={474} to={540} box={chat.lastMarks.unanswered} w={SW} h={SH} />
        <Outline from={554} to={630} box={reported.marks.sent} w={SW} h={SH} color={C.green} pad={6} />

        <Tap at={24} box={introKo.marks.vi} w={SW} h={SH} />
        <Tap at={56} box={introVi.marks.start} w={SW} h={SH} />
        <Tap at={226} box={detail.lastMarks.ask} w={SW} h={SH} />
        <Tap at={256} box={ask.marks.ai} w={SW} h={SH} />
        <Tap at={330} box={typed.marks.send} w={SW} h={SH} />
        <Tap at={540} box={chat.lastMarks.report} w={SW} h={SH} />
      </Phone>

      <Note from={36} to={76} label="언어 하나만 고르면" text={"화면 글자가\nTiếng Việt로 바뀌어요"} y={640} />
      <Note from={146} to={208} label="포스터 통번역" text={"디자인은 그대로 두고\n글만 옮겨요"} y={640} />
      <Note from={280} to={372} label="부모님이 쓴 질문" text={"아이가 8살이에요.\n저와 아이가 갈 수 있나요?\n준비할 게 있나요?"} />
      <Note from={374} to={470} label="AI 답" text={"8살이면 갈 수 있어요.\n부모님과 아이가 함께\n가는 프로그램이에요."} accent={C.green} />
      <Note from={476} to={548} label="공고에서 못 찾은 것" text={"운동회 참여 시\n개인 준비물"} />
      <Note from={554} to={630} label="Đã báo cho cơ quan" text={"센터에 알렸어요"} accent={C.green} />
    </AbsoluteFill>
  );
};
