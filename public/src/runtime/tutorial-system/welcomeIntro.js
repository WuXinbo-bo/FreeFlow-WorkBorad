// Write both capital Fs down the stem, then left to right across their bars.
const FREEFLOW_LETTERING = [
  "M33 13C29 29 25 48 18 65",
  "M33 14C41 11 51 11 61 14",
  "M27 36C35 33 44 33 51 34",
  "M49 62L57 34L53 49C63 31 73 31 74 39",
  "M74 50C98 47 99 31 87 33C72 34 65 62 81 63C89 64 97 58 103 52",
  "M103 50C127 47 128 31 116 33C101 34 94 62 110 63C119 64 127 58 133 52",
  "M153 13C149 29 145 48 138 65",
  "M153 14C161 11 171 11 181 14",
  "M147 36C155 33 164 33 171 34",
  "M183 54C205 35 209 8 199 11C190 14 175 63 190 63C196 63 202 57 206 52",
  "M230 37C218 25 201 44 206 57C211 73 233 56 232 41C231 34 227 33 226 38C226 45 235 47 243 40",
  "M245 35C238 49 234 64 242 63C249 63 258 47 262 36C256 50 253 64 262 63C272 62 284 39 280 33C276 29 276 47 292 40",
];

export function renderWelcomeIntro(renderIcon, renderClose) {
  return `
    <div class="canvas2d-tutorial-layer global-tutorial-layer" data-shape-include="true" data-shape-padding="0">
      <div class="canvas2d-tutorial-backdrop global-tutorial-backdrop" aria-hidden="true"></div>
      <div class="canvas2d-tutorial-center global-tutorial-center is-intro" role="dialog" aria-modal="true" aria-label="欢迎使用 FreeFlow" aria-describedby="tutorial-welcome-title" data-shape-include="true" data-shape-padding="8">
        <div class="tutorial-intro-controls">
          <button type="button" class="tutorial-text-action" data-welcome-skip hidden>${renderIcon("arrow-right")}<span>跳过动画</span></button>
          ${renderClose("data-global-tutorial-close")}
        </div>
        <div class="tutorial-intro-brand" aria-label="FreeFlow Air Canvas">
          <div class="tutorial-intro-identity">
            <img class="tutorial-intro-logo" src="./assets/brand/FreeFlow_app_icon.png" alt="" width="64" height="64" />
            <span class="tutorial-intro-product">Air Canvas</span>
          </div>
          <div class="tutorial-intro-copy">
            <h2 id="tutorial-welcome-title" aria-label="欢迎使用全新的 FreeFlow">
              <span data-welcome-caption="welcome">欢迎使用全新的</span>
              <svg class="tutorial-intro-wordmark" viewBox="0 0 304 78" aria-hidden="true" focusable="false">
                ${FREEFLOW_LETTERING.map((path) => `<path d="${path}" pathLength="1" />`).join("")}
              </svg>
            </h2>
            <p data-welcome-caption="slogan">为知识与工作落地而生</p>
          </div>
        </div>
        <div class="tutorial-intro-steps" data-welcome-reveal>
          <div class="tutorial-intro-step">${renderIcon("file-pen-line")}<strong>创建内容</strong><small>从一个想法开始</small></div>
          <div class="tutorial-intro-step">${renderIcon("panels-top-left")}<strong>组织画布</strong><small>让思路清晰相连</small></div>
          <div class="tutorial-intro-step">${renderIcon("monitor")}<strong>与 AI 协作</strong><small>一起探索更多可能</small></div>
        </div>
        <div class="tutorial-intro-actions" data-welcome-reveal>
          <button type="button" class="canvas2d-tutorial-overlay-btn is-primary" data-global-tutorial-open-center><span>开始快速了解</span>${renderIcon("arrow-right")}</button>
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
    animate(dialog.querySelector('[data-welcome-caption="welcome"]'), [{ opacity: 0 }, { opacity: 1 }], 700, 350);
    animate(dialog.querySelector('[data-welcome-caption="slogan"]'), [{ opacity: 0 }, { opacity: 1 }], 700, 4400);
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
