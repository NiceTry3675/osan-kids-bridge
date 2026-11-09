import { Easing, interpolate, staticFile } from "remotion";
import data from "../public/shots/shots.json";

/** 맥에 들어 있는 한글 글꼴(네트워크 없이 렌더). 다른 컴퓨터에서는 맑은 고딕 */
export const FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

/** 발표 덱·포스터와 같은 따뜻한 색 */
export const C = {
  ink: "#2B2420",
  muted: "#7A6B62",
  cream: "#FBF6EE",
  green: "#2E7D5B",
  forest: "#24493C",
  terra: "#D2643C",
  sun: "#F2C25B",
  mint: "#E7F1E8",
  peach: "#FBE3D3",
  line: "#E6D9CB",
  white: "#FFFFFF",
};

export const EASE = Easing.bezier(0.45, 0, 0.25, 1);
export const OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** 여러 구간 값을 이어 붙인 보간(프레임이 같으면 그 자리에서 바로 바뀐다) */
export const keyed = (frame: number, keys: number[], values: number[], easing = EASE) => {
  if (frame <= keys[0]) return values[0];
  for (let i = 1; i < keys.length; i++) {
    if (frame < keys[i]) {
      if (keys[i] === keys[i - 1]) return values[i];
      return interpolate(frame, [keys[i - 1], keys[i]], [values[i - 1], values[i]], {
        easing,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }
  return values[values.length - 1];
};

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 캡처 속 자리(그림 크기에 대한 비율) */
export type Box = { x: number; y: number; w: number; h: number };
export type Still = { file: string; width: number; height: number; marks: Record<string, Box> };
export type Frames = {
  frames: string[];
  width: number;
  height: number;
  marks: Record<string, Box>;
  lastMarks: Record<string, Box>;
};
const shots = data as unknown as Record<string, Still | Frames>;
export const still = (name: string) => shots[name] as Still;
export const frames = (name: string) => shots[name] as Frames;
export const src = (file: string) => staticFile(`shots/${file}`);

/** Studio에서 미리 받아 둘 그림 전부 */
export const ALL_FILES = [
  "poster-sports-ko.jpg",
  ...Object.values(shots).flatMap((entry) => ("frames" in entry ? entry.frames : [entry.file])),
];

/** 휴대폰 화면 크기(CSS px)와 위치 */
export const SCREEN = { w: 375, h: 812 };
export const BEZEL = 12;
export const PHONE_AT = { x: 1135, y: 488 };
