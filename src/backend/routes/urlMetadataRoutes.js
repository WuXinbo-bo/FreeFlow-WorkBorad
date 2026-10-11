const express = require("express");
const { fetchUrlMetadata } = require("../services/urlMetadataService");
function createUrlMetadataRouter() {
  const router = express.Router();
  let active = 0;
  const cache = new Map();
  router.get("/url-meta", async (req, res) => {
    const value = String(req.query.url || "");
    if (!value || value.length > 4096) return res.status(400).json({ ok: false, error: "网址无效" });
    const cached = cache.get(value);
    if (cached && Date.now() - cached.at < 3600000) return res.json({ ok: true, meta: cached.meta });
    if (active >= 4) return res.status(429).json({ ok: false, error: "链接读取繁忙，请稍后重试" });
    active += 1;
    try {
      const meta = await fetchUrlMetadata(value);
      cache.set(value, { at: Date.now(), meta });
      if (cache.size > 100) cache.delete(cache.keys().next().value);
      res.json({ ok: true, meta });
    } catch (error) { res.status(400).json({ ok: false, error: error.message || "链接读取失败" }); }
    finally { active -= 1; }
  });
  return router;
}
module.exports = { createUrlMetadataRouter };
