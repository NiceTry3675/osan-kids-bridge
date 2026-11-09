import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Cursor, Desk } from "../components/Devices";
import { Layer, Outline, Shot, Typing } from "../components/Screen";
import { Box, C, clamp, keyed, still } from "../theme";

const center = (box: Box, w: number, h: number): [number, number] => [(box.x + box.w / 2) * w, (box.y + box.h / 2) * h];

const useStageFade = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return interpolate(frame, [0, 10, durationInFrames - 14, durationInFrames], [0, 1, 1, 0], clamp);
};

const questions = still("desk-questions");
const blank = still("desk-blank");
const filled = still("desk-filled");
const append = still("desk-append");
const answered = still("desk-answered");
const DW = 1440;
const DH = 1000;
const FIT = 1070 / DW;

/** 센터 담당자: 들어온 질문 → 보완 초안 → 빈칸 채우기 → 공고에 덧붙이기 */
export const DeskFill: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = useStageFade();
  const [listX, listY] = center(questions.marks.list, DW, DH);
  const [cardX, cardY] = center(blank.marks.card, DW, DH);
  const [improveX, improveY] = center(questions.marks.improve, DW, DH);
  const [blankX, blankY] = center(blank.marks.blank, DW, DH);
  const [appendX, appendY] = center(append.marks.append, DW, DH);
  const keys = [0, 18, 48, 88, 112, 130, 130, 232, 240, 240, 276, 276, 330];
  const camera = {
    z: keyed(frame, keys, [FIT, FIT, 1.3, 1.3, 1.2, 1.2, 1.32, 1.32, 1.32, 1.3, 1.3, 1.3, 1.3]),
    fx: keyed(frame, keys, [720, 720, listX, listX, listX - 40, listX - 40, cardX, cardX, cardX, appendX - 200, appendX - 200, listX, listX]),
    fy: keyed(frame, keys, [500, 500, listY, listY, improveY - 140, improveY - 140, cardY, cardY, cardY, appendY - 160, appendY - 160, listY, listY]),
  };
  return (
    <AbsoluteFill style={{ opacity }}>
      <Desk camera={camera} contentW={DW} contentH={DH}>
        <Layer from={0} fade={0}>
          <Shot file={questions.file} />
        </Layer>
        <Layer from={130} fade={0}>
          <Shot file={blank.file} />
        </Layer>
        <Typing file={filled.file} box={filled.marks.blank} from={166} dur={38} steps={14} span={0.3} cover={{ x: 0.3, y: 0.6 }} />
        <Typing file={filled.file} box={filled.marks.preview} from={206} dur={12} steps={6} span={0.5} />
        <Layer from={222} fade={3}>
          <Shot file={filled.file} />
        </Layer>
        <Layer from={240} fade={0}>
          <Shot file={append.file} />
        </Layer>
        <Layer from={276} fade={0}>
          <Shot file={answered.file} />
        </Layer>

        <Outline from={54} to={110} box={questions.marks.newq} w={DW} h={DH} label="방금 들어온 질문" labelSize={22} />
        <Outline from={138} to={166} box={blank.marks.blank} w={DW} h={DH} label="담당자가 채울 빈칸" labelSize={22} />
        <Outline from={208} to={240} box={filled.marks.preview} w={DW} h={DH} color={C.green} label="공고에 덧붙일 문장" labelSize={22} />
        <Outline from={284} to={330} box={answered.marks.newq} w={DW} h={DH} color={C.green} />

        <Cursor
          z={camera.z}
          from={70}
          to={276}
          path={[
            [70, listX + 260, listY + 40],
            [96, listX + 260, listY + 40],
            [118, improveX, improveY],
            [130, improveX, improveY],
            [130, blankX + 260, blankY + 70],
            [156, blankX - 100, blankY],
            [232, blankX - 100, blankY],
            [240, appendX - 260, appendY - 90],
            [262, appendX, appendY],
          ]}
          clicks={[120, 158, 264]}
        />
      </Desk>
    </AbsoluteFill>
  );
};

const planStart = still("desk-plan-start");
const plan = still("desk-plan");
const PW = 1440;
const PH = plan.height;

/** 센터 담당자: 이름 없이 모인 조건 통계 → 편성안 */
export const DeskPlan: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = useStageFade();
  const [createX, createY] = center(planStart.marks.create, PW, planStart.height);
  const [heatX, heatY] = center(plan.marks.heatmap, PW, PH);
  const [metricX, metricY] = center(plan.marks.metric, PW, PH);
  const keys = [0, 14, 36, 52, 52, 98, 124, 210];
  const camera = {
    z: keyed(frame, keys, [FIT, FIT, 1.35, 1.35, 1.3, 1.3, 1.4, 1.4]),
    fx: keyed(frame, keys, [720, 720, createX - 60, createX - 60, heatX + 40, heatX + 40, metricX, metricX]),
    fy: keyed(frame, keys, [500, 500, createY + 60, createY + 60, heatY + 60, heatY + 60, metricY + 60, metricY + 60]),
  };
  return (
    <AbsoluteFill style={{ opacity }}>
      <Desk camera={camera} contentW={PW} contentH={PH}>
        <Layer from={0} fade={0}>
          <div style={{ position: "absolute", left: 0, top: 0, width: PW, height: planStart.height }}>
            <Shot file={planStart.file} />
          </div>
        </Layer>
        <Layer from={52} fade={0}>
          <Shot file={plan.file} />
        </Layer>
        <Outline from={58} to={110} box={plan.marks.heatmap} w={PW} h={PH} label="이름 없이 모인 시간 조건" labelSize={22} labelBelow />
        <Outline from={128} to={210} box={plan.marks.metric} w={PW} h={PH} color={C.green} />
        <Cursor
          z={camera.z}
          from={10}
          to={52}
          path={[
            [10, createX + 220, createY + 180],
            [36, createX, createY],
          ]}
          clicks={[42]}
        />
      </Desk>
    </AbsoluteFill>
  );
};
