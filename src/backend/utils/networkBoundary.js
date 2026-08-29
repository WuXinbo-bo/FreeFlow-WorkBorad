function isLoopbackAddress(address = "") {
  const normalized = String(address || "").trim().toLowerCase();
  if (normalized === "::1") {
    return true;
  }
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ipv4)) {
    return false;
  }
  const octets = ipv4.split(".").map(Number);
  return octets.every((value) => value >= 0 && value <= 255) && octets[0] === 127;
}

function requireLoopbackRequest(req, res, next) {
  if (isLoopbackAddress(req.socket?.remoteAddress)) {
    next();
    return;
  }
  res.status(403).json({ ok: false, error: "Local requests only" });
}

module.exports = {
  isLoopbackAddress,
  requireLoopbackRequest,
};
