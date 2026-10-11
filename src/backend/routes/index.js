const { createUrlMetadataRouter } = require("./urlMetadataRoutes");
const { createPersistenceRouter } = require("./persistenceRoutes");

function registerAppRoutes(app, deps) {
  app.use("/api", createPersistenceRouter(deps));
  app.use("/api", createUrlMetadataRouter());
}

module.exports = {
  registerAppRoutes,
};
