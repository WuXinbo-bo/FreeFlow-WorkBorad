export function createGlobalTutorialEntryItems(config = null) {
  const tutorials = Array.isArray(config?.tutorials) ? config.tutorials : [];
  const tutorialItems = tutorials.map((item) => ({
    id: item.id,
    label: item.title,
    description: item.description,
    disabled: false,
  }));
  tutorialItems.push({
    id: "shortcut-guide",
    label: "快捷键说明",
    description: "画布快捷键速查文档",
    disabled: false,
  });
  return tutorialItems;
}
