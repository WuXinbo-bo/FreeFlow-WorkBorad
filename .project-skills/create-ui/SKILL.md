---
name: create-ui
description: Use for industrial-grade minimalist UI design and implementation in desktop, canvas, or web products, especially FreeFlow UI work. Enforces existing UI-system inventory, research-first design, progressive compatible extension, full state coverage, and implementation validation before delivering UI code or plans.
---

# Create UI

Use this skill for UI design, UI implementation, UI refactors, component iteration, canvas/desktop/web interface work, and interaction-heavy product surfaces. The target is industrial-grade, minimalist, market-aligned, productized UI that extends the existing product system instead of replacing it.

## Non-Negotiable Principle

No inventory, no design. No research, no output. No compatibility, no delivery. No market-fit check, no handoff. No state coverage, no handoff.

The output must not look like an AI demo, a one-off mockup, or a visual redesign detached from product logic.
The output must look like a real product that could survive market comparison, not an isolated concept board.
The output must show design judgment: it should be able to evolve the current system when the current expression is too ordinary, stale, or weak, while still remaining recognizably part of the same product.

## Required Workflow

### 0. Existing UI System Inventory

Before designing or editing code, inspect the current UI system and produce a concise inventory:

- `Reusable assets`: existing components, styles, interaction patterns, layout shells, dialogs, controls, cards, menus, state components.
- `Optimizable parts`: existing UI that can be improved without changing architecture or user habits.
- `Required additions`: only the missing pieces needed for the task.
- `Do-not-change rules`: persistence owners, state owners, architecture boundaries, existing user workflows, technical constraints, historical pitfalls.

Inventory must include:

- Design language: color, typography, radius, shadow, spacing, density, motion, hierarchy.
- Existing behavior: trigger rules, close/cancel/save patterns, keyboard behavior, empty/loading/error states.
- Code ownership: source files, generated bundles, state owner, persistence owner, bridge/API owner.

### 1. Requirement Breakdown

Clarify the task in four dimensions:

- `Core function`: what user problem the UI must solve.
- `Interaction scene`: trigger, frequency, user path, canvas/desktop/web context, interruption cost.
- `Constraints`: existing design system, code architecture, performance, compatibility, platform limits.
- `Experience target`: minimum practical steps, feedback requirement, consistency with existing habits.

### 2. Research And Benchmarking

Do broad research before proposing or implementing UI:

- First benchmark the product itself: same-product components and mature interaction patterns.
- Then benchmark external mature products or systems relevant to the exact interaction: Figma, Notion, Miro, VS Code, Office, Fluent UI, Radix UI, Ant Design, platform guidelines, credible UX research.
- Do not stop at a few familiar design-system sites. Search broadly across many websites until you have enough pattern coverage for the exact problem.
- Include a mix of:
  - real shipped products
  - official design systems
  - credible component libraries
  - implementation-focused articles
  - high-signal galleries or case studies when they reflect real product work rather than concept art
  - discussion threads or issue threads only when they reveal real usage problems, constraints, or pitfalls
- Prefer real product patterns and official design systems over concept shots, trend collections, or decorative inspiration dumps.
- For non-trivial UI work, research should usually touch at least 8-15 relevant sources across multiple websites before locking a direction.
- Extract 3-5 comparable patterns when the task is non-trivial, but only after the broader search space has been scanned.

Research notes must identify:

- Shared strengths.
- Useful differentiators.
- Common pitfalls.
- Compatibility fit with the existing UI system.
- Which patterns are actually market-common versus merely visually interesting.
- Which patterns support a minimalist product aesthetic without reducing usability.

Research quality rules:

- Do not rely on one ecosystem only.
- Do not confuse Dribbble-style novelty with product readiness.
- If a pattern appears repeatedly across mature products, treat that as strong evidence.
- If a pattern looks attractive but appears rarely in serious products, treat it as suspect until proven otherwise.
- Research should bias toward interfaces that feel current, calm, efficient, and commercially credible.

### 3. Best-Practice Extraction

Keep only patterns that are:

- Compatible with the existing product language.
- Useful for the current user path.
- Implementable in the current codebase.
- Maintainable as reusable UI behavior.
- Consistent with current market expectations for polished software products.
- Minimal in presentation but not weak in hierarchy or affordance.

Discard:

- Decorative concepts.
- Full-system redesigns when an incremental extension is enough.
- Modal or all-options-at-once designs for low-frequency tasks.
- Patterns that fight existing user habits or architecture.
- Patterns that feel trendy but not productized.
- Layouts that look premium in isolation but become noisy, inefficient, or fragile in real usage.

### 4. Adapted UI Plan

