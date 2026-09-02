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
  throwIfAborted(context?.signal);
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
  throwIfAborted(context?.signal);

  const renderInput = normalizeRenderInput(pipelineOutput);
  const renderResult = renderInput.kind === "legacy-compatibility"
    ? null
    : await rendererPipeline.render(pipelineOutput, context);
  const bridgeResult = renderInput.kind === "legacy-compatibility"
    ? await legacyAdapterRegistry.adapt(renderInput, context)
    : null;
  throwIfAborted(context?.signal);

  const commitResult =
    typeof commitLayer?.commitAsync === "function"
      ? await commitLayer.commitAsync({
          board,
          renderResult,
          bridgeResult,
          anchorPoint,
          batchId: context?.importBatchId,
          yieldControl: context?.yieldControl,
          signal: context?.signal,
        })
      : commitLayer.commit({
          board,
          renderResult,
          bridgeResult,
          anchorPoint,
          batchId: context?.importBatchId,
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

function throwIfAborted(signal) {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error("Structured import was cancelled");
  error.name = "AbortError";
  throw error;
}
