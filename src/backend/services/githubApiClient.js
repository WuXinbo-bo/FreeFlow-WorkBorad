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
    if (typeof this.fetchImpl !== "function") throw new Error("当前运行环境不支持 fetch");
  }

  async request(pathname, options = {}) {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await this.fetchImpl(`${this.apiBaseUrl}${pathname}`, { signal: AbortSignal.timeout(20000), ...options, headers });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
      throw new GitHubApiError(body?.message || `GitHub API 请求失败 (${response.status})`, {
        status: response.status,
        response: body,
        headers: response.headers,
      });
    }
    return body;
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

  getBranchHead(owner, repo, branch = "main") {
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`);
  }

  getCommit(owner, repo, sha) {
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(sha)}`);
  }

  getContent(owner, repo, filePath, ref = "main") {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}${query}`);
  }

  async createCommit({ owner, repo, branch = "main", message, files = [] }) {
    const head = await this.getBranchHead(owner, repo, branch);
    const baseCommitSha = String(head?.object?.sha || "");
    if (!baseCommitSha) throw new GitHubApiError("GitHub 分支没有可用的 HEAD", { status: 502 });
    const baseCommit = await this.getCommit(owner, repo, baseCommitSha);
    const treeEntries = [];
    for (const file of files) {
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
    return { commitSha: commit.sha, baseCommitSha, treeSha: tree.sha };
  }
}

module.exports = { DEFAULT_API_BASE_URL, GitHubApiError, GitHubApiClient };
