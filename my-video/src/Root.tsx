import { Composition } from "remotion";
import { PosterDemo } from "./PosterDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PosterDemo"
        component={PosterDemo}
        durationInFrames={1500}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
