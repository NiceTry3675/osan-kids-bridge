import React from "react";
import { interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { C, clamp } from "../theme";

/** 왼쪽 위 서비스 이름. 끝 장면(hideFrom~)에서는 사라진다 */
export const Brand: React.FC<{ hideFrom: number }> = ({ hideFrom }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, hideFrom - 8, hideFrom], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 104, top: 64, display: "flex", alignItems: "baseline", gap: 22, opacity }}>
      <div style={{ fontSize: 38, fontWeight: 800, color: C.forest, letterSpacing: -0.5 }}>잇다, 오산</div>
      <div style={{ fontSize: 26, fontWeight: 500, color: C.muted }}>부모님의 질문이 다음 프로그램이 되는 곳</div>
    </div>
  );
};

/** 아래쪽 순환 단계 표시. stops[i]부터 i번째 단계가 켜지고, allFrom부터는 전부 켜진다 */
export const Tracker: React.FC<{ labels: string[]; stops: number[]; allFrom: number; end: number }> = ({
  labels,
  stops,
  allFrom,
  end,
}) => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [0, 12, end - 12, end], [0, 1, 1, 0], clamp);
  return (
    <>
    {/* 확대된 휴대폰이 아래 단계 표시와 겹치지 않게, 아래쪽을 배경색으로 덮는 띠 */}
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 930,
        bottom: 0,
        background: `linear-gradient(to bottom, ${C.cream}00 0px, ${C.cream} 34px)`,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 974,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
        opacity: appear,
      }}
    >
      {labels.map((label, i) => {
        const start = stops[i];
        const stop = i + 1 < stops.length ? stops[i + 1] : allFrom;
        const on = Math.max(
          interpolate(frame, [start, start + 8, stop - 1, stop + 7], [0, 1, 1, 0], clamp),
          interpolate(frame, [allFrom + i * 4, allFrom + i * 4 + 8], [0, 1], clamp),
        );
        const done = frame >= stop ? 1 : 0;
        const background = interpolateColors(on, [0, 1], [done ? C.mint : "rgba(0,0,0,0)", C.green]);
        const color = interpolateColors(on, [0, 1], [done ? C.forest : C.muted, C.white]);
        return (
          <React.Fragment key={label}>
            {i > 0 && <div style={{ fontSize: 24, color: C.muted, opacity: 0.6 }}>→</div>}
            <div
              style={{
                padding: "9px 22px",
                borderRadius: 30,
                fontSize: 25,
                fontWeight: 700,
                background,
                color,
                border: `2px solid ${interpolateColors(on, [0, 1], [done ? C.mint : C.line, C.green])}`,
                scale: String(1 + on * 0.06),
              }}
            >
              {label}
            </div>
          </React.Fragment>
        );
      })}
    </div>
    </>
  );
};
