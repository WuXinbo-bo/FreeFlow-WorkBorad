import { createStep } from "./tutorialShared.js";

export const AI_MIRROR_TUTORIAL_DEFINITION = Object.freeze({
  id: "ai-mirror",
  title: "AI 镜像教程",
  description: "单独介绍 AI 镜像工作区与嵌入显示。",
  chapterIds: ["ai-mirror"],
});

export const AI_MIRROR_TUTORIAL_CHAPTERS = Object.freeze([
  {
    id: "ai-mirror",
    title: "AI 镜像",
    description: "重点介绍如何建立映射、开启嵌入，以及嵌入后的工作方式。",
    steps: [
      createStep(
        "ai-mirror-intro",
        "AI 镜像位于右侧工作区",
        "AI 镜像是右侧界面中的独立工作区，用来把外部 AI 页面或目标窗口映射进 FreeFlow 内部，再结合嵌入方式直接在这里查看和操作。",
        { targetId: "viewport", placement: "center" }
      ),
      createStep(
        "ai-mirror-tab",
        "先切换到右侧的 AI 镜像工作区",
        "点击右侧顶部的“AI 镜像”切换键，就会进入 AI 镜像对应的工作区。后续所有映射与嵌入操作，都从这个入口开始。",
        { targetId: "rightPanelScreenTab", placement: "bottom" }
      ),
      createStep(
        "ai-mirror-toolbar-trigger",
        "映射控制是建立映射的主入口",
        "请点击顶部的“映射控制”按钮。打开后，教程会继续介绍如何选择映射目标和开启嵌入。",
        {
          targetId: "screenSourceHeaderTrigger",
          placement: "bottom",
          completionRule: {
            type: "menu-opened",
            menuId: "screen-source-header-menu",
          },
        }
      ),
      createStep(
        "ai-mirror-target-select",
        "先选择要映射的目标",
        "这里会列出当前可用于 AI 镜像的目标。开始前先在“映射目标”下拉框中选中你要映射的网页或窗口，这是后续嵌入的基础。",
        { targetId: "screenSourceTargetSelect", placement: "bottom" }
      ),
      createStep(
        "ai-mirror-display-settings",
        "显示设置集中管理渲染与画面适配",
        "需要调整兼容性或画面铺放方式时，展开“显示设置”即可选择渲染方式和适配模式；通常保持默认设置即可。",
        { targetId: "screenSourceDisplaySettings", placement: "left" }
      ),
      createStep(
        "ai-mirror-embed-toggle",
        "开启嵌入后，映射画面会进入工作区内部",
        "确认目标和模式后，点击“开始嵌入”即可把目标画面嵌入到右侧 AI 镜像工作区。后续如果已经在运行，这个按钮也会承担停止或重新建立嵌入的作用。",
        { targetId: "screenSourceEmbedToggle", placement: "bottom" }
      ),
      createStep(
        "ai-mirror-preview",
        "嵌入后的画面会显示在这个预览区域",
        "嵌入成功后，画面会直接出现在这个预览区域里。你可以把这里理解成 AI 镜像的主显示区，当前映射状态、嵌入结果和后续预览都在这里完成。",
        { targetId: "screenSourcePreviewShell", placement: "left" }
      ),
      createStep(
        "ai-mirror-preview-resize",
        "嵌入画面支持后续继续调节显示范围",
        "预览区外围的控制框用于后续调节嵌入画面的显示范围。也就是说，映射并不是只负责显示，嵌入后你还可以继续围绕这个区域做尺寸与边界调整。",
        { targetId: "screenSourceShellOutline", placement: "left" }
      ),
      createStep(
        "ai-mirror-status",
        "状态提示用于确认当前映射是否正常工作",
        "映射控制面板里的状态标签会告诉你当前是否已经开始映射、是否已经嵌入，以及当前目标是否处于正常工作状态。排查问题时，先看这里最直接。",
        { targetId: "screenSourceStatusPill", placement: "left" }
      ),
    ],
  },
]);
