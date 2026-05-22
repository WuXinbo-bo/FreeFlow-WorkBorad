const path = require("path");
const { loadEnvFileSync } = require("./src/backend/utils/envLoader");

loadEnvFileSync(path.join(__dirname, ".env"));

const server = require("./src/backend");

module.exports = server;

if (require.main === module) {
  server.startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
