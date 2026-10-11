const dns = require("node:dns/promises");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");

const blocked = new net.BlockList();
for (const [address, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]]) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["2001:db8::",32],["2001::",32],["2002::",16]]) blocked.addSubnet(address, prefix, "ipv6");
const publicV6 = new net.BlockList(); publicV6.addSubnet("2000::", 3, "ipv6");
function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) return publicV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
  return false;
}
function normalizeTarget(value) {
  const url = new URL(String(value || ""));
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("仅支持公开 HTTP/HTTPS 网页");
  url.hash = "";
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || /(^|\.)(localhost|local|internal|test|invalid)$/i.test(hostname)) throw new Error("不能抓取本机或内部网络地址");
  return url;
}
async function resolvePublicTarget(url, lookup = dns.lookup) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new Error("不能抓取本机或内部网络地址");
  return addresses[0];
}
function requestPage(url, pinned, signal) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(url, {
      signal, timeout: 4500,
      headers: { "User-Agent": "FreeFlow-LinkMetadata/1.0", Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity" },
      lookup: (_hostname, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
    }, (response) => {
      if ([301,302,303,307,308].includes(response.statusCode)) { response.resume(); resolve({ redirect: response.headers.location }); return; }
      if (response.statusCode < 200 || response.statusCode >= 300) { response.destroy(); reject(new Error(`网页返回 ${response.statusCode}`)); return; }
      if (!/^(text\/html|application\/xhtml\+xml)/i.test(response.headers["content-type"] || "")) { response.destroy(); reject(new Error("目标不是网页")); return; }
      if (Number(response.headers["content-length"]) > 262144 || ![undefined, "identity"].includes(response.headers["content-encoding"])) { response.destroy(); reject(new Error("网页响应超过读取限制")); return; }
      const chunks = []; let size = 0;
      response.on("data", (chunk) => { size += chunk.length; if (size > 262144) { response.destroy(new Error("网页响应超过读取限制")); return; } chunks.push(chunk); });
      response.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8") })); response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("网页读取超时"))); request.on("error", reject);
  });
}
function plainText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (entity) => ({ "&amp;":"&", "&lt;":"<", "&gt;":">", "&quot;":'"', "&apos;":"'", "&nbsp;":" " })[entity]).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}
async function fetchUrlMetadata(value, { lookup = dns.lookup, request = requestPage } = {}) {
  let url = normalizeTarget(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    for (let hop = 0; hop <= 3; hop += 1) {
      const pinned = await Promise.race([resolvePublicTarget(url, lookup), new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("网页读取超时")), { once: true }))]);
      if (controller.signal.aborted) throw new Error("网页读取超时");
      const response = await request(url, pinned, controller.signal);
      if (response.redirect) { if (hop === 3) throw new Error("网页重定向过多"); url = normalizeTarget(new URL(response.redirect, url).toString()); continue; }
      const title = plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(response.html)?.[1]) || url.hostname;
      return { url: String(url), domain: url.hostname, title, description: "", siteName: url.hostname, fetchState: "ready", updatedAt: Date.now() };
    }
    throw new Error("网页无法读取");
  } finally { clearTimeout(timer); }
}
module.exports = { fetchUrlMetadata, isPublicAddress, normalizeTarget, resolvePublicTarget };