Build the final plan around progressive compatible extension:

- Reuse existing components, styles, state flows, and interaction conventions first.
- Add only minimal new structure when the current system cannot express the need.
- Split UI into `core operation`, `supporting operation`, and `extended operation`.
- Keep frequent actions visible and low-frequency actions trigger-based.
- Keep actions close to the object they affect.
- Avoid redundant labels, decorations, duplicate controls, and explanatory clutter.
- Explicitly state why the chosen direction is market-credible and product-appropriate, not merely aesthetically cleaner.
- Default to a minimalist visual result: fewer surfaces, fewer colors, fewer competing accents, stronger spacing discipline, clearer hierarchy.
- Do not stop at passive imitation of the current UI. When the current expression is weak, generic, or dated, evolve it thoughtfully while preserving system continuity.

## Design Rules

- `Progressive compatibility`: extend the current system; do not replace it unless the current system is the root cause.
- `Minimal hierarchy`: one clear primary action path, secondary actions grouped predictably, advanced actions disclosed on demand.
- `Progressive interaction`: click to enter task state, allow repeated edits, allow cancellation, avoid irreversible one-shot flows.
- `Product logic first`: visual polish must not violate user workflow, data ownership, or business logic.
- `No redundancy`: every visible element must serve the current task.
- `Minimalist market fit`: the interface should feel simple, modern, and commercially credible under current market expectations, without drifting into bland generic SaaS sludge.
- `Productized polish`: spacing, states, affordances, copy, and density must read like a shipped product, not a mockup.
- `Designed motion`: animation and visual effects are part of the design surface and must be intentionally designed when they improve hierarchy, feedback, or perceived quality.
- `Critical evolution`: preserve the product language, but do not treat the current UI as sacred if stronger expression, hierarchy, or usability can be introduced without breaking system coherence.
- `Full state coverage`: default, hover, active, disabled, loading, error, and empty states must be covered or explicitly out of scope.
- `Reusable implementation`: avoid one-off component structures when existing patterns can handle the job.

## Aesthetic Standards

- Default visual direction is `minimalist product UI`, not expressive art direction.
- Minimalist does not mean empty; it means disciplined hierarchy, low noise, restrained color use, and deliberate emphasis.
- Every design should survive comparison against contemporary mature products in the same category.
- Avoid visual gimmicks that age quickly: gratuitous gradients, oversized blur, ornamental shadows, random color pops, novelty controls, fake dashboard chrome.
- Avoid generic AI-looking output: symmetric card spam, repeated pills everywhere, soft-glow overload, indistinct primary actions, and “clean but anonymous” layouts.
- Prefer icons, symbols, shapes, layout rhythm, and pattern language to carry part of the meaning when they can replace redundant text.
- Use text sparingly. If a label, helper line, or description does not materially improve decision-making or action clarity, remove it.
- The target feeling is `minimal`, `premium`, and `quietly confident`, not cold, empty, or under-designed.
- Prefer clarity, proportion, rhythm, and task fit over decoration.
- Innovation is allowed and encouraged when it improves the product, but it must feel like a natural evolution of the existing system, not a foreign visual transplant.

## Design Thinking Standard

- Apply critical thinking to the current UI, not blind obedience.
- Identify where the current design is:
  - already strong and should be preserved
  - structurally correct but visually weak
  - visually acceptable but interaction-poor
  - overly generic and in need of a stronger product character
- When improving a weak area, propose a better expression inside the same design family instead of copying the current solution mechanically.
- Newness is valid only if it improves clarity, hierarchy, usability, brand tone, or perceived product quality.
- Every substantial visual deviation from the current UI should be explainable as `same system, stronger expression`.
- The goal is thoughtful evolution, not rebellion and not stagnation.

## Motion And Visual Effects

- Motion is not optional polish when the interaction benefits from it; it should be designed deliberately.
- Use animation to clarify:
  - open/close transitions
  - focus shifts
  - hover/press feedback
  - hierarchy changes
  - loading/progress states
  - spatial relationships between trigger and surfaced content
- Motion should feel restrained, precise, and product-grade: short durations, clean easing, no theatrical bounce unless the product language already uses it.
- Prefer a small number of meaningful motion patterns reused consistently across the UI.
- Visual effects such as glow, blur, gradient, or layered shadow are allowed only when they strengthen focus, depth, or premium feel without increasing noise.
- Avoid motion or effects that read as decoration-first rather than product-first.

## Text Economy Standards

