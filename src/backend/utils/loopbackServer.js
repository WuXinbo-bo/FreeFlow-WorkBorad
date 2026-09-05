function listenOnLoopback(server, preferredPort) {
  return new Promise((resolve, reject) => {
    function attempt(port) {
      function onListening() {
        server.removeListener("error", onError);
        resolve(server);
      }
      function onError(error) {
        server.removeListener("listening", onListening);
        if (port !== 0 && error.code === "EADDRINUSE") {
          attempt(0);
        } else {
          reject(error);
        }
      }
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    }
    attempt(preferredPort);
  });
}

module.exports = { listenOnLoopback };
