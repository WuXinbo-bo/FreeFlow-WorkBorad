const crypto = require("crypto");

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function createGitHubMock({ owner = "fixture-user", repo = "private-workspace", branch = "main" } = {}) {
  const blobs = new Map();
  const trees = new Map([["tree-base", new Map()]]);
  const commits = new Map([["base", { tree: "tree-base", parents: [] }]]);
  const state = {
    head: "base",
    failBoardReads: 0,
    boardReadAttempts: 0,
    requestCount: 0,
    seenIfNoneMatch: [],
  };

  function shaFor(prefix, value) {
    return `${prefix}-${crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 12)}`;
  }

  function parseBody(options) {
    if (!options?.body) return {};
    return typeof options.body === "string" ? JSON.parse(options.body) : JSON.parse(Buffer.from(options.body).toString("utf8"));
  }

  function headersOf(options) {
    const input = options?.headers || {};
    return new Map(Object.entries(input).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  }

  async function fetchImpl(url, options = {}) {
    state.requestCount += 1;
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const method = String(options.method || "GET").toUpperCase();
    const headers = headersOf(options);
    if (pathname === "/user" && method === "GET") return jsonResponse({ login: owner, id: 42 });
    if (pathname === `/repos/${owner}/${repo}` && method === "GET") {
      return jsonResponse({ name: repo, private: true, owner: { login: owner }, default_branch: branch, permissions: { push: true } });
    }
    if (pathname === `/repos/${owner}/${repo}/git/ref/heads/${branch}` && method === "GET") {
      const etag = `W/\"head-${state.head}\"`;
      state.seenIfNoneMatch.push(headers.get("if-none-match") || "");
      if (headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag, "x-poll-interval": "30" } });
      return jsonResponse({ ref: `refs/heads/${branch}`, object: { type: "commit", sha: state.head } }, 200, { etag, "x-poll-interval": "30" });
    }
    if (pathname.startsWith(`/repos/${owner}/${repo}/git/commits/`) && method === "GET") {
      const sha = decodeURIComponent(pathname.split("/").pop());
      const commit = commits.get(sha);
      return commit ? jsonResponse({ sha, tree: { sha: commit.tree }, parents: commit.parents.map((parent) => ({ sha: parent })) }) : jsonResponse({ message: "Not Found" }, 404);
    }
    if (pathname.startsWith(`/repos/${owner}/${repo}/git/trees/`) && method === "GET") {
      const sha = decodeURIComponent(pathname.split("/git/trees/")[1].split("?")[0]);
      const tree = trees.get(sha);
      if (!tree) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ sha, truncated: false, tree: [...tree.entries()].map(([entryPath, blobSha]) => ({ path: entryPath, mode: "100644", type: "blob", sha: blobSha })) });
    }
    if (pathname === `/repos/${owner}/${repo}/git/blobs` && method === "POST") {
      const body = parseBody(options);
      const bytes = Buffer.from(String(body.content || "").replace(/\n/g, ""), body.encoding === "base64" ? "base64" : "utf8");
      const sha = shaFor("blob", bytes);
      blobs.set(sha, bytes);
      return jsonResponse({ sha, size: bytes.length }, 201);
    }
    if (pathname.startsWith(`/repos/${owner}/${repo}/git/blobs/`) && method === "GET") {
      const sha = decodeURIComponent(pathname.split("/git/blobs/")[1]);
      const currentTree = trees.get(commits.get(state.head)?.tree) || new Map();
      const boardBlob = [...currentTree.entries()].some(([entryPath, blobSha]) => entryPath.endsWith("/board.freeflow") && blobSha === sha);
      if (boardBlob) state.boardReadAttempts += 1;
      if (boardBlob && state.failBoardReads > 0) {
        state.failBoardReads -= 1;
        return jsonResponse({ message: "temporary download interruption" }, 503);
      }
      const bytes = blobs.get(sha);
      if (!bytes) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ sha, size: bytes.length, encoding: "base64", content: bytes.toString("base64") });
    }
    if (pathname === `/repos/${owner}/${repo}/git/trees` && method === "POST") {
      const body = parseBody(options);
      const baseTree = new Map(trees.get(body.base_tree) || []);
      for (const entry of body.tree || []) {
        if (entry.sha == null) baseTree.delete(entry.path);
        else baseTree.set(entry.path, entry.sha);
      }
      const sha = shaFor("tree", JSON.stringify([...baseTree.entries()]));
      trees.set(sha, baseTree);
      return jsonResponse({ sha }, 201);
    }
    if (pathname === `/repos/${owner}/${repo}/git/commits` && method === "POST") {
      const body = parseBody(options);
      const sha = shaFor("commit", `${body.tree}:${(body.parents || []).join(",")}:${body.message}`);
      commits.set(sha, { tree: body.tree, parents: body.parents || [] });
      return jsonResponse({ sha, tree: { sha: body.tree }, parents: (body.parents || []).map((parent) => ({ sha: parent })) }, 201);
    }
    if (pathname === `/repos/${owner}/${repo}/git/refs/heads/${branch}` && method === "PATCH") {
      const body = parseBody(options);
      const commit = commits.get(body.sha);
      if (!commit || (!body.force && !commit.parents.includes(state.head))) return jsonResponse({ message: "Update is not a fast forward" }, 409);
      state.head = body.sha;
      return jsonResponse({ ref: `refs/heads/${branch}`, object: { type: "commit", sha: state.head } });
    }
    if (pathname.startsWith(`/repos/${owner}/${repo}/contents/`) && method === "GET") {
      const remotePath = pathname.slice(`/repos/${owner}/${repo}/contents/`.length).split("/").map(decodeURIComponent).join("/");
      if (remotePath.endsWith("/board.freeflow") && state.failBoardReads > 0) {
        state.failBoardReads -= 1;
        return jsonResponse({ message: "temporary download interruption" }, 503);
      }
      const tree = trees.get(commits.get(state.head)?.tree) || new Map();
      const blobSha = tree.get(remotePath);
      const bytes = blobs.get(blobSha);
      if (!bytes) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ path: remotePath, encoding: "base64", content: bytes.toString("base64"), sha: blobSha });
    }
    return jsonResponse({ message: `Unexpected fixture request: ${method} ${pathname}` }, 500);
  }

  return { fetchImpl, state, blobs, trees, commits };
}

module.exports = { createGitHubMock };