- Prefer concise, high-signal labels over explanatory sentences.
- Prefer one strong title over title + subtitle + helper + caption unless each line serves a different decision need.
- If icons, layout, or surrounding context already make the action obvious, reduce or remove extra copy.
- Empty states, warnings, and destructive actions may use text more explicitly, but still keep copy tight and purposeful.
- Do not fill surfaces with generic helper text just to make them feel “designed”.

## Pattern And Shape Standards

- If a surface can communicate through iconography, badges, geometry, or subtle patterning instead of extra text, prefer that route.
- Patterns, dividers, and shape language may be used to create a premium minimalist feel, but they must support hierarchy, grouping, or brand tone.
- Decorative patterning should be low-noise and secondary to content.
- Avoid meaningless ornament that does not improve recognition, grouping, or visual rhythm.

## Interaction Standards

- Rename/edit flows should usually be inline or object-proximal.
- Create flows should usually be a trigger plus focused name/confirm/cancel state, not a permanent form.
- Destructive or high-risk flows may use confirmation, but only with concise copy and clear target context.
- Keyboard basics must work where applicable: Enter confirms, Escape cancels, focus moves to the active field.
- Busy and error feedback must appear at the point of action.
- Empty states must provide the next practical action, not decorative onboarding text.
- Popup, dropdown, popover, and overlay interactions should usually animate from their trigger or anchor direction so the relationship feels intentional.

## Implementation Rules

- Locate source-of-truth files before editing; do not create parallel UI/state systems.
- Preserve generated-bundle workflow. If source changes require a build artifact, run the project build step.
- Prefer surgical structural improvements over broad visual rewrites.
- Use existing tokens/classes/patterns where they are coherent.
- If adding classes, name them by product area and behavior, not visual decoration.
- Keep CSS state selectors explicit: `is-active`, `is-open`, `is-disabled`, `is-loading`, `is-error`.
- Do not add animation, gradients, or decorative surfaces unless they clarify hierarchy or state.
- If you introduce a stronger visual move, justify it against market norms and the current product language first.
- When adding motion, keep the implementation reusable: shared easing, durations, and state transitions where possible.
- If you intentionally depart from the current local pattern, explain what is being preserved, what is being evolved, and why the new solution is a better fit.

## Required Delivery Structure

For substantial UI work, final output should cover:

- `Inventory`: what was reused, optimized, added, and protected.
- `Research`: sources or internal patterns used and what was extracted.
- `Market fit`: why the chosen solution matches current product expectations and minimalist market aesthetics.
- `Motion / visual language`: what animation, effects, pattern language, or text reduction choices were made and why they improve the product feel.
- `Evolution judgment`: what parts of the current design were preserved, what parts were evolved, and why the evolution stays stylistically unified.
- `Implementation`: what changed at behavior level, not just file list.
- `Compatibility`: why the change fits the current UI system and architecture.
- `Validation`: build/test/visual checks completed and any gaps.

For small UI fixes, compress the same content into a concise summary.

## Red Lines

- Do not skip existing UI-system inventory.
- Do not design without research for non-trivial UI work.
- Do not do narrow research only inside a single design system or one familiar website when the problem is non-trivial.
- Do not replace a working UI system with a new design language unless explicitly asked.
- Do not pack all options into one modal or panel.
- Do not deliver normal state only.
- Do not add duplicate state, persistence, or bridge ownership.
- Do not create one-off components when existing patterns are sufficient.
- Do not add unrelated decoration or copy.
- Do not ship visually loud, trend-chasing, or concept-driven UI under the label of “minimalism”.
- Do not ship generic AI-looking UI that lacks market credibility or product character.
- Do not use text as filler when iconography, layout, or pattern language can communicate the same thing more elegantly.
- Do not add motion or effects that are flashy but semantically useless.
- Do not freeze the design in place just because “that is how it already looks” when a better unified evolution is clearly possible.
- Do not introduce novelty that breaks stylistic continuity with the existing product.
- Do not deliver code that bypasses the current technology stack or build workflow.

## Pre-Delivery Checklist

- Existing assets and boundaries identified.
- Research performed and translated into product-compatible principles.
- Research came from sufficiently broad web coverage, not just a narrow set of familiar sources.
- Chosen direction is minimalist, productized, and plausible against current market expectations.
- Motion, visual effects, iconography, and text density were designed intentionally rather than left as default byproducts.
- The solution shows design judgment: it improves weak areas of the current UI without visually betraying the existing product family.
- Core/supporting/extended action hierarchy is clear.
- Default, hover, active, disabled, loading, error, and empty states are handled or explicitly scoped.
- Keyboard and cancellation rules are defined for edit/create flows.
- Implementation reuses the existing UI architecture where possible.
- Source and generated artifacts are synchronized if required.
- Validation commands or visual checks have been run, or the gap is stated.
