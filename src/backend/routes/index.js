const { createPersistenceRouter } = require("./persistenceRoutes");

function registerAppRoutes(app, deps) {
  app.use("/api", createPersistenceRouter(deps));
}

module.exports = {
  registerAppRoutes,
};
