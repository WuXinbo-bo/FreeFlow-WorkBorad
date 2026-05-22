"use strict";

async function main() {
  const bridgeModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/text/textElementBridge.js"
  );
  const interactionModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/list/taskListInteraction.js"
  );

  const { buildStructuredTextElementFromRenderOperation } = bridgeModule;
  const {
    isTaskListTextElement,
    getTaskListItems,
    toggleTaskListItemChecked,
    setTaskListItemChecked,
    setAllTaskListItemsChecked,
  } = interactionModule;

  const element = buildStructuredTextElementFromRenderOperation({
    type: "render-list-block",
    sourceNodeType: "taskList",
    listRole: "taskList",
    element: {
      id: "text-task-1",
      type: "text",
      text: "[ ] Item A\n[x] Item B",
      plainText: "[ ] Item A\n[x] Item B",
      html: "<ul><li>☐ Item A</li><li>☑ Item B</li></ul>",
      title: "任务列表",
      fontSize: 20,
      color: "#0f172a",
      wrapMode: "manual",
      textResizeMode: "auto-width",
      width: 220,
      height: 80,
      x: 0,
      y: 0,
      locked: false,
    },
    structure: {
      listRole: "taskList",
      items: [
        { kind: "taskItem", checked: false, level: 0, plainText: "Item A", html: "Item A", childItems: [] },
        { kind: "taskItem", checked: true, level: 0, plainText: "Item B", html: "Item B", childItems: [] },
      ],
    },
    meta: {
      descriptorId: "descriptor-task-1",
      parserId: "markdown-parser",
    },
  });

  assert(isTaskListTextElement(element) === true, "task list text element detection mismatch");
  assert(getTaskListItems(element).length === 2, "task list item count mismatch");

  const toggled = toggleTaskListItemChecked(element, 0);
  assert(toggled.plainText.includes("[x] Item A"), "toggle first item checked mismatch");

  const unchecked = setTaskListItemChecked(toggled, 1, false);
  assert(unchecked.plainText.includes("[ ] Item B"), "set item unchecked mismatch");

  const checkedAll = setAllTaskListItemsChecked(unchecked, true);
  assert(checkedAll.plainText.includes("[x] Item A"), "set all checked first mismatch");
  assert(checkedAll.plainText.includes("[x] Item B"), "set all checked second mismatch");
  assert(checkedAll.html.includes("☑"), "task list html checked marker mismatch");

  console.log("[task-list-interaction] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[task-list-interaction] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
