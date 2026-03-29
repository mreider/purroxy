/**
 * Generate MCP server configuration for Claude Desktop.
 *
 * ONE server entry — Purroxy discovers all sites automatically.
 * Users paste this once into:
 *   ~/Library/Application Support/Claude/claude_desktop_config.json
 */

export interface McpConfig {
  [serverName: string]: {
    command: string;
    args: string[];
  };
}

/**
 * Generate the unified Purroxy MCP config.
 * @param profilesDir  Path to the profiles directory (all sites live here)
 * @param mcpServerScript  Path to the mcp-server.js entry point
 */
export function generateMcpConfig(
  profilesDir: string,
  mcpServerScript: string
): McpConfig {
  return {
    purroxy: {
      command: 'node',
      args: [mcpServerScript, '--profiles-dir', profilesDir],
    },
  };
}
