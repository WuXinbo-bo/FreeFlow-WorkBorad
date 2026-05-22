import { TUTORIAL_ENTRY_ACTIONS } from "./tutorialConfig.js";

export function createTutorialEntryItems(snapshot = null) {
  const hasProgress = Boolean(snapshot?.lastStartedAt && !snapshot?.completed);
  const inStartMenu = String(snapshot?.centerView || "").trim() === "start-menu";
  if (inStartMenu) {
    return [
      {
        id: TUTORIAL_ENTRY_ACTIONS.START_MAIN_SHELL,
        label: "主界面教程",
        description: "先认识程序布局、主菜单和整体入口。",
        disabled: false,
      },
      {
        id: TUTORIAL_ENTRY_ACTIONS.START_CANVAS,
        label: "画布教程",
        description: "进入画布导航、创建内容与编辑排版教程。",
        disabled: false,
      },
      {
        id: TUTORIAL_ENTRY_ACTIONS.START_AI_MIRROR,
        label: "AI镜像教程",
        description: "单独学习右侧 AI 镜像工作区。",
        disabled: false,
      },
    ];
  }
  return [
    {
      id: TUTORIAL_ENTRY_ACTIONS.START_FULL,
      label: "开始完整教程",
      description: "进入教程分区选择菜单。",
      disabled: false,
    },
    {
      id: TUTORIAL_ENTRY_ACTIONS.RESUME,
      label: "继续上次进度",
      description: "从上次中断的位置继续。",
      disabled: !hasProgress,
    },
    {
      id: TUTORIAL_ENTRY_ACTIONS.OPEN_BOARD,
      label: "打开教程画布",
      description: "直接进入教程画布环境。",
      disabled: false,
    },
    {
      id: TUTORIAL_ENTRY_ACTIONS.RESET,
      label: "重置教程进度",
      description: "清空当前教程进度并重新开始。",
      disabled: false,
    },
  ];
}
