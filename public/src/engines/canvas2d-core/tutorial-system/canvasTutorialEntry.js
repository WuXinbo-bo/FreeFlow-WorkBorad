import { TUTORIAL_ENTRY_ACTIONS } from "./tutorialConfig.js";

export function createCanvasTutorialEntryItems(snapshot = null) {
  const hasProgress = Boolean(snapshot?.lastStartedAt && !snapshot?.completed);
  return [
    {
      id: TUTORIAL_ENTRY_ACTIONS.START_CANVAS,
      label: "开始画布教程",
      description: "从画布基础开始，学习画布导航、创建内容与编辑。",
      disabled: false,
    },
    {
      id: TUTORIAL_ENTRY_ACTIONS.RESUME,
      label: "继续画布教程",
      description: "从上次中断的位置继续画布教程。",
      disabled: !hasProgress,
    },
    {
      id: TUTORIAL_ENTRY_ACTIONS.OPEN_BOARD,
      label: "打开教程画布",
      description: "直接进入画布教程使用的独立教程画布。",
      disabled: false,
    },
    {
      id: TUTORIAL_ENTRY_ACTIONS.RESET,
      label: "重置画布教程进度",
      description: "清空当前画布教程进度并重新开始。",
      disabled: false,
    },
  ];
}
