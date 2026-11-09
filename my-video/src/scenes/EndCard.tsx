import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, OUT } from "../theme";

/** 마지막: 한 줄 소개. 끝은 배경색으로 사라져 처음 장면과 이어진다(반복 재생) */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = (delay: number) => interpolate(frame, [delay, delay + 18], [0, 1], { ...clamp, easing: OUT });
  const leave = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], clamp);
  const item = (delay: number): React.CSSProperties => ({
    opacity: enter(delay) * leave,
    translate: `0px ${(1 - enter(delay)) * 30}px`,
  });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", paddingBottom: 80 }}>
      <div style={{ ...item(0), fontSize: 46, fontWeight: 800, color: C.forest, marginBottom: 34 }}>잇다, 오산</div>
      <div style={{ ...item(5), fontSize: 100, fontWeight: 800, color: C.ink, lineHeight: 1.2, letterSpacing: -2 }}>
        부모님의 질문이
        <br />
        다음 프로그램이 되는 곳
      </div>
      <div style={{ ...item(12), fontSize: 32, fontWeight: 500, color: C.muted, marginTop: 44 }}>
        2026 한신 AI·SW 페스티벌 · AX 라이프케어 챌린지 · 팀 다담
      </div>
    </AbsoluteFill>
  );
};
