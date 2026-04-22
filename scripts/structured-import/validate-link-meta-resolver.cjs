"use strict";

async function main() {
  const moduleRef = await import(
    "../../public/src/engines/canvas2d-core/textEditing/linkMetaResolver.js"
  );
  const { resolveUrlMeta, buildFallbackUrlMeta } = moduleRef;

  const remoteMeta = await resolveUrlMeta("https://example.com/docs", {
    fetchImpl: async (url) => {
      if (!String(url || "").startsWith("/api/url-meta?url=")) {
        return { ok: false, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({
          meta: {
            title: "Example Docs",
            description: "Structured import docs",
            siteName: "Example",
            embeddable: false,
          },
        }),
      };
    },
  });

  assert(remoteMeta != null, "resolveUrlMeta should return meta");
  assert(remoteMeta.title === "Example Docs", "resolveUrlMeta should keep title");
  assert(remoteMeta.fetchState === "ready", "resolveUrlMeta should normalize fetchState to ready");

  const fallbackMeta = await resolveUrlMeta("https://example.com/no-api", {
    fetchImpl: async () => {
      throw new Error("network disabled");
    },
    timeoutMs: 800,
  });
  assert(fallbackMeta != null, "fallback meta should exist");
  assert(
    String(fallbackMeta.domain || "").includes("example.com"),
    "fallback meta should infer domain"
  );

  const directFallback = buildFallbackUrlMeta("https://sub.example.com/path/page");
  assert(directFallback != null, "buildFallbackUrlMeta should return value");
  assert(
    String(directFallback.siteName || "").includes("sub.example.com"),
    "buildFallbackUrlMeta should infer siteName"
  );

  console.log("[link-meta-resolver] ok: 3 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[link-meta-resolver] validation failed");
  console.error(error);
  process.exitCode = 1;
});

