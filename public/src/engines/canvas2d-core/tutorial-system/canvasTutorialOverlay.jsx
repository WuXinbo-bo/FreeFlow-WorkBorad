import React from "react";
import TutorialOverlay from "./tutorialOverlay.jsx";
import { createCanvasTutorialEntryItems } from "./canvasTutorialEntry.js";

export default function CanvasTutorialOverlay(props) {
  return <TutorialOverlay {...props} entryItemsFactory={createCanvasTutorialEntryItems} />;
}
