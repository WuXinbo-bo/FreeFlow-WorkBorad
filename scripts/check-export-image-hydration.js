const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
  const moduleUrl = pathToFileURL(
    path.join(
      __dirname,
      "..",
      "public",
      "src",
      "engines",
      "canvas2d-core",
      "export",
      "host",
      "hostExportAssetAdapter.js"
    )
  ).href;
  const { createHostExportAssetAdapter } = await import(moduleUrl);
  const { createStructuredExportRuntime } = await import(
    pathToFileURL(
      path.join(
        __dirname,
        "..",
        "public",
        "src",
        "engines",
        "canvas2d-core",
        "export",
        "runtime",
        "createStructuredExportRuntime.js"
      )
    ).href
  );

  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (source) => {
    const target = String(source || "");
    fetchCalls.push(target);
    if (target.includes("missing-image.png")) {
      return {
        ok: false,
        blob: async () => new Blob([], { type: "image/png" }),
      };
    }
    return {
      ok: true,
      blob: async () => new Blob(["remote-image"], { type: "image/png" }),
    };
  };

  try {
    const adapter = createHostExportAssetAdapter({
      allowLocalFileAccess: true,
      readFileBase64: async (targetPath) => {
        if (String(targetPath || "").includes("local-image.png")) {
          return {
            ok: true,
            data: Buffer.from("local-image").toString("base64"),
            mime: "image/png",
          };
        }
        return { ok: false, data: "", mime: "" };
      },
    });

    const items = [
      {
        id: "img-local",
        type: "image",
        sourcePath: "C:\\temp\\local-image.png",
        dataUrl: "",
      },
      {
        id: "img-remote",
        type: "image",
        sourcePath: "",
        dataUrl: "https://example.com/image.png",
      },
      {
        id: "img-inline",
        type: "image",
        sourcePath: "",
        dataUrl: "data:image/png;base64,aGVsbG8=",
      },
      {
        id: "img-missing",
        type: "image",
        sourcePath: "C:\\temp\\missing-image.png",
        dataUrl: "",
      },
    ];

    const hydrated = await adapter.hydrateImageItems(items);
    assert.equal(hydrated.length, 4);
    assert.match(hydrated[0].dataUrl, /^data:image\/png;base64,/i, "local file source should hydrate into data url");
    assert.match(hydrated[1].dataUrl, /^data:image\/png;base64,/i, "remote source should hydrate into data url");
    assert.equal(hydrated[2].dataUrl, items[2].dataUrl, "existing inline data url should be preserved");
    assert.equal(hydrated[3].dataUrl, "", "missing image should not keep unsafe source");
    assert.equal(hydrated[3].sourcePath, "", "missing image should clear source path in export snapshot");
    assert.equal(hydrated[3].source, "missing", "missing image should switch to placeholder source");
    assert.equal(hydrated[3].exportFallbackPlaceholder, true, "missing image should mark export placeholder fallback");
    assert.deepEqual(fetchCalls, ["https://example.com/image.png", "/api/local-file?path=C%3A%5Ctemp%5Cmissing-image.png"]);

    const originalImage = globalThis.Image;
    globalThis.Image = class FakeImage {
      constructor() {
        this.complete = false;
        this.naturalWidth = 0;
        this.onload = null;
        this.onerror = null;
      }

      set src(value) {
        const target = String(value || "");
        if (target === String(hydrated[1].dataUrl || "")) {
          this.complete = false;
          setTimeout(() => {
            if (typeof this.onerror === "function") {
              this.onerror(new Error("load failed"));
            }
          }, 0);
          return;
        }
        this.complete = true;
        this.naturalWidth = 64;
        setTimeout(() => {
          if (typeof this.onload === "function") {
            this.onload();
          }
        }, 0);
      }
    };

    try {
      const preloadResult = await adapter.preloadImagesForItems(hydrated);
      assert.equal(preloadResult.ok, true, "preload result should be ok");
      assert.equal(preloadResult.fallbackCount, 2, "remote preload failure plus missing source should both fallback");
      assert.equal(preloadResult.items[1].exportFallbackPlaceholder, true, "failed remote preload should fallback");
      assert.equal(preloadResult.items[1].exportFallbackReason, "preload-failed", "failed remote preload should mark reason");
      assert.equal(preloadResult.items[3].exportFallbackPlaceholder, true, "missing source should remain fallback");

      let renderedItems = [];
      const runtime = createStructuredExportRuntime({
        renderer: {
          render({ items: nextItems }) {
            renderedItems = nextItems;
          },
        },
        getElementBounds: (item) => ({
          left: Number(item.x || 0),
          top: Number(item.y || 0),
          right: Number(item.x || 0) + Number(item.width || 1),
          bottom: Number(item.y || 0) + Number(item.height || 1),
          width: Number(item.width || 1),
          height: Number(item.height || 1),
        }),
        assetAdapter: adapter,
      });
      const sourceItem = {
        id: "runtime-local-image",
        type: "image",
        x: 0,
        y: 0,
        width: 160,
        height: 90,
        sourcePath: "C:\\temp\\local-image.png",
        dataUrl: "",
      };
      const snapshot = runtime.buildSnapshot({ items: [sourceItem], selectedIds: [] });
      assert.equal(snapshot.items[0].dataUrl, "", "runtime snapshot should not normalize local image before hydration");
      const originalDocument = globalThis.document;
      globalThis.document = {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({}),
        }),
      };
      try {
        await runtime.renderSnapshotToCanvas(snapshot);
      } finally {
        globalThis.document = originalDocument;
      }
      assert.equal(renderedItems.length, 1, "runtime renderer should receive the hydrated image item");
      assert.match(renderedItems[0].dataUrl, /^data:image\/png;base64,/i, "runtime renderer should receive hydrated image bytes");
      assert.notEqual(renderedItems[0].exportFallbackPlaceholder, true, "hydrated image must not become a text fallback");
    } finally {
      globalThis.Image = originalImage;
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          checked: hydrated.map((item) => ({
            id: item.id,
            hydrated: /^data:/i.test(String(item.dataUrl || "")),
          })),
          fetchCalls,
        },
        null,
        2
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
