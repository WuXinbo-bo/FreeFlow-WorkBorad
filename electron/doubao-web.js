const { BrowserWindow, shell } = require("electron");

const DOUBAO_URL = "https://www.doubao.com/chat/";
const DOUBAO_PARTITION = "persist:ai-worker-doubao-web";

let doubaoWindow = null;
let activeRunId = 0;

function createDoubaoWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 1080,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    title: "豆包网页版",
    backgroundColor: "#111111",
    webPreferences: {
      partition: DOUBAO_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  window.removeMenu();
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  window.webContents.on("console-message", (_event, levelOrDetails, messageArg) => {
    let message = "";

    if (levelOrDetails && typeof levelOrDetails === "object") {
      message = String(levelOrDetails.message || "");
    } else if (typeof messageArg === "string") {
      message = messageArg;
    }

    if (message.startsWith("[doubao-page]")) {
      console.log(message);
    }
  });

  window.on("closed", () => {
    if (doubaoWindow === window) {
      doubaoWindow = null;
    }
  });

  return window;
}

async function ensureDoubaoWindow({ reveal = false } = {}) {
  if (!doubaoWindow || doubaoWindow.isDestroyed()) {
    console.log("[doubao-web] create hidden browser window");
    doubaoWindow = createDoubaoWindow();
  }

  const currentUrl = doubaoWindow.webContents.getURL();
  if (!currentUrl || !/^https:\/\/www\.doubao\.com\//i.test(currentUrl)) {
    console.log("[doubao-web] load target url");
    await withTimeout(
      doubaoWindow.loadURL(DOUBAO_URL),
      45000,
      "豆包网页加载超时：loadURL 未在预期时间内完成。"
    );
    console.log("[doubao-web] loadURL resolved");
  }

  if (doubaoWindow.isMinimized()) {
    doubaoWindow.restore();
  }

  if (reveal) {
    console.log("[doubao-web] reveal browser window");
    doubaoWindow.show();
    doubaoWindow.focus();
  }

  console.log("[doubao-web] wait for DOM ready");
  await doubaoWindow.webContents
    .executeJavaScript(
      `
        new Promise((resolve) => {
          if (document.readyState === "complete" || document.readyState === "interactive") {
            resolve(true);
            return;
          }
          window.addEventListener("DOMContentLoaded", () => resolve(true), { once: true });
          setTimeout(() => resolve(true), 5000);
        });
      `,
      true
    )
    .catch(() => {});
  console.log("[doubao-web] DOM ready resolved");

  return doubaoWindow;
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function buildAutomationScript(prompt, runId, timeoutMs) {
  const safePrompt = JSON.stringify(String(prompt || ""));
  return `
    (async () => {
      const prompt = ${safePrompt};
      const runId = ${Number(runId) || 0};
      const timeoutMs = ${Number(timeoutMs) || 90000};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const debug = (...parts) => console.log("[doubao-page]", ...parts);
      const trace = [];
      const pushTrace = (step, detail = "") => {
        trace.push(detail ? step + ": " + detail : step);
      };
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const cleanText = (value) =>
        String(value || "")
          .replace(/\\u00a0/g, " ")
          .replace(/\\s+/g, " ")
          .trim();
      const ignoredText = new Set([
        "发送",
        "上传",
        "搜索",
        "深度思考",
        "重新生成",
        "新对话",
        "登录",
        "注册"
      ]);
      const ignoredPattern = /(下载电脑版|下载客户端|打开app|打开APP|扫码下载|立即下载|登录豆包|注册豆包|豆包电脑版|登录后继续|继续使用)/i;

      const shouldAbort = () => window.__AI_WORKER_DOUBAO_ABORT_RUN === runId;
      const buildFailure = (stage, error, extra = {}) => ({
        ok: false,
        stage,
        error,
        trace,
        ...extra,
      });
      const hasGenerationIndicator = () => {
        const candidates = [...document.querySelectorAll("button, [role='button']")];
        return candidates.some((element) => {
          if (!(element instanceof HTMLElement) || !visible(element)) return false;
          const text = cleanText(
            element.innerText ||
              element.textContent ||
              element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              ""
          ).toLowerCase();
          return /停止|stop|中止|终止/.test(text);
        });
      };

      const collectMessages = () => {
        const containers = [
          ...document.querySelectorAll("main, [role='main'], [class*='chat'], [class*='conversation'], [class*='message']")
        ];
        const roots = containers.length ? containers : [document.body];
        const candidates = [];
        const seen = new Set();
        const selector = [
          "article",
          "[role='listitem']",
          "[class*='message']",
          "[class*='answer']",
          "[class*='assistant']",
          "[class*='markdown']",
          "[data-testid*='message']",
          "[data-testid*='answer']"
        ].join(",");

        for (const root of roots) {
          for (const node of root.querySelectorAll(selector)) {
            if (!(node instanceof HTMLElement) || !visible(node)) continue;
            if (node.closest("header, nav, aside, footer, form, button, textarea")) continue;
            const text = cleanText(node.innerText || node.textContent || "");
            if (!text || text.length < 2 || text.length > 12000) continue;
            if (ignoredText.has(text)) continue;
            if (ignoredPattern.test(text)) continue;
            if (seen.has(text)) continue;
            seen.add(text);
            candidates.push(text);
          }
        }

        if (!candidates.length) {
          const fallbackNodes = [...document.querySelectorAll("[class*='markdown'] p, [class*='answer'] p, article p")];
          for (const node of fallbackNodes) {
            if (!(node instanceof HTMLElement) || !visible(node)) continue;
            if (node.closest("header, nav, aside, footer, form, button, textarea")) continue;
            const text = cleanText(node.innerText || node.textContent || "");
            if (!text || text.length < 2 || text.length > 12000) continue;
            if (ignoredText.has(text) || ignoredPattern.test(text) || seen.has(text)) continue;
            seen.add(text);
            candidates.push(text);
          }
        }

        return candidates;
      };

      const findInput = () => {
        const selectors = [
          "textarea",
          "[contenteditable='true']",
          "[role='textbox']",
          "div.ProseMirror"
        ];

        for (const selector of selectors) {
          const elements = [...document.querySelectorAll(selector)];
          for (const element of elements) {
            if (!visible(element)) continue;
            const aria = cleanText(element.getAttribute("aria-label") || "");
            const placeholder = cleanText(element.getAttribute("placeholder") || "");
            const hint = (aria + " " + placeholder).toLowerCase();
            if (hint.includes("搜索")) continue;
            return element;
          }
        }

        return null;
      };

      const getButtonScore = (element) => {
        const text = cleanText(
          element.innerText ||
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            ""
        ).toLowerCase();
        let score = 0;
        if (/发送|send|submit|提问/.test(text)) score += 12;
        if (/停止|stop|关闭/.test(text)) score -= 12;
        if (text) score += 2;
        if (element.querySelector("svg")) score += 1;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 64 && rect.height <= 64) score += 1;
        if (element.getAttribute("type") === "submit") score += 4;
        return score;
      };

      const findSendButton = (inputElement) => {
        const candidateRoots = [];
        const nearestForm = inputElement.closest("form");
        const nearestComposer =
          inputElement.closest("[class*='input'], [class*='editor'], [class*='composer'], [class*='footer'], [class*='send']") ||
          inputElement.parentElement;

        if (nearestForm) candidateRoots.push(nearestForm);
        if (nearestComposer && !candidateRoots.includes(nearestComposer)) candidateRoots.push(nearestComposer);
        if (!candidateRoots.includes(document.body)) candidateRoots.push(document.body);

        const candidates = [];

        for (const root of candidateRoots) {
          for (const element of root.querySelectorAll("button, [role='button']")) {
            if (!(element instanceof HTMLElement) || !visible(element)) continue;
            const disabled =
              element.hasAttribute("disabled") ||
              element.getAttribute("aria-disabled") === "true" ||
              element.classList.contains("disabled");
            if (disabled) continue;

            const score = getButtonScore(element);
            if (score < 6) continue;
            candidates.push({ element, score });
          }
        }

        candidates.sort((a, b) => b.score - a.score);
        const matched = candidates[0]?.element || null;
        if (matched) {
          debug(
            "send-button-found",
            "score=",
            candidates[0].score,
            "text=",
            cleanText(
              matched.innerText ||
                matched.textContent ||
                matched.getAttribute("aria-label") ||
                matched.getAttribute("title") ||
                ""
            )
          );
        }
        return matched;
      };

      const setNativeValue = (element, value) => {
        const proto =
          element instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement?.prototype
            : element instanceof HTMLInputElement
              ? window.HTMLInputElement?.prototype
              : null;
        const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
        if (descriptor?.set) {
          descriptor.set.call(element, value);
          return true;
        }
        return false;
      };

      const fireInputEvents = (element, value) => {
        element.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          data: value,
          inputType: "insertText"
        }));
        element.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: value,
          inputType: "insertText"
        }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const setInputValue = (element, value) => {
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
          element.focus();
          if (!setNativeValue(element, value)) {
            element.value = value;
          }
          fireInputEvents(element, value);
          return cleanText(element.value || "") === cleanText(value);
        }

        element.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);

        let inserted = false;
        try {
          inserted = document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, value);
        } catch {
          inserted = false;
        }

        if (!cleanText(element.innerText || element.textContent || "")) {
          element.textContent = value;
        }

        fireInputEvents(element, value);
        return cleanText(element.innerText || element.textContent || "") === cleanText(value) || inserted;
      };

      const readInputValue = (element) =>
        cleanText(
          element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
            ? element.value
            : element.innerText || element.textContent || ""
        );

      const dispatchEnter = (inputElement, modifiers = {}) => {
        const eventInit = {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
          ...modifiers,
        };
        inputElement.dispatchEvent(new KeyboardEvent("keydown", eventInit));
        inputElement.dispatchEvent(new KeyboardEvent("keypress", eventInit));
        inputElement.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      };

      const submitInput = async (inputElement, mutationState) => {
        const strategies = [];
        const sendButton = findSendButton(inputElement);
        if (sendButton) {
          strategies.push({
            name: "button",
            run: () => sendButton.click(),
          });
        }

        const parentForm = inputElement.closest("form");
        if (parentForm && typeof parentForm.requestSubmit === "function") {
          strategies.push({
            name: "form",
            run: () => parentForm.requestSubmit(),
          });
        }

        strategies.push(
          {
            name: "enter",
            run: () => dispatchEnter(inputElement),
          },
          {
            name: "ctrl+enter",
            run: () => dispatchEnter(inputElement, { ctrlKey: true }),
          }
        );

        const baselineMutations = mutationState.count;
        for (const strategy of strategies) {
          debug("submit-attempt", strategy.name);
          pushTrace("submit-attempt", strategy.name);
          strategy.run();
          await sleep(1200);

          const currentValue = readInputValue(inputElement);
          const generating = hasGenerationIndicator();
          const mutationDelta = mutationState.count - baselineMutations;
          const accepted = !currentValue || generating || mutationDelta > 0;

          debug(
            "submit-check",
            strategy.name,
            "remainingValue=",
            currentValue,
            "generating=",
            generating,
            "mutationDelta=",
            mutationDelta
          );

          if (accepted) {
            return {
              method: strategy.name,
              accepted: true,
            };
          }
        }

        return {
          method: sendButton ? "button" : "none",
          accepted: false,
        };
      };

      const pageText = cleanText(document.body?.innerText || "");
      const beforeMessages = collectMessages();
      const beforeSet = new Set(beforeMessages);
      const startAt = Date.now();
      debug("script-start", "beforeMessages=", beforeMessages.length);
      pushTrace("script-start", "beforeMessages=" + beforeMessages.length);

      let input = findInput();
      while (!input && Date.now() - startAt < 30000) {
        if (shouldAbort()) {
          debug("abort-before-input");
          pushTrace("abort-before-input");
          return buildFailure("aborted", "豆包网页调用已取消", { aborted: true });
        }
        await sleep(500);
        input = findInput();
      }

      if (!input) {
        const needsLogin = /登录|手机号|验证码/.test(pageText);
        debug("input-missing", "needsLogin=", needsLogin);
        pushTrace("input-missing", "needsLogin=" + needsLogin);
        return buildFailure(
          needsLogin ? "login_required" : "input_missing",
          needsLogin
            ? "豆包网页当前需要先登录，请在打开的豆包窗口中完成登录后再试。"
            : "没有在豆包网页里找到可输入的对话框，请先手动进入一个正常对话页面。",
          { needsLogin }
        );
      }

      debug(
        "input-found",
        "tag=",
        input.tagName,
        "contenteditable=",
        input.getAttribute("contenteditable") || "",
        "placeholder=",
        cleanText(input.getAttribute("placeholder") || ""),
        "aria=",
        cleanText(input.getAttribute("aria-label") || "")
      );

      const inputAccepted = setInputValue(input, prompt);
      if (!inputAccepted) {
        debug("input-rejected");
        pushTrace("input-rejected");
        return buildFailure("input_rejected", "已找到豆包输入框，但网页没有接受自动输入。后续需要继续兼容当前网页控件。");
      }
      debug("input-accepted", "value=", cleanText(input.value || input.innerText || input.textContent || ""));
      pushTrace("input-accepted", cleanText(input.value || input.innerText || input.textContent || "").slice(0, 40));
      await sleep(180);
      const submitBy = submitInput(input);
      debug("submitted-by", submitBy);
      pushTrace("submitted-by", submitBy);

      const mutationState = {
        count: 0,
        lastAt: Date.now(),
      };
      const observer = new MutationObserver((mutations) => {
        mutationState.count += mutations.length;
        mutationState.lastAt = Date.now();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      let latestReply = "";
      let lastChangedAt = Date.now();
      let lastLoggedCandidate = "";
      let lastProgressLogAt = Date.now();
      let seenGeneration = false;

      while (Date.now() - startAt < timeoutMs) {
        if (shouldAbort()) {
          debug("abort-during-reply");
          observer.disconnect();
          pushTrace("abort-during-reply");
          return buildFailure("aborted", "豆包网页调用已取消", { aborted: true });
        }

        const messages = collectMessages();
        const delta = messages.filter((text) => !beforeSet.has(text) && text !== prompt);
        const candidate = cleanText(delta[delta.length - 1] || "");
        const generating = hasGenerationIndicator();

        if (generating && !seenGeneration) {
          seenGeneration = true;
          debug("generation-indicator-visible");
          pushTrace("generation-indicator-visible");
        }

        if (candidate && candidate !== latestReply) {
          latestReply = candidate;
          lastChangedAt = Date.now();
          if (candidate !== lastLoggedCandidate) {
            lastLoggedCandidate = candidate;
            debug("candidate-reply", candidate.slice(0, 120));
            pushTrace("candidate-reply", candidate.slice(0, 80));
          }
        }

        if (!latestReply && Date.now() - lastProgressLogAt > 5000) {
          lastProgressLogAt = Date.now();
          debug("waiting-reply", "submitBy=", submitBy, "deltaCount=", delta.length, "messageCount=", messages.length);
          pushTrace(
            "waiting-reply",
            "delta=" + delta.length + ",messages=" + messages.length + ",mutations=" + mutationState.count + ",generating=" + generating
          );
        }

        if (!latestReply && Date.now() - startAt > 12000 && !generating) {
          debug("no-reply-after-submit", "submitBy=", submitBy);
          observer.disconnect();
          pushTrace("no-reply-after-submit", "submitBy=" + submitBy + ",mutations=" + mutationState.count);
          return buildFailure(
            "no_reply_after_submit",
            "消息已提交（方式：" + submitBy + "），但 12 秒内没有检测到豆包回复。",
            {
              meta: {
                submitBy,
                mutationCount: mutationState.count,
                generationIndicatorSeen: seenGeneration,
              },
            }
          );
        }

        if (latestReply && Date.now() - lastChangedAt > 1600) {
          debug("reply-finished", latestReply.slice(0, 120));
          observer.disconnect();
          pushTrace("reply-finished", latestReply.slice(0, 80));
          return {
            ok: true,
            reply: latestReply,
            trace,
            meta: {
              submitBy,
              observedMessages: messages.length,
              mutationCount: mutationState.count,
              generationIndicatorSeen: seenGeneration,
            },
          };
        }

        await sleep(700);
      }

      if (latestReply) {
        debug("reply-partial-timeout", latestReply.slice(0, 120));
        observer.disconnect();
        pushTrace("reply-partial-timeout", latestReply.slice(0, 80));
        return {
          ok: true,
          partial: true,
          reply: latestReply,
          trace,
          meta: {
            timeout: true,
            submitBy,
            mutationCount: mutationState.count,
            generationIndicatorSeen: seenGeneration,
          },
        };
      }

      debug("reply-timeout-no-candidate");
      observer.disconnect();
      pushTrace("reply-timeout-no-candidate", "mutations=" + mutationState.count + ",generation=" + seenGeneration);
      return buildFailure("reply_timeout_no_candidate", "等待豆包回复超时。请确认网页已登录，并且当前页面可以正常对话。");
    })();
  `;
}

function buildPrefillScript(prompt) {
  const safePrompt = JSON.stringify(String(prompt || ""));
  return `
    (async () => {
      const prompt = ${safePrompt};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const cleanText = (value) =>
        String(value || "")
          .replace(/\\u00a0/g, " ")
          .replace(/\\s+/g, " ")
          .trim();
      const findInput = () => {
        const selectors = [
          "textarea",
          "[contenteditable='true']",
          "[role='textbox']",
          "div.ProseMirror"
        ];

        for (const selector of selectors) {
          const elements = [...document.querySelectorAll(selector)];
          for (const element of elements) {
            if (!visible(element)) continue;
            const aria = cleanText(element.getAttribute("aria-label") || "");
            const placeholder = cleanText(element.getAttribute("placeholder") || "");
            const hint = (aria + " " + placeholder).toLowerCase();
            if (hint.includes("搜索")) continue;
            return element;
          }
        }

        return null;
      };
      const setNativeValue = (element, value) => {
        const proto =
          element instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement?.prototype
            : element instanceof HTMLInputElement
              ? window.HTMLInputElement?.prototype
              : null;
        const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
        if (descriptor?.set) {
          descriptor.set.call(element, value);
          return true;
        }
        return false;
      };
      const fireInputEvents = (element, value) => {
        element.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          data: value,
          inputType: "insertText"
        }));
        element.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: value,
          inputType: "insertText"
        }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const setInputValue = (element, value) => {
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
          element.focus();
          if (!setNativeValue(element, value)) {
            element.value = value;
          }
          fireInputEvents(element, value);
          return cleanText(element.value || "") === cleanText(value);
        }

        element.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);

        let inserted = false;
        try {
          inserted = document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, value);
        } catch {
          inserted = false;
        }

        if (!cleanText(element.innerText || element.textContent || "")) {
          element.textContent = value;
        }

        fireInputEvents(element, value);
        return cleanText(element.innerText || element.textContent || "") === cleanText(value) || inserted;
      };

      let input = findInput();
      const startAt = Date.now();
      while (!input && Date.now() - startAt < 20000) {
        await sleep(500);
        input = findInput();
      }
      if (!input) {
        return { ok: false, stage: "input_missing" };
      }

      const accepted = setInputValue(input, prompt);
      return { ok: accepted };
    })();
  `;
}

async function chatWithDoubao(prompt, options = {}) {
  console.log("[doubao-web] ensure window");
  const window = await ensureDoubaoWindow({ reveal: false });
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 60000, 15000), 120000);
  activeRunId += 1;
  const runId = activeRunId;

  console.log("[doubao-web] smoke test executeJavaScript");
  const smokeResult = await withTimeout(
    window.webContents.executeJavaScript(
      `(() => { console.log("[doubao-page] smoke-test", document.readyState); return document.readyState; })()`,
      true
    ),
    8000,
    "豆包网页脚本注入冒烟测试超时：executeJavaScript 没有按预期返回。"
  );
  console.log("[doubao-web] smoke test result", smokeResult);

  console.log("[doubao-web] inject automation");
  await window.webContents.executeJavaScript("window.__AI_WORKER_DOUBAO_ABORT_RUN = 0; true;", true).catch(() => {});
  let result;
  try {
    result = await withTimeout(
      window.webContents.executeJavaScript(buildAutomationScript(prompt, runId, timeoutMs), true),
      timeoutMs + 10000,
      "豆包网页桥接超时：可能卡在页面加载、输入框查找或回复抓取阶段。"
    );
  } catch (error) {
    console.error("[doubao-web] automation error:", error);
    throw error;
  }
  console.log("[doubao-web] automation finished", result?.stage || "done");
  if (Array.isArray(result?.trace) && result.trace.length) {
    console.log("[doubao-web] trace", result.trace.join(" | "));
  }

  if (result?.needsLogin) {
    await ensureDoubaoWindow({ reveal: true });
  }

  if (result?.ok) {
    return {
      ok: true,
      reply: String(result.reply || "").trim(),
      partial: Boolean(result.partial),
      meta: result.meta || {},
    };
  }

  return {
    ok: false,
    aborted: Boolean(result?.aborted),
    needsLogin: Boolean(result?.needsLogin),
    stage: result?.stage || "",
    error: result?.error || "豆包网页调用失败",
  };
}

async function cancelDoubaoChat() {
  if (!doubaoWindow || doubaoWindow.isDestroyed() || !activeRunId) {
    return { ok: true };
  }

  await doubaoWindow.webContents
    .executeJavaScript(`window.__AI_WORKER_DOUBAO_ABORT_RUN = ${activeRunId}; true;`, true)
    .catch(() => {});

  return { ok: true };
}

async function prepareDoubaoPrompt(prompt, options = {}) {
  const window = await ensureDoubaoWindow({ reveal: true });
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 15000, 8000), 45000);
  return withTimeout(
    window.webContents.executeJavaScript(buildPrefillScript(prompt), true),
    timeoutMs,
    "豆包网页预填充超时"
  );
}

module.exports = {
  ensureDoubaoWindow,
  chatWithDoubao,
  cancelDoubaoChat,
  prepareDoubaoPrompt,
};
