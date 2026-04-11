import { createStep } from "./tutorialShared.js";

export const MAIN_SHELL_TUTORIAL_DEFINITION = Object.freeze({
  id: "main-shell",
  title: "主界面教程",
  description: "先认识左右界面、系统设置和右上角更多菜单。",
  chapterIds: ["main-shell-overview"],
});

export const MAIN_SHELL_TUTORIAL_CHAPTERS = Object.freeze([
  {
    id: "main-shell-overview",
    title: "主界面教程",
    description: "介绍左右界面、系统设置与右上角三个点菜单。",
    steps: [
      createStep(
        "main-shell-panels-intro",
        "先认识左右两个界面",
        "左侧是主工作台与基础控制区，右侧是对话与 AI 工作区。后续很多功能都会围绕这两个界面展开。",
        { targetId: "workspaceShell", placement: "center" }
      ),
      createStep(
        "main-shell-settings-trigger",
        "右上角这个键用于打开系统设置",
        "请点击右上角的系统设置交互键。打开后教程会自动进入下一步，继续介绍设置面板中的各个板块。",
        {
          targetId: "globalSettingsButton",
          placement: "left",
          completionRule: {
            type: "menu-opened",
            menuId: "settings-drawer",
          },
        }
      ),
      createStep(
        "main-shell-settings-sections",
        "系统设置分成多个设置板块",
        "这里集中放置 AI 模型调用、工作台与画布、主题设置、全局快捷键等配置。后续可以在各自模块里继续细化每一项的实际交互。",
        { targetId: "globalSettingsDrawer", placement: "left" }
      ),
      createStep(
        "main-shell-more-trigger",
        "右上角三个点用于打开全局操作菜单",
        "请点击右上角三个点交互键。打开后教程会继续说明这个二级菜单中的各个板块内容。",
        {
          targetId: "globalMoreButton",
          placement: "left",
          completionRule: {
            type: "menu-opened",
            menuId: "shell-more-menu",
          },
        }
      ),
      createStep(
        "main-shell-more-sections",
        "三个点菜单里是全局界面操作",
        "这里目前包含固定界面、全屏切换、左右换位、穿透、刷新和关闭等全局操作入口，属于整个主界面的快速控制菜单。",
        { targetId: "globalMoreMenu", placement: "left" }
      ),
      createStep(
        "main-shell-panel-corner-resizer",
        "界面左右下方的圆点控件用于整体缩放",
        "左右界面底部附近的圆点控件可以用来拉伸、放大和缩小整个界面，是调整单个界面整体尺寸的主要交互入口。",
        { targetId: "panelCornerResizer", placement: "right" }
      ),
      createStep(
        "main-shell-panel-vertical-resizer",
        "界面左右中部的长条控件可上下拖拽",
        "界面左右中部的长条控件只有在你先拉伸过对应界面后才会出现。出现后可以通过上下拖拽来调整界面的纵向显示范围，方便你继续微调界面大小和布局重心。",
        { targetId: "panelVerticalResizer", placement: "bottom" }
      ),
      createStep(
        "main-shell-restore-default-layout",
        "恢复默认界面按钮可一键回到默认布局",
        "顶部的“恢复默认界面”按钮可以把当前画布界面恢复到默认大小与默认位置。当你调整过界面布局后，可以用它快速回到初始状态。",
        { targetId: "restoreDefaultButton", placement: "top" }
      ),
      createStep(
        "main-shell-click-through-shortcut",
        "Ctrl + Shift + X 用于切换界面穿透模式",
        "全局快捷键 Ctrl + Shift + X 可以开启或关闭界面穿透模式，方便你在需要时更顺畅地调用助手，同时快速在正常交互与穿透状态之间切换。",
        { targetId: "viewport", placement: "center" }
      ),
      createStep(
        "main-shell-panel-orbs",
        "红、黄、绿三个圆点控件用于快速控制界面",
        "左右两个界面顶部的红、黄、绿三个圆点控件分别对应关闭界面、拖动/换位界面，以及恢复界面默认位置等快速操作，是主界面布局调整时最常用的一组交互键。",
        { targetId: "panelOrbControls", placement: "right" }
      ),
    ],
  },
]);
