const assert = require("node:assert/strict");

async function main() {
  const { createHostEditProtocol } = await import(
    "../../public/src/engines/canvas2d-core/import/host/hostEditProtocol.js"
  );

  const protocol = createHostEditProtocol();

  const codeSession = protocol.beginEdit({
    id: "code-1",
    type: "codeBlock",
    text: "print(1)",
    plainText: "print(1)",
    language: "python",
    width: 220,
    height: 84,
  });
  const nextCode = protocol.applyEdit(codeSession, {
    id: "code-1",
    type: "codeBlock",
    text: "print(1)",
    plainText: "print(1)",
    language: "python",
    width: 220,
    height: 84,
  }, {
    text: "print(2)\nprint(3)",
    language: "python",
  });
  assert.equal(nextCode.text.includes("print(3)"), true);

  const taskItem = {
    id: "text-1",
    type: "text",
    text: "[ ] one\n[x] two",
    plainText: "[ ] one\n[x] two",
    html: "<ul><li>one</li><li>two</li></ul>",
    structuredImport: {
      kind: "structured-import-v1",
      listRole: "taskList",
      canonicalFragment: {
        items: [
          { kind: "taskItem", checked: false, plainText: "one", html: "one", childItems: [] },
          { kind: "taskItem", checked: true, plainText: "two", html: "two", childItems: [] },
        ],
      },
    },
  };
  const taskSession = protocol.beginEdit(taskItem, { target: "task-list" });
  const toggled = protocol.applyEdit(taskSession, taskItem, { action: "toggle", index: 0 });
  assert.equal(toggled.structuredImport.canonicalFragment.items[0].checked, true);

  const mathSession = protocol.beginEdit({
    id: "math-1",
    type: "mathBlock",
    formula: "a+b",
    displayMode: true,
  });
  const nextMath = protocol.applyEdit(mathSession, {
    id: "math-1",
    type: "mathBlock",
    formula: "a+b",
    displayMode: true,
  }, {
    formula: "x^2+y^2",
    displayMode: false,
  });
  assert.equal(nextMath.type, "mathInline");

  console.log("[host-edit-protocol] ok: 1 scenario validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
