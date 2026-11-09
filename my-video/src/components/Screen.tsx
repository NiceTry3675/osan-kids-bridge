import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { Box, C, clamp, EASE, Frames, src } from "../theme";

const fill: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };

/** 캡처 한 장 */
export const Shot: React.FC<{ file: string }> = ({ file }) => <Img src={src(file)} style={fill} />;

/** from부터 보이는 층(뒤 층을 덮는다). fade 프레임 동안 나타나고 rise만큼 아래에서 올라온다 */
export const Layer: React.FC<{
  from: number;
  to?: number;
  fade?: number;
  rise?: number;
  children: React.ReactNode;
}> = ({ from, to = Infinity, fade = 6, rise = 0, children }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = fade > 0 ? interpolate(frame, [from, from + fade], [0, 1], { ...clamp, easing: EASE }) : 1;
  return <AbsoluteFill style={{ opacity: p, translate: `0px ${(1 - p) * rise}px` }}>{children}</AbsoluteFill>;
};

/** 실제로 조금씩 내리며 찍은 연속 장면을 from부터 dur 동안 재생(앞뒤는 첫·마지막 장면에 멈춤) */
export const Scroll: React.FC<{ entry: Frames; from: number; dur: number }> = ({ entry, from, dur }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [from, from + dur], [0, 1], { ...clamp, easing: EASE });
  const index = Math.round(p * (entry.frames.length - 1));
  return <Img src={src(entry.frames[index])} style={fill} />;
};

/** box 안만 왼쪽부터 드러낸다(입력칸에 글자를 치는 모습) */
export const Typing: React.FC<{
  file: string;
  box: Box;
  from: number;
  dur: number;
  steps?: number;
  /** 아래 그림의 안내 글(placeholder)을 가리는 칸. x·y는 box 안쪽 여백(%) */
  cover?: { x: number; y: number; color?: string };
  /** 글자가 차지하는 너비(box 너비에 대한 비율). 여기까지만 드러낸다 */
  span?: number;
}> = ({ file, box, from, dur, steps = 24, cover, span = 1 }) => {
  const frame = useCurrentFrame();
  if (frame < from) return null;
  const raw = interpolate(frame, [from, from + dur], [0, 1], clamp);
  const p = Math.round(raw * steps) / steps;
  const top = box.y * 100;
  const left = box.x * 100;
  const bottom = (1 - box.y - box.h) * 100;
  const right = (1 - box.x - box.w * (p < 1 ? p * span : 1)) * 100;
  return (
    <>
      {cover && (
        <div
          style={{
            position: "absolute",
            left: `${left + cover.x}%`,
            top: `${top + cover.y}%`,
            width: `${box.w * 100 - cover.x * 2}%`,
            height: `${box.h * 100 - cover.y * 2}%`,
            background: cover.color ?? "#FFFFFF",
            borderRadius: 8,
          }}
        />
      )}
      <AbsoluteFill style={{ clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)` }}>
        <Shot file={file} />
      </AbsoluteFill>
    </>
  );
};

/** 위(y0)에서 아래로 차례로 드러난다(답이 써지는 모습) */
export const Reveal: React.FC<{ from: number; dur: number; y0: number; children: React.ReactNode }> = ({
  from,
  dur,
  y0,
  children,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [from, from + dur], [0, 1], { ...clamp, easing: EASE });
  const line = (y0 + (1.08 - y0) * p) * 100;
  const mask = `linear-gradient(to bottom, #000 ${line - 6}%, transparent ${line}%)`;
  return <AbsoluteFill style={{ maskImage: mask, WebkitMaskImage: mask }}>{children}</AbsoluteFill>;
};

/** 손가락으로 누른 자리(휴대폰 화면 좌표, CSS px) */
export const Tap: React.FC<{ at: number; box: Box; w: number; h: number }> = ({ at, box, w, h }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -6 || t > 24) return null;
  const cx = (box.x + box.w / 2) * w;
  const cy = (box.y + box.h / 2) * h;
  const dot = interpolate(t, [-6, 0, 10, 20], [0, 0.9, 0.9, 0], clamp);
  const press = interpolate(t, [-6, 0, 4], [1.35, 0.85, 1], clamp);
  const ring = interpolate(t, [2, 22], [0, 1], { ...clamp, easing: EASE });
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx - 24,
          top: cy - 24,
          width: 48,
          height: 48,
          borderRadius: 24,
          background: "rgba(43,36,32,0.32)",
          border: "3px solid rgba(255,255,255,0.95)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
          opacity: dot,
          scale: String(press),
        }}
      />
      {t >= 2 && (
        <div
          style={{
            position: "absolute",
            left: cx - 24,
            top: cy - 24,
            width: 48,
            height: 48,
            borderRadius: 24,
            border: `3px solid ${C.terra}`,
            opacity: 0.7 * (1 - ring),
            scale: String(1 + ring * 1.6),
          }}
        />
      )}
    </>
  );
};

/** 강조 테두리(그림 좌표, CSS px). label이 있으면 위에 꼬리표 */
export const Outline: React.FC<{
  from: number;
  to?: number;
  box: Box;
  w: number;
  h: number;
  color?: string;
  pad?: number;
  stroke?: number;
  label?: string;
  labelSize?: number;
  labelBelow?: boolean;
}> = ({ from, to = Infinity, box, w, h, color = C.terra, pad = 4, stroke = 3, label, labelSize = 20, labelBelow = false }) => {
  const frame = useCurrentFrame();
  if (frame < from - 1 || frame >= to) return null;
  const p = interpolate(frame, [from, from + 8], [0, 1], { ...clamp, easing: EASE });
  const out = to === Infinity ? 1 : interpolate(frame, [to - 6, to], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: box.x * w - pad,
        top: box.y * h - pad,
        width: box.w * w + pad * 2,
        height: box.h * h + pad * 2,
        border: `${stroke}px solid ${color}`,
        borderRadius: 10 + pad,
        boxShadow: `0 0 0 ${stroke * 2}px ${color}22`,
        opacity: p * out,
        scale: String(1.04 - 0.04 * p),
      }}
    >
      {label && (
        <div
          style={{
            position: "absolute",
            right: -stroke,
            ...(labelBelow ? { top: "100%", marginTop: 6 } : { bottom: "100%", marginBottom: 6 }),
            padding: `${labelSize * 0.2}px ${labelSize * 0.55}px`,
            borderRadius: labelSize,
            background: color,
            color: C.white,
            fontSize: labelSize,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};
