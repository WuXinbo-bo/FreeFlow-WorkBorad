import { runImportParsePipeline } from "../parsers/parserRunner.js";
import { normalizeRenderInput } from "../renderers/rendererPipeline.js";

export async function runHostRolloutExperiment({
  descriptor,
  board,
  anchorPoint,
  registry,
  fallbackManager,
  diagnosticsModel,
  switchboard,
  killSwitch,
  rendererPipeline,
  legacyAdapterRegistry,
  commitLayer,
  context = {},
} = {}) {
  const switchDecision = switchboard.resolve(descriptor, context);
  const finalDecision = killSwitch.apply(switchDecision, descriptor, context);

  if (finalDecision.useLegacy) {
    return {
      ok: true,
      pipeline: "legacy",
      switchDecision,
      finalDecision,
      skipped: true,
      reason: "legacy-pipeline-selected",
    };
  }

  const pipelineOutput = await runImportParsePipeline({
    descriptor,
    registry,
    fallbackManager,
    diagnosticsModel,
    context,
  });

  const renderInput = normalizeRenderInput(pipelineOutput);
  const renderResult = renderInput.kind === "legacy-compatibility"
    ? null
    : await rendererPipeline.render(pipelineOutput, context);
  const bridgeResult = renderInput.kind === "legacy-compatibility"
    ? await legacyAdapterRegistry.adapt(renderInput, context)
    : null;

  const commitResult =
    typeof commitLayer?.commitAsync === "function"
      ? await commitLayer.commitAsync({
          board,
          renderResult,
          bridgeResult,
          anchorPoint,
          yieldControl: context?.yieldControl,
        })
      : commitLayer.commit({
          board,
          renderResult,
          bridgeResult,
          anchorPoint,
        });

  return {
    ok: Boolean(commitResult?.ok),
    pipeline: "structured",
    switchDecision,
    finalDecision,
    pipelineOutput,
    renderInput,
    renderResult,
    bridgeResult,
    commitResult,
  };
}
