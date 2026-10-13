// Native IME owns its pending text and candidate-selection keys.
export function isComposingInput(event) {
  return Boolean(event?.isComposing || event?.keyCode === 229 ||
    event?.target?.closest?.('[data-ff-composing="true"]'));
}
