// Only the public release verification key belongs in the application.
const ASSISTANT_PLUGIN_ID = "freeflow.ai-assistant";
const ASSISTANT_HOST_API_VERSION = 1;
const ASSISTANT_PLUGIN_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAoigOHUNnI0Ukh7uKu+fB4XxqY4Mb0b7bX+umseaYCXo=
-----END PUBLIC KEY-----
`;
// Set a default only after the signed catalog and package have been published.
const ASSISTANT_PLUGIN_CATALOG_URL = "";

module.exports = {
  ASSISTANT_PLUGIN_ID,
  ASSISTANT_HOST_API_VERSION,
  ASSISTANT_PLUGIN_PUBLIC_KEY,
  ASSISTANT_PLUGIN_CATALOG_URL,
};
