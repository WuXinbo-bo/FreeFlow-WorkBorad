import { createTutorialRuntime } from "../../engines/canvas2d-core/tutorial-system/tutorialRuntime.js";
import { createGlobalTutorialConfig } from "./globalTutorialConfig.js";
import { TUTORIAL_IDS } from "../../tutorial-core/tutorialTypes.js";

export function createGlobalTutorialRuntime(options = {}) {
  const runtime = createTutorialRuntime({
    ...options,
    config: options?.config || createGlobalTutorialConfig(),
    engine: null,
    bridge: null,
  });

  return {
    ...runtime,
    startMainShellTutorial() {
      return runtime.startTutorial(TUTORIAL_IDS.MAIN_SHELL);
    },
    startAiMirrorTutorial() {
      return runtime.startTutorial(TUTORIAL_IDS.AI_MIRROR);
    },
  };
}
