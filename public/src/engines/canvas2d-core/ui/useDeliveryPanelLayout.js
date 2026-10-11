import { useLayoutEffect } from "react";

// The canvas can be much narrower than the window when the AI pane is open.
export function useDeliveryPanelLayout(ref, open) {
  useLayoutEffect(() => {
    if (!open) return;
    const wrap = ref.current;
    const root = wrap?.closest(".canvas2d-engine-ui");
    const panel = wrap?.querySelector(".canvas2d-delivery-panel");
    if (!root || !panel) return;
    const update = () => {
      const canvas = root.getBoundingClientRect();
      const anchor = wrap.getBoundingClientRect();
      const left = Math.max(12, canvas.left + 12);
      const right = Math.min(window.innerWidth - 12, canvas.right - 12);
      const width = Math.max(1, Math.min(360, right - left));
      const end = Math.min(right, Math.max(left + width, anchor.right));
      panel.style.width = `${width}px`;
      panel.style.right = `${anchor.right - end}px`;
      panel.style.maxHeight = `${Math.max(100, Math.min(640, window.innerHeight * .7, window.innerHeight - anchor.bottom - 26))}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [ref, open]);
}
