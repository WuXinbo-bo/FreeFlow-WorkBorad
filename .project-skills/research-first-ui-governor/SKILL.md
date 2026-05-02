---
name: research-first-ui-governor
description: Use before UI design or UI implementation in this project when changing layout, dialogs, controls, forms, object actions, navigation, or visual hierarchy. Requires targeted reference lookup before implementation, then translating proven interaction patterns into FreeFlow's existing product language.
---

# Research-First UI Governor

Use this skill before UI work in FreeFlow. The goal is not to copy popular products; it is to ground interaction decisions in current, credible references and then implement them in the app's own desktop workbench language.

## Required Workflow

1. Inspect the existing UI code and state ownership before changing files.
2. Do targeted external reference lookup for the exact interaction pattern being changed.
3. Extract the principle, not the surface styling.
4. Prefer progressive disclosure: controls that are not needed in the steady state should appear only when the user starts that task.
5. Keep actions object-proximal: rename, reveal, delete, duplicate and similar operations should live near the selected object they affect.
6. Avoid permanent forms for occasional tasks such as rename or create; use inline edit, popover, compact dock, or focused dialog depending on risk.
7. Preserve FreeFlow's current visual system unless the request explicitly asks for a broader redesign.
8. Validate with a build and, when feasible, visual/browser interaction checks.

## Reference Quality

- Prefer official design systems, platform guidelines, and established UX research sources.
- Use current sources when the pattern may have changed.
- Summarize references in engineering terms: target object, trigger, transient state, confirmation, cancellation, failure state.

## Implementation Rules

- Do not add a second state or persistence source for UI behavior if an existing owner exists.
- Keep labels concise and utility-oriented.
- Make busy, success and error states visible at the point of action.
- Keyboard basics must work for editing flows: Enter confirms, Escape cancels, focus moves into the input.
- For desktop workbench UI, avoid mobile sheets, oversized cards, decorative gradients, and always-visible low-frequency controls.

## Final Response

Briefly state which reference patterns informed the change, which files changed, and what validation was run.
