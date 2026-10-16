// Only the public release verification key belongs in the application.
const ASSISTANT_PLUGIN_ID = "freeflow.ai-assistant";
const ASSISTANT_HOST_API_VERSION = 1;
const ASSISTANT_PLUGIN_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAoigOHUNnI0Ukh7uKu+fB4XxqY4Mb0b7bX+umseaYCXo=
-----END PUBLIC KEY-----
`;
// Inject an actual published HTTPS source when preparing the desktop release.
// An empty source keeps offline installation available without advertising a download.
const ASSISTANT_PLUGIN_CATALOG_URL = require("./assistantPluginRelease.json").catalogUrl;

module.exports = {
  ASSISTANT_PLUGIN_ID,
  ASSISTANT_HOST_API_VERSION,
  ASSISTANT_PLUGIN_PUBLIC_KEY,
  ASSISTANT_PLUGIN_CATALOG_URL,
};
