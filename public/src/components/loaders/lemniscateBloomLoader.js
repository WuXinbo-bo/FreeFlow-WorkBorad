const FREEFLOW_LOGO_PATH = "/assets/brand/FreeFlow_logo.svg";

export function mountLemniscateBloomLoader(root) {
  if (!root) {
    return {
      destroy() {},
    };
  }

  root.innerHTML = `
    <div class="freeflow-logo-loader" aria-hidden="true">
      <div class="freeflow-logo-loader-shell">
        <img class="freeflow-logo-loader-image" src="${FREEFLOW_LOGO_PATH}" alt="" />
        <div class="freeflow-logo-loader-shimmer"></div>
      </div>
    </div>
  `;

  return {
    destroy() {
      root.innerHTML = "";
    },
  };
}

export const LEMNISCATE_BLOOM_CURVE = Object.freeze({
  name: "FreeFlow Logo Loader",
  asset: FREEFLOW_LOGO_PATH,
});
