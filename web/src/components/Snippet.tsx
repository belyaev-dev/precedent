import { MCP_URL } from "../site";
import { CopyButton } from "./CopyButton";

export const INSTALL = [
  { id: "claude", label: "Claude Code", where: "Run in a terminal", code: `claude mcp add --transport http precedent ${MCP_URL} \\\n  --header "Authorization: Bearer $PRECEDENT_KEY"` },
  { id: "cursor", label: "Cursor", where: ".cursor/mcp.json", code: `{\n  "mcpServers": {\n    "precedent": {\n      "url": "${MCP_URL}",\n      "headers": { "Authorization": "Bearer \${env:PRECEDENT_KEY}" }\n    }\n  }\n}` },
  { id: "codex", label: "Codex", where: "~/.codex/config.toml", code: `[mcp_servers.precedent]\nurl = "${MCP_URL}"\nbearer_token_env_var = "PRECEDENT_KEY"` },
  { id: "http", label: "Generic HTTP", where: "Run in a terminal", code: `curl ${MCP_URL} \\\n  -H "Authorization: Bearer $PRECEDENT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` },
];

export function Snippet({ label, code }: { label: string; code: string }) {
  return (
    <div className="snippet">
      <div className="snippet-head">
        <span>{label}</span>
        <CopyButton text={code} />
      </div>
      <pre>{code}</pre>
    </div>
  );
}
