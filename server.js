const server = require("./core/server");

module.exports = server;

if (require.main === module) {
  server.startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
