const express = require("express");

function sendError(res, error) {
  res.status(error.statusCode || 500).json({
    ok: false,
    error: error.message || "Agent request failed",
    code: error.code || "AGENT_REQUEST_FAILED",
  });
}

function createAgentRouter({ runtime, security }) {
  const router = express.Router();

  router.get("/bootstrap", security.bootstrap);
  router.use(security.requireAuth);

  router.get("/runtime", async (req, res) => {
    try {
      res.json({ ok: true, runtime: await runtime.getRuntimeStatus({ start: req.query.start === "1", refresh: req.query.refresh === "1" }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/runtime/restart", async (_req, res) => {
    try {
      res.json({ ok: true, runtime: await runtime.restart() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/runtime/login", async (req, res) => {
    try {
      res.json({ ok: true, login: await runtime.startLogin(req.body || {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/runtime/login/cancel", async (req, res) => {
    try {
      res.json({ ok: true, ...(await runtime.cancelLogin(req.body?.loginId)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/runtime/logout", async (_req, res) => {
    try {
      res.json({ ok: true, runtime: await runtime.logout() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/sessions", async (_req, res) => {
    try {
      res.json({ ok: true, sessions: await runtime.listSessions() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/sessions", async (req, res) => {
    try {
      res.status(201).json({ ok: true, session: await runtime.createSession(req.body || {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/sessions/:sessionId", async (req, res) => {
    try {
      const session = await runtime.getSession(req.params.sessionId);
      if (!session) return res.status(404).json({ ok: false, error: "会话不存在" });
      res.json({ ok: true, session });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/sessions/:sessionId", async (req, res) => {
    try {
      res.json({ ok: true, session: await runtime.renameSession(req.params.sessionId, req.body?.title) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/sessions/:sessionId", async (req, res) => {
    try {
      res.json({ ok: true, deleted: await runtime.deleteSession(req.params.sessionId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/sessions/:sessionId/fork", async (req, res) => {
    try {
      res.status(201).json({ ok: true, session: await runtime.forkSession(req.params.sessionId, req.body || {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/sessions/:sessionId/turns", async (req, res) => {
    try {
      res.status(202).json({ ok: true, ...(await runtime.startTurn(req.params.sessionId, req.body || {})) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/sessions/:sessionId/interrupt", async (req, res) => {
    try {
      res.json({ ok: true, ...(await runtime.interruptTurn(req.params.sessionId)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/sessions/:sessionId/queue/:pendingId", async (req, res) => {
    try {
      res.json({ ok: true, removed: await runtime.removePendingInput(req.params.sessionId, req.params.pendingId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/sessions/:sessionId/attachments", async (req, res) => {
    try {
      res.status(201).json({ ok: true, attachment: await runtime.importAttachment(req.params.sessionId, req.body || {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/sessions/:sessionId/attachments/:attachmentId", async (req, res) => {
    try {
      res.json({ ok: true, removed: await runtime.removeAttachment(req.params.sessionId, req.params.attachmentId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/approvals/:approvalId/resolve", async (req, res) => {
    try {
      res.json({ ok: true, response: await runtime.resolveApproval(req.params.approvalId, req.body || {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/sessions/:sessionId/events", async (req, res) => {
    const sessionId = req.params.sessionId;
    try {
      if (!(await runtime.getSession(sessionId))) return res.status(404).json({ ok: false, error: "会话不存在" });
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      let lastRevision = Math.max(0, Number(req.get("last-event-id") || req.query.after) || 0);
      let replaying = true;
      const buffered = [];
      const send = (event) => {
        if (!event || event.sessionId !== sessionId || event.revision <= lastRevision) return;
        lastRevision = event.revision;
        res.write(`id: ${event.revision}\nevent: agent-event\ndata: ${JSON.stringify(event)}\n\n`);
      };
      const listener = (event) => {
        if (event.sessionId !== sessionId) return;
        if (replaying) buffered.push(event);
        else send(event);
      };
      runtime.on("event", listener);
      for (const event of runtime.store.getEventsAfter(sessionId, lastRevision)) send(event);
      replaying = false;
      buffered.sort((a, b) => a.revision - b.revision).forEach(send);
      res.write(`event: ready\ndata: ${JSON.stringify({ revision: lastRevision })}\n\n`);
      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
      heartbeat.unref?.();
      const shutdown = () => res.end();
      runtime.once("shutdown", shutdown);
      req.once("close", () => {
        clearInterval(heartbeat);
        runtime.off("event", listener);
        runtime.off("shutdown", shutdown);
      });
    } catch (error) {
      if (!res.headersSent) sendError(res, error);
      else res.end();
    }
  });

  return router;
}

module.exports = { createAgentRouter, sendError };
