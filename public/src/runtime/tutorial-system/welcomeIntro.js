// Original lettering follows the same pen direction as the ribbon-shaped app mark.
const FREEFLOW_LETTERING = [
  "M18 65C24 47 28 23 34 12",
  "M12 19C29 10 48 10 59 14",
  "M23 37C33 33 44 32 51 34",
  "M49 62L57 34L53 49C63 31 73 31 74 39",
  "M74 50C98 47 99 31 87 33C72 34 65 62 81 63C89 64 97 58 103 52",
  "M103 50C127 47 128 31 116 33C101 34 94 62 110 63C119 64 127 58 133 52",
  "M138 65C144 47 148 23 154 12",
  "M132 19C149 10 168 10 179 14",
  "M143 37C153 33 164 32 171 34",
  "M171 54C193 35 197 8 187 11C178 14 163 63 178 63C184 63 190 57 194 52",
  "M218 37C206 25 189 44 194 57C199 73 221 56 220 41C219 34 215 33 214 38C214 45 223 47 231 40",
  "M233 35C226 49 222 64 230 63C237 63 246 47 250 36C244 50 241 64 250 63C260 62 272 39 268 33C264 29 264 47 280 40",
];

export function renderWelcomeIntro(renderIcon, renderClose) {
  return `
    <div class="canvas2d-tutorial-layer global-tutorial-layer" data-shape-include="true" data-shape-padding="0">
      <div class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-hidden="true"></div>
      <div class="canvas2d-tutorial-center global-tutorial-center is-intro" role="dialog" aria-modal="true" aria-label="欢迎使用 FreeFlow" aria-describedby="tutorial-welcome-title" data-shape-include="true" data-shape-padding="8">
        <div class="tutorial-intro-controls">
          <button type="button" class="tutorial-text-action" data-welcome-skip hidden>${renderIcon("arrow")}<span>跳过动画</span></button>
          ${renderClose("data-global-tutorial-close")}
        </div>
        <div class="tutorial-intro-brand" aria-label="FreeFlow Air Canvas">
          <img class="tutorial-intro-logo" src="./assets/brand/FreeFlow_app_icon.png" alt="" width="88" height="88" />
          <svg class="tutorial-intro-wordmark" viewBox="0 0 292 78" aria-hidden="true" focusable="false">
            ${FREEFLOW_LETTERING.map((path) => `<path d="${path}" pathLength="1" />`).join("")}
          </svg>
          <span class="tutorial-intro-product">Air Canvas</span>
        </div>
        <div class="tutorial-intro-copy" data-welcome-reveal>
          <h2 id="tutorial-welcome-title"><span>欢迎使用全新</span>FreeFlow Air Canvas</h2>
          <p>让灵感自由展开，让创造自然发生。</p>
        </div>
        <div class="tutorial-intro-steps" data-welcome-reveal>
          <div class="tutorial-intro-step">${renderIcon("canvas")}<strong>创建内容</strong><small>从一个想法开始</small></div>
          <div class="tutorial-intro-step">${renderIcon("layout")}<strong>组织画布</strong><small>让思路清晰相连</small></div>
          <div class="tutorial-intro-step">${renderIcon("screen")}<strong>与 AI 协作</strong><small>一起探索更多可能</small></div>
        </div>
        <div class="tutorial-intro-actions" data-welcome-reveal>
          <button type="button" class="canvas2d-tutorial-overlay-btn is-primary" data-global-tutorial-open-center><span>开始快速了解</span>${renderIcon("arrow")}</button>
          <button type="button" class="canvas2d-tutorial-overlay-btn is-secondary" data-global-tutorial-dismiss-intro>稍后再看</button>
        </div>
      </div>
    </div>
  `;
}

export function mountWelcomeIntro(dialog, { play, onComplete }) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const brand = dialog.querySelector(".tutorial-intro-brand");
  const skip = dialog.querySelector("[data-welcome-skip]");
  const close = dialog.querySelector("[data-global-tutorial-close]");
  const content = [...dialog.querySelectorAll("[data-welcome-reveal]")];
  const animations = [];
  let disposed = false;
  let finished = false;

  function finish() {
    if (disposed || finished) return;
    finished = true;
    animations.forEach((animation) => animation.cancel());
    content.forEach((element) => { element.inert = false; });
    dialog.dataset.welcomeState = "ready";
    if (document.activeElement === skip) {
      dialog.querySelector("[data-global-tutorial-open-center]").focus({ preventScroll: true });
    }
    skip.hidden = true;
    onComplete();
  }

  function animate(element, frames, duration, delay = 0, easing = "cubic-bezier(0.22, 1, 0.36, 1)") {
    const animation = element.animate(frames, { duration, delay, easing, fill: "both" });
    animations.push(animation);
    return animation;
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      close.click();
    } else if (event.key === "Tab") {
      const buttons = [...dialog.querySelectorAll("button:not([hidden]):not(:disabled)")]
        .filter((button) => !button.closest("[inert]"));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
      event.stopImmediatePropagation();
    }
  }

  skip.addEventListener("click", finish);
  motion.addEventListener("change", finish);
  window.addEventListener("resize", finish);
  document.addEventListener("keydown", onKeyDown, true);

  if (play && !motion.matches) {
    dialog.dataset.welcomeState = "playing";
    skip.hidden = false;
    content.forEach((element) => { element.inert = true; });
    const panelRect = dialog.getBoundingClientRect();
    const brandRect = brand.getBoundingClientRect();
    const offset = panelRect.top + panelRect.height / 2 - (brandRect.top + brandRect.height / 2);
    animate(dialog, [{ opacity: 0 }, { opacity: 1 }], 450);
    animate(brand, [
      { transform: `translateY(${offset}px) scale(1.14)` },
      { transform: "translateY(0) scale(1)" },
    ], 1100, 5100);
    animate(dialog.querySelector(".tutorial-intro-logo"), [
      { opacity: 0, clipPath: "inset(0 0 100% 0)", transform: "translateY(8px)" },
      { opacity: 1, clipPath: "inset(0 0 0% 0)", transform: "translateY(0)" },
    ], 1400, 200);
    const strokes = [...dialog.querySelectorAll(".tutorial-intro-wordmark path")];
    const totalLength = strokes.reduce((sum, path) => sum + path.getTotalLength(), 0);
    let penTime = 700;
    strokes.forEach((path) => {
      const duration = 3400 * path.getTotalLength() / totalLength;
      // Hide pending strokes completely: rounded caps otherwise leave dots at pen-up points.
      animate(path, [
        { opacity: 0, strokeDashoffset: 1, offset: 0 },
        { opacity: 1, strokeDashoffset: 0.999, offset: 0.001 },
        { opacity: 1, strokeDashoffset: 0, offset: 1 },
      ], duration, penTime, "ease-in-out");
      penTime += duration + 18;
    });
    animate(dialog.querySelector(".tutorial-intro-product"), [{ opacity: 0 }, { opacity: 1 }], 700, 3950);
    content.forEach((element, index) => {
      animate(element, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], 800, 5900 + index * 550);
    });
    // Cancellation rejects finished promises; closing a scene must never complete a later one.
    Promise.all(animations.map((animation) => animation.finished)).then(finish).catch(() => {});
  } else {
    finish();
  }
  close.focus({ preventScroll: true });

  return () => {
    disposed = true;
    animations.forEach((animation) => animation.cancel());
    skip.removeEventListener("click", finish);
    motion.removeEventListener("change", finish);
    window.removeEventListener("resize", finish);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}
