const assert = require("node:assert/strict");
const { fetchUrlMetadata, isPublicAddress, normalizeTarget } = require("../src/backend/services/urlMetadataService");
async function main() {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1"]) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true); assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  for (const url of ["file:///etc/passwd", "http://localhost", "https://user:pass@example.com", "http://example.com:8080"]) assert.throws(() => normalizeTarget(url));
  let requests = 0;
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const safe = await fetchUrlMetadata("https://example.com/", { lookup, request: async (_url, pinned) => { requests += 1; assert.equal(pinned.address, "93.184.216.34"); return { html: '<title>Research &amp; Notes</title><script>bad()</script>' }; } });
  assert.equal(safe.title, "Research & Notes"); assert.equal(requests, 1);
  await assert.rejects(fetchUrlMetadata("https://example.com", { lookup: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }], request: async () => { throw new Error("must not run"); } }), /内部网络/);
  requests = 0;
  await assert.rejects(fetchUrlMetadata("https://example.com", { lookup, request: async () => { requests += 1; return { redirect: "http://127.0.0.1/private" }; } }), /内部网络/);
  assert.equal(requests, 1);
  const { parseStandaloneUrls } = await import("../public/src/engines/canvas2d-core/collection/collectionModel.js");
  assert.equal(parseStandaloneUrls({ text: "https://example.com\nhttps://github.com" }).length, 2);
  assert.equal(parseStandaloneUrls({ text: "文章 https://example.com" }).length, 0);
  assert.equal(parseStandaloneUrls({ text: "https://example.com", html: "<pre>https://example.com</pre>" }).length, 0);
  // Real public network read, separate from injected boundary tests.
  if (process.env.FREEFLOW_TEST_LIVE_LINK === "1") {
    const actual = await fetchUrlMetadata("https://example.com");
    assert(actual.title.length > 0);
    console.log(`[link-metadata] actual HTTPS read passed (${actual.title})`);
  }
  console.log("[link-metadata] SSRF DNS/IPv4/IPv6/redirect boundaries and pinned address passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
