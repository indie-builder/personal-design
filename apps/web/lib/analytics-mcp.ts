import 'server-only';

// 智能问数数据服务的 MCP 桥接。服务端是无状态 Streamable HTTP,每请求新建客户端。
const DEFAULT_MCP_URL = 'https://wrenai-hr-mcp.vercel.app/mcp';
const TOOL_TIMEOUT_MS = 30_000;
const TOOL_TEXT_LIMIT = 20_000;

export interface AnalyticsToolCallResult {
  text: string;
  isError: boolean;
}

export interface AnalyticsMcpClient {
  call(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<AnalyticsToolCallResult>;
  close(): Promise<void>;
}

export function truncateToolText(text: string, limit = TOOL_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n…（结果已截断，以上仅为部分数据，回答中必须说明数据不完整）`;
}

export async function connectAnalyticsMcp(): Promise<AnalyticsMcpClient> {
  const token = process.env.ANALYTICS_MCP_TOKEN;
  if (!token) {
    return {
      call: async () => ({
        text: '数据服务尚未配置，暂时无法查询数据。请直接告知用户当前数据服务不可用。',
        isError: true,
      }),
      close: async () => {},
    };
  }
  const url = process.env.ANALYTICS_MCP_URL || DEFAULT_MCP_URL;
  const { McpClient, StreamableHttpTransport } = await import('@earendil-works/pi-mcp');
  const client = new McpClient({ name: 'personal-design-ai-chat', version: '1.0.0' });
  await client.connect(
    new StreamableHttpTransport({
      url,
      headers: { Authorization: `Bearer ${token}` },
      openGetStream: false,
    }),
  );
  return {
    async call(name, args, signal) {
      const timeout = AbortSignal.timeout(TOOL_TIMEOUT_MS);
      try {
        const result = await client.callTool(name, args, {
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        const structured =
          result.structuredContent !== undefined ? JSON.stringify(result.structuredContent) : '';
        const text = [
          structured,
          ...result.content.map((block) => (block.type === 'text' ? block.text : '')),
        ]
          .filter(Boolean)
          .join('\n');
        return { text: truncateToolText(text || '（空结果）'), isError: result.isError === true };
      } catch (error) {
        return {
          text: `查询失败：${error instanceof Error ? error.message : '未知错误'}。请向用户说明查询未完成。`,
          isError: true,
        };
      }
    },
    close: () => client.close(),
  };
}
