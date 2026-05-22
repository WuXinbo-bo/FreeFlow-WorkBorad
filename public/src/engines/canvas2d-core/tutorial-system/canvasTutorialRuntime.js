import { createTutorialRuntime } from "./tutorialRuntime.js";
import { createCanvasTutorialConfig } from "./canvasTutorialConfig.js";
import { TUTORIAL_IDS } from "./tutorialConfig.js";

export function createCanvasTutorialRuntime(options = {}) {
  const runtime = createTutorialRuntime({
    ...options,
    config: options?.config || createCanvasTutorialConfig(),
  });

  return {
    ...runtime,
    startCanvasTutorial() {
      return runtime.startTutorial(TUTORIAL_IDS.CANVAS);
    },
  };
}
