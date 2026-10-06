import type { ChatToolStep } from '@personal-design/ai-chat';

export async function readToolStatus(
  body: ReadableStream<Uint8Array>,
  {
    onStart,
    onEnd,
    active = () => true,
  }: {
    onStart: (step: ChatToolStep) => void;
    onEnd: (key: string, state: 'done' | 'error') => void;
    active?: () => boolean;
  },
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sequence = 0;
  let runningKey: string | null = null;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let newline = buffer.indexOf('\n'); newline >= 0; newline = buffer.indexOf('\n')) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let event: {
          type?: string;
          name?: string;
          label?: string;
          phase?: string;
          isError?: boolean;
        };
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type !== 'tool_status' || !event.name || !active()) continue;
        if (event.phase === 'start') {
          runningKey = `${event.name}-${++sequence}`;
          onStart({ key: runningKey, label: event.label || event.name, state: 'running' });
        } else if (event.phase === 'end' && runningKey) {
          onEnd(runningKey, event.isError ? 'error' : 'done');
          runningKey = null;
        }
      }
    }
  } catch {
    // 状态支路中断不影响主解析，分支随响应体取消而结束。
  } finally {
    reader.releaseLock();
  }
}
