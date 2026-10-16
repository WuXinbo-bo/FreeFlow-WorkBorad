import React from "react";
import { getAppIconNodes, ICON_STROKE_WIDTH, normalizeAppIconSize } from "./appIcons.mjs";

export function AppIcon({ name, size = 18, className = "", style, ...props }) {
  const dimension = normalizeAppIconSize(size);
  return <svg {...props} className={`app-icon${className ? ` ${className}` : ""}`} data-ui-icon={name} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={dimension} height={dimension} style={{ "--app-icon-size": `${dimension}px`, ...style }} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {getAppIconNodes(name).map(([tag, attributes], index) => React.createElement(tag, { ...attributes, key: index }))}
  </svg>;
}
