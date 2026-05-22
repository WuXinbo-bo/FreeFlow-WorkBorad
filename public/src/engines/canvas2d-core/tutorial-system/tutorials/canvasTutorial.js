import { createStep } from "./tutorialShared.js";

export const CANVAS_TUTORIAL_DEFINITION = Object.freeze({
  id: "canvas",
  title: "画布教程",
  description: "FreeFlow 自研画布的基础操作指南。",
  chapterIds: ["canvas-basics"],
});

export const CANVAS_TUTORIAL_CHAPTERS = Object.freeze([
  {
    id: "canvas-basics",
    title: "画布基础操作",
    description: "先认识画布区域、控制区和基础操作手势。",
    steps: [
      createStep(
        "canvas-stage-overview",
        "中央区域是画布的核心操作空间",
        "这里是你进行浏览、定位和操作的主要区域。后续所有元素都会摆放在这片画布里，但当前这一段教程先只帮助你熟悉画布本身的基础操作方式。",
        { targetId: "canvasStage", placement: "right" }
      ),
      createStep(
        "canvas-board-info",
        "左上角会显示当前画布名称和基础信息",
        "这个信息面板会展示当前画布名称、品牌标识，以及自动保存状态和最近一次保存时间。需要确认你当前打开的是哪一张画布时，先看这里就可以。",
        { targetId: "boardInfo", placement: "bottom" }
      ),
      createStep(
        "canvas-top-right-controls",
        "右上角是画布综合控制区",
        "这里集中放置了画布常用控制入口，包括工具切换、截图入口以及画布管理菜单。日常使用时，大部分和画布操作相关的快捷入口都会从这一块进入。",
        { targetId: "topRightControls", placement: "left" }
      ),
      createStep(
        "canvas-view-controls",
        "右下角是视图控制区",
        "这里负责画布视角调整。你可以在这里查看当前缩放状态，并执行缩放、恢复默认视角或快速回到合适观察位置等操作。",
        { targetId: "zoomPanel", placement: "left" }
      ),
      createStep(
        "canvas-management-menu",
        "右上角菜单按钮用于打开画布管理菜单",
        "点击这里会展开画布管理菜单。菜单里集中放置了教程入口、画布文件、新建与保存、画布位置、导出位置、自动保存以及其他画布相关设置，是管理当前画布的主入口。",
        {
          targetId: "menuButton",
          placement: "left",
          completionRule: {
            type: "menu-opened",
            menuId: "main-menu",
          },
        }
      ),
      createStep(
        "canvas-left-click-logic",
        "左键负责基础选中和框选",
        "在画布里单击左键，会执行普通选中；如果按住左键后继续拖动，就会拉出框选区域，用来一次选中多个画布元素。这是画布里最常用的一组基础选择操作。",
        { targetId: "canvasStage", placement: "right" }
      ),
      createStep(
        "canvas-right-click-logic",
        "右键负责菜单呼出和画布拖动",
        "在画布空白区域单击右键，会打开画布二级操作菜单；如果按住右键后直接拖动，则会进入移动画布的状态，用来快速平移当前视角。",
        { targetId: "canvasStage", placement: "right" }
      ),
      createStep(
        "canvas-middle-click-logic",
        "按住鼠标中键拖动，也可以移动画布",
        "如果你更习惯使用鼠标中键，可以按住中键后直接拖动画布。这个动作同样用于平移画布视角，适合在更大范围内容之间快速浏览。",
        { targetId: "canvasStage", placement: "right" }
      ),
      createStep(
        "canvas-shortcut-zoom",
        "Ctrl 加滚轮可以缩放画布视角",
        "按住 Ctrl 键后滚动鼠标滚轮，画布会按照滚轮方向放大或缩小当前视角。这是调整观察距离最快的一种方式，适合在整体查看和局部查看之间快速切换。",
        {
          targetId: "zoomPanel",
          placement: "left",
          completionRule: {
            type: "view-scale-changed",
          },
        }
      ),
    ],
  },
]);
