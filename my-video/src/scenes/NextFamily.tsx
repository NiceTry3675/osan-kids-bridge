import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Phone } from "../components/Devices";
import { Layer, Outline, Reveal, Scroll, Shot, Tap } from "../components/Screen";
import { Note } from "../components/Text";
import { C, clamp, frames, keyed, SCREEN, src, still } from "../theme";

const detail = frames("zh-detail");
const typed = still("zh-chat-typed");
const chat = frames("zh-chat");
const answer = chat.frames[chat.frames.length - 1];
const { w: SW, h: SH } = SCREEN;

/** 다음 가정(중국어 화면): 센터가 덧붙인 안내 → 같은 질문에 그 안내를 인용한 답 */
export const NextFamily: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const keys = [0, 76, 96, 106, 117, 188, 208, 240];
  const camera = {
    scale: keyed(frame, keys, [1, 1, 1.12, 1.12, 1, 1, 1.12, 1.12]),
    fx: 0.5,
    fy: keyed(frame, keys, [0.5, 0.5, 0.46, 0.46, 0.5, 0.5, 0.56, 0.56]),
  };
  const opacity = interpolate(frame, [0, 10, durationInFrames - 12, durationInFrames], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity }}>
      <Phone camera={camera}>
        <Layer from={0} fade={0}>
          <Scroll entry={detail} from={12} dur={60} />
        </Layer>
        <Layer from={128} fade={7} rise={30}>
          <Shot file={typed.file} />
        </Layer>
        <Layer from={158} fade={0}>
          <Reveal from={158} dur={28} y0={0.17}>
            <Img src={src(answer)} style={{ position: "absolute", width: "100%", height: "100%" }} />
          </Reveal>
        </Layer>

        <Outline from={78} to={122} box={detail.lastMarks.addenda} w={SW} h={SH} color={C.green} />
        <Outline from={190} to={240} box={chat.lastMarks.lead} w={SW} h={SH} />
        <Outline from={198} to={240} box={chat.lastMarks.cited} w={SW} h={SH} color={C.green} />

        <Tap at={121} box={detail.lastMarks.ask} w={SW} h={SH} />
        <Tap at={150} box={typed.marks.send} w={SW} h={SH} />
      </Phone>

      <Note from={80} to={126} label="센터가 덧붙인 안내" text={"참가비: 무료\n준비물: 운동하기 편한\n옷과 운동화"} accent={C.green} />
      <Note from={130} to={186} label="다음 가정이 쓴 질문" text={"운동회 참가비가 있나요?\n무엇을 가져가요?"} />
      <Note from={190} to={240} label="AI 답 · 센터 안내를 인용" text={"참가비는 무료예요.\n운동하기 편한 옷과\n운동화를 챙기면 돼요."} accent={C.green} />
    </AbsoluteFill>
  );
};
