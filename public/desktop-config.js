window.DESKTOP_WIDGET_CONFIG = {
  badge: "Desktop Widget",
  title: "桌面透明挂件",
  summary:
    "中间区域现在作为常驻桌面的半透明工作区使用。后续你可以继续把它补成任务板、状态面板、快捷控制台或个人工作台。",
  noteTitle: "可继续改造",
  noteBody:
    "当前这块内容已经从主逻辑里拆开，后面优先修改这个配置文件和 styles.css，就能快速替换展示文案、指标卡片和快捷操作。",
  panels: [
    {
      eyebrow: "当前模型",
      title: "{{model}}",
      body: "服务来源：{{provider}}",
    },
    {
      eyebrow: "会话状态",
      title: "{{sessionCount}} 个会话",
      body: "当前状态：{{status}}",
    },
    {
      eyebrow: "上下文占用",
      title: "{{contextUsed}} / {{contextLimit}}",
      body: "剩余 {{contextRemaining}} tokens",
    },
    {
      eyebrow: "权限开关",
      title: "{{enabledPermissionCount}} 项已开启",
      body: "授权目录 {{allowedRootCount}} 个",
    },
  ],
  focusItems: [
    "把中间区域继续补成真正需要的桌面信息卡片",
    "保留右侧聊天，作为挂件边上的即时助手",
    "把右侧抽屉继续扩展为系统监控 / 权限 / 操作面板",
  ],
  quickPrompts: [
    {
      label: "整理需求",
      prompt: "帮我把这个桌面挂件下一步需要完善的功能整理成开发任务列表。",
    },
    {
      label: "分析当前结构",
      prompt: "请分析当前这个项目的桌面挂件结构，并给出后续可维护的改造建议。",
    },
    {
      label: "补系统面板",
      prompt: "请设计这个桌面挂件中间区域下一版需要增加的系统状态卡片。",
    },
  ],
};
