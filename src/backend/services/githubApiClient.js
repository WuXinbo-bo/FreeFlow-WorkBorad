const DEFAULT_API_BASE_URL = "https://api.github.com";

class GitHubApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GitHubApiError";
    Object.assign(this, details);
  }
}

class GitHubApiClient {
  constructor(options = {}) {
    this.token = String(options.token || "").trim();
    this.apiBaseUrl = String(options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.lastResponseMeta = null;
    if (typeof this.fetchImpl !== "function") throw new Error("当前运行环境不支持 fetch");
  }

  getHeader(headers, name) {
    if (!headers) return "";
    if (typeof headers.get === "function") return String(headers.get(name) || "");
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    return key ? String(headers[key] || "") : "";
  }

  parseRetryAfter(headers) {
    const value = this.getHeader(headers, "retry-after");
    if (!value) return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, Math.min(30_000, seconds * 1000));
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, Math.min(30_000, timestamp - Date.now())) : 0;
  }

  async waitBeforeRetry(delayMs) {
    const delay = Math.max(0, Math.min(30_000, Number(delayMs) || 0));
    if (!delay) return;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async requestWithMeta(pathname, options = {}) {
    const { retryLimit: configuredRetryLimit, ...requestOptions } = options || {};
    const method = String(requestOptions.method || "GET").toUpperCase();
    const retryLimit = configuredRetryLimit == null
      ? (["GET", "HEAD"].includes(method) ? 2 : 0)
      : Math.max(0, Math.min(3, Number(configuredRetryLimit) || 0));
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(requestOptions.headers || {}),
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    for (let attempt = 0; ; attempt += 1) {
      const response = await this.fetchImpl(`${this.apiBaseUrl}${pathname}`, { signal: AbortSignal.timeout(20000), ...requestOptions, headers });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      const meta = {
        status: response.status,
        etag: this.getHeader(response.headers, "etag"),
        requestId: this.getHeader(response.headers, "x-github-request-id"),
        retryAfterMs: this.parseRetryAfter(response.headers),
        pollInterval: Number(this.getHeader(response.headers, "x-poll-interval")) || null,
        deprecation: this.getHeader(response.headers, "deprecation"),
        sunset: this.getHeader(response.headers, "sunset"),
        rateLimit: {
          limit: Number(this.getHeader(response.headers, "x-ratelimit-limit")) || null,
          remaining: Number(this.getHeader(response.headers, "x-ratelimit-remaining")) || null,
          resetAt: Number(this.getHeader(response.headers, "x-ratelimit-reset")) || null,
          used: Number(this.getHeader(response.headers, "x-ratelimit-used")) || null,
        },
      };
      this.lastResponseMeta = meta;
      if (response.ok || response.status === 304) return { body, meta };
      const message = String(body?.message || "").toLowerCase();
      const rateLimited = response.status === 429 ||
        (response.status === 403 && (meta.rateLimit.remaining === 0 || message.includes("rate limit") || message.includes("secondary")));
      const transient = [502, 503, 504].includes(response.status);
      if (attempt < retryLimit && (rateLimited || transient)) {
        const backoff = meta.retryAfterMs || Math.min(5_000, 250 * (2 ** attempt));
        await this.waitBeforeRetry(backoff);
        continue;
      }
      throw new GitHubApiError(body?.message || `GitHub API 请求失败 (${response.status})`, {
        status: response.status,
        response: body,
        headers: response.headers,
        meta,
      });
    }
  }

  async request(pathname, options = {}) {
    return (await this.requestWithMeta(pathname, options)).body;
  }

  getUser() { return this.request("/user"); }

  getRepository(owner, repo) {
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  listRepositories({ perPage = 100 } = {}) {
    return this.request(`/user/repos?per_page=${Math.min(100, Math.max(1, Number(perPage) || 100))}&sort=updated`);
  }

  async createPrivateRepository(name = "freeflow-workspace", description = "FreeFlow personal workspace") {
    try {
      return await this.request("/user/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, private: true, auto_init: true }),
      });
    } catch (error) {
      if (!error.status || error.status < 500) throw error;
      const user = await this.getUser();
      try {
        const existing = await this.getRepository(user.login, name);
        if (!existing.private) throw error;
        return existing;
      } catch (lookupError) {
        if (lookupError.status !== 404) throw lookupError;
      }
      const result = await this.request("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "mutation($name:String!,$description:String!){createRepository(input:{name:$name,description:$description,visibility:PRIVATE}){repository{name}}}",
          variables: { name, description },
        }),
      });
      if (!result?.data?.createRepository?.repository?.name) {
        throw new GitHubApiError(result?.errors?.[0]?.message || "无法创建私有仓库，请在 GitHub 创建后重新加载仓库列表", { status: 502 });
      }
      const repository = await this.getRepository(user.login, name);
      if (repository.private !== true || repository.owner?.login !== user.login) throw new GitHubApiError("GitHub 未返回本人私有仓库", { status: 502 });
      await this.request(`/repos/${encodeURIComponent(user.login)}/${encodeURIComponent(name)}/contents/.freeflow/README.md`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Initialize FreeFlow workspace", content: Buffer.from("# FreeFlow workspace\n").toString("base64") }),
      });
      return repository;
    }
  }

  getBranchHead(owner, repo, branch = "main", options = {}) {
    const headers = options.etag ? { "If-None-Match": options.etag } : undefined;
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
  }

  getCommit(owner, repo, sha) {
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(sha)}`);
  }

  getContent(owner, repo, filePath, ref = "main") {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}${query}`);
  }

  getTree(owner, repo, treeSha, { recursive = true } = {}) {
    const query = recursive ? "?recursive=1" : "";
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}${query}`);
  }

  getBlob(owner, repo, blobSha) {
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(blobSha)}`);
  }

  async getBranchSnapshot(owner, repo, branch = "main") {
    const head = await this.getBranchHead(owner, repo, branch);
    const commitSha = String(head?.object?.sha || "");
    if (!commitSha) throw new GitHubApiError("GitHub 分支没有可用的 HEAD", { status: 502 });
    return this.getSnapshotAtCommit(owner, repo, commitSha, branch);
  }

  async getSnapshotAtCommit(owner, repo, commitSha, branch = "main") {
    const resolvedCommitSha = String(commitSha || "").trim();
    if (!resolvedCommitSha) throw new GitHubApiError("GitHub 提交没有可用的 SHA", { status: 400, code: "INVALID_COMMIT_SHA" });
    const commit = await this.getCommit(owner, repo, resolvedCommitSha);
    const treeSha = String(commit?.tree?.sha || "");
    if (!treeSha) throw new GitHubApiError("GitHub 提交没有可用的 tree", { status: 502 });
    const tree = await this.getTree(owner, repo, treeSha, { recursive: true });
    if (tree?.truncated) throw new GitHubApiError("GitHub 远程文件树过大，无法安全读取同步索引", { status: 413, code: "REMOTE_TREE_TRUNCATED" });
    return { branch, commitSha: resolvedCommitSha, treeSha, entries: Array.isArray(tree?.tree) ? tree.tree : [] };
  }

  async getFilesAtSnapshot(owner, repo, snapshot, filePaths = []) {
    const wanted = new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => String(item || "").replace(/^\/+/, "")));
    const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
    const files = {};
    for (const entry of entries) {
      if (entry?.type !== "blob" || !wanted.has(String(entry.path || "")) || !entry.sha) continue;
      const blob = await this.getBlob(owner, repo, entry.sha);
      files[entry.path] = { ...entry, blob };
    }
    return files;
  }

  async createCommit({ owner, repo, branch = "main", message, files = [], expectedBaseSha = "" }) {
    const head = await this.getBranchHead(owner, repo, branch);
    const baseCommitSha = String(head?.object?.sha || "");
    if (!baseCommitSha) throw new GitHubApiError("GitHub 分支没有可用的 HEAD", { status: 502 });
    const expected = String(expectedBaseSha || "").trim();
    if (expected && expected !== baseCommitSha) {
      throw new GitHubApiError("远端分支已变化，请先拉取并处理冲突", {
        status: 409,
        code: "REMOTE_CHANGED",
        expectedBaseSha: expected,
        currentBaseSha: baseCommitSha,
      });
    }
    const baseCommit = await this.getCommit(owner, repo, baseCommitSha);
    const treeEntries = [];
    const uniqueFiles = new Map();
    for (const file of Array.isArray(files) ? files : []) {
      const filePath = String(file?.path || "").replace(/^\/+/, "");
      if (!filePath || filePath.split("/").some((segment) => segment === "..")) {
        throw new GitHubApiError(`同步文件路径无效: ${filePath || "(empty)"}`, { status: 400, code: "INVALID_SYNC_PATH" });
      }
      uniqueFiles.set(filePath, { ...file, path: filePath });
    }
    for (const file of uniqueFiles.values()) {
      const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content || ""), "utf8");
      const blob = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
      });
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const tree = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseCommit.tree?.sha || undefined, tree: treeEntries }),
    });
    const commit = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: String(message || "Update FreeFlow workspace"), tree: tree.sha, parents: [baseCommitSha] }),
    });
    try {
      await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
    } catch (error) {
      if (error.status === 409 || error.status === 422) error.code = "REMOTE_CHANGED";
      throw error;
    }
    return { commitSha: commit.sha, baseCommitSha, treeSha: tree.sha, meta: this.lastResponseMeta };
  }
}

module.exports = { DEFAULT_API_BASE_URL, GitHubApiError, GitHubApiClient };
