import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { BEZEL, C, clamp, EASE, PHONE_AT, SCREEN } from "../theme";

export type PhoneCamera = { scale: number; fx: number; fy: number };
/** 기본 크기(캡처의 CSS px보다 조금 크게) */
const PHONE_SCALE = 1.08;

/** 휴대폰 틀. camera는 화면 속 (fx, fy)를 중심으로 확대한다 */
export const Phone: React.FC<{ camera: PhoneCamera; children: React.ReactNode }> = ({ camera, children }) => {
  const W = SCREEN.w + BEZEL * 2;
  const H = SCREEN.h + BEZEL * 2;
  const ox = (BEZEL + camera.fx * SCREEN.w) / W;
  const oy = (BEZEL + camera.fy * SCREEN.h) / H;
  return (
    <div
      style={{
        position: "absolute",
        left: PHONE_AT.x - W / 2,
        top: PHONE_AT.y - H / 2,
        width: W,
        height: H,
        borderRadius: 58,
        background: "#1E1B19",
        boxShadow: "0 30px 60px rgba(43,36,32,0.22), 0 6px 16px rgba(43,36,32,0.16)",
        scale: String(camera.scale * PHONE_SCALE),
        transformOrigin: `${ox * 100}% ${oy * 100}%`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: BEZEL,
          top: BEZEL,
          width: SCREEN.w,
          height: SCREEN.h,
          borderRadius: 46,
          overflow: "hidden",
          background: C.white,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** 기관 대시보드 창(브라우저 틀). camera: 내용(CSS px) 속 (fx, fy)를 창 가운데로, z배 */
export const DESK_FRAME = { x: 790, y: 140, w: 1070, h: 770, bar: 44 };
export type DeskCamera = { z: number; fx: number; fy: number };

export const Desk: React.FC<{
  camera: DeskCamera;
  contentW: number;
  contentH: number;
  children: React.ReactNode;
}> = ({ camera, contentW, contentH, children }) => {
  const VW = DESK_FRAME.w;
  const VH = DESK_FRAME.h - DESK_FRAME.bar;
  const { z } = camera;
  const place = (focus: number, size: number, view: number) => {
    const scaled = size * z;
    if (scaled <= view) return (view - scaled) / 2;
    return Math.min(0, Math.max(view - scaled, view / 2 - focus * z));
  };
  const left = place(camera.fx, contentW, VW);
  const top = place(camera.fy, contentH, VH);
  return (
    <div
      style={{
        position: "absolute",
        left: DESK_FRAME.x,
        top: DESK_FRAME.y,
        width: DESK_FRAME.w,
        height: DESK_FRAME.h,
        borderRadius: 18,
        overflow: "hidden",
        background: C.white,
        border: `1px solid ${C.line}`,
        boxShadow: "0 30px 60px rgba(43,36,32,0.18), 0 6px 16px rgba(43,36,32,0.12)",
      }}
    >
      <div
        style={{
          height: DESK_FRAME.bar,
          background: "#F3ECE3",
          borderBottom: `1px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          gap: 9,
          paddingLeft: 18,
        }}
      >
        {["#E7826B", "#EDC05B", "#7DBB7A"].map((color) => (
          <div key={color} style={{ width: 13, height: 13, borderRadius: 7, background: color }} />
        ))}
        <div
          style={{
            marginLeft: 22,
            padding: "5px 18px",
            borderRadius: 8,
            background: C.white,
            color: C.muted,
            fontSize: 17,
            fontWeight: 500,
          }}
        >
          잇다, 오산 · 운영기관 화면
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: DESK_FRAME.bar, width: VW, height: VH, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left,
            top,
            width: contentW,
            height: contentH,
            scale: String(z),
            transformOrigin: "0 0",
            background: C.white,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

/** 마우스 화살표(내용 좌표 CSS px). path: [프레임, x, y] — 확대와 관계없이 같은 크기로 보인다 */
export const Cursor: React.FC<{
  z: number;
  path: [number, number, number][];
  clicks: number[];
  from: number;
  to: number;
}> = ({ z, path, clicks, from, to }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const keys = path.map((p) => p[0]);
  const at = (i: 1 | 2) => {
    if (frame <= keys[0]) return path[0][i];
    for (let k = 1; k < path.length; k++) {
      if (frame < keys[k]) {
        if (keys[k] === keys[k - 1]) return path[k][i];
        return interpolate(frame, [keys[k - 1], keys[k]], [path[k - 1][i], path[k][i]], { ...clamp, easing: EASE });
      }
    }
    return path[path.length - 1][i];
  };
  const x = at(1);
  const y = at(2);
  const appear = interpolate(frame, [from, from + 8, to - 6, to], [0, 1, 1, 0], clamp);
  const click = clicks.map((c) => frame - c).find((t) => t >= 0 && t < 18);
  const press = click === undefined ? 1 : interpolate(click, [0, 3, 8], [1, 0.82, 1], clamp);
  return (
    <div style={{ position: "absolute", left: x, top: y, scale: String(1 / z), transformOrigin: "0 0", opacity: appear }}>
      {click !== undefined && (
        <div
          style={{
            position: "absolute",
            left: -26,
            top: -26,
            width: 52,
            height: 52,
            borderRadius: 26,
            border: `3px solid ${C.terra}`,
            opacity: 0.8 * (1 - click / 18),
            scale: String(0.5 + (click / 18) * 1.3),
          }}
        />
      )}
      <svg width="34" height="40" viewBox="0 0 17 20" style={{ position: "absolute", left: -3, top: -2, scale: String(press), transformOrigin: "3px 2px" }}>
        <path d="M2 1 L2 16 L6 12.4 L8.8 18.6 L11.4 17.4 L8.7 11.4 L14 11.4 Z" fill="#1E1B19" stroke="#FFFFFF" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
};
