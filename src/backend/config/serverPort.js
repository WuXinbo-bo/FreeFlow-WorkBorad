const DEFAULT_PORT = 53127;

function resolveServerPort({ desktop = false } = {}) {
  const configured = process.env.FREEFLOW_PORT || (!desktop && process.env.PORT);
  const port = configured ? Number(configured) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("FreeFlow port must be an integer between 0 and 65535");
  }
  return port;
}

module.exports = { DEFAULT_PORT, resolveServerPort };
