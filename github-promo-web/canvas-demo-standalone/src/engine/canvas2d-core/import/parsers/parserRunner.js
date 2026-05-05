export async function runImportParsePipeline({
  descriptor,
  registry,
  fallbackManager,
  diagnosticsModel,
  context = {},
}) {
  if (!registry) {
    throw new Error("runImportParsePipeline requires a parser registry");
  }

  const parseResult = await registry.parseDescriptor(descriptor, context);
  const fallbackResult =
    !parseResult.ok && fallbackManager
      ? fallbackManager.resolve({ descriptor, parseResult }, context)
      : null;
  const diagnostics =
    diagnosticsModel
      ? diagnosticsModel.buildImportDiagnostics({
          descriptor,
          parseResult,
          fallbackResult,
        })
      : null;

  return {
    descriptor,
    parseResult,
    fallbackResult,
    diagnostics,
  };
}
