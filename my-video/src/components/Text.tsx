import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, OUT } from "../theme";

const lines = (text: string) =>
  text.split("\n").map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </React.Fragment>
  ));

/** 장면 왼쪽의 큰 글. 들어올 때 아래에서 올라오고 끝날 때 사라진다 */
export const Caption: React.FC<{
  kicker: string;
  title: string;
  sub: string;
  stat?: { label: string; value: string; at: number };
}> = ({ kicker, title, sub, stat }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = (delay: number) => interpolate(frame, [delay, delay + 16], [0, 1], { ...clamp, easing: OUT });
  const leave = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], clamp);
  const item = (delay: number): React.CSSProperties => ({
    opacity: enter(delay) * leave,
    translate: `0px ${(1 - enter(delay)) * 28}px`,
  });
  const statIn = stat ? interpolate(frame, [stat.at, stat.at + 14], [0, 1], { ...clamp, easing: OUT }) : 0;
  return (
    <div style={{ position: "absolute", left: 104, top: 236, width: 720 }}>
      <div style={{ ...item(0), fontSize: 32, fontWeight: 700, color: C.terra, marginBottom: 22 }}>{kicker}</div>
      <div style={{ ...item(3), fontSize: 82, fontWeight: 800, color: C.ink, lineHeight: 1.2, letterSpacing: -1.5 }}>
        {lines(title)}
      </div>
      <div style={{ ...item(9), fontSize: 38, fontWeight: 500, color: C.muted, lineHeight: 1.42, marginTop: 30 }}>
        {lines(sub)}
      </div>
      {stat && (
        <div style={{ marginTop: 40, opacity: statIn * leave, translate: `0px ${(1 - statIn) * 24}px` }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: C.muted }}>{stat.label}</div>
          <div style={{ fontSize: 92, fontWeight: 800, color: C.green, letterSpacing: -2, lineHeight: 1.1 }}>{stat.value}</div>
        </div>
      )}
    </div>
  );
};

/** 화면 속 외국어·작은 글의 뜻을 크게 풀어 주는 쪽지(휴대폰 오른쪽) */
export const Note: React.FC<{
  from: number;
  to: number;
  label: string;
  text: string;
  x?: number;
  y?: number;
  w?: number;
  accent?: string;
}> = ({ from, to, label, text, x = 1430, y = 330, w = 440, accent = C.terra }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = interpolate(frame, [from, from + 12], [0, 1], { ...clamp, easing: OUT });
  const out = interpolate(frame, [to - 8, to], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        padding: "22px 26px 24px",
        borderRadius: 22,
        background: C.white,
        borderLeft: `10px solid ${accent}`,
        boxShadow: "0 16px 36px rgba(43,36,32,0.14)",
        opacity: p * out,
        translate: `${(1 - p) * -24}px 0px`,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: accent, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 33, fontWeight: 700, color: C.ink, lineHeight: 1.4, whiteSpace: "nowrap" }}>{lines(text)}</div>
    </div>
  );
};
