// Shared CLI protocol fixture for source-runtime and installed-plugin checks.
if (process.argv.includes("--version")) {
  process.stdout.write("claude-cli fixture 1.0.0\n");
  process.exit(0);
}

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  const sessionId = process.argv.includes("--resume")
    ? process.argv[process.argv.indexOf("--resume") + 1]
    : process.argv[process.argv.indexOf("--session-id") + 1];
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: sessionId }) + "\n");
  if (prompt.includes("slow")) return setTimeout(() => {}, 10000);
  if (prompt.includes("permission failure")) {
    process.stdout.write(JSON.stringify({ type: "assistant", session_id: sessionId, message: { id: "permission-message", content: [{ type: "tool_use", id: "tool-1", name: "Write", input: {} }] } }) + "\n");
    process.stdout.write(JSON.stringify({ type: "user", session_id: sessionId, message: { content: [{ type: "tool_result", tool_use_id: "tool-1", is_error: true, content: "Permission denied" }] } }) + "\n");
    return process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: sessionId, result: "" }) + "\n");
  }
  if (prompt.includes("empty success")) {
    return process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: sessionId, result: "" }) + "\n");
  }
  if (prompt.includes("process failure")) {
    process.stderr.write("simulated Claude process failure");
    process.exitCode = 3;
    return;
  }
  const messageId = `message-${process.pid}`;
  process.stdout.write(JSON.stringify({ type: "stream_event", session_id: sessionId, event: { type: "message_start", message: { id: messageId } } }) + "\n");
  process.stdout.write(JSON.stringify({ type: "stream_event", session_id: sessionId, event: { type: "content_block_delta", delta: { type: "text_delta", text: "Claude " } } }) + "\n");
  process.stdout.write(JSON.stringify({ type: "assistant", session_id: sessionId, message: { id: messageId, content: [{ type: "text", text: "Claude reply" }] } }) + "\n");
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: sessionId, result: "Claude reply" }) + "\n");
});
