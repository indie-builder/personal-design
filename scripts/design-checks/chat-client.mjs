import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertChatStream } from './chat-stream-protocol.mjs';
import { baseUrl } from './harness.cjs';

export const message = (text, index = 0) => ({ id: 'm' + index, role: index % 2 ? 'assistant' : 'user', text });
export const reset = () => fetch('http://localhost:3907/reset');
export const requests = async () => (await fetch('http://localhost:3907/requests')).json();

export async function chatClient(agent) {
  const base = baseUrl('https://upgrade-check.personal-design.localhost');
  const origin = new URL(base);
  assert(origin.protocol === 'https:' && origin.hostname === 'upgrade-check.personal-design.localhost' && origin.pathname === '/' && !origin.search && !origin.hash && !origin.username && !origin.password, 'Use the isolated Portless test origin');
  const { schema } = JSON.parse(await readFile(new URL('../../apps/web/lib/openui-system-prompt.json', import.meta.url)));
  const post = (messages, extra = {}) => fetch(base + '/api/ai-chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, messages, ...extra }),
  });
  return { base, schema, post };
}

export async function output(response) {
  const lines = await ndjson(response);
  assert.equal(lines.at(-1).choices[0].finish_reason, 'stop');
  return lines.map((line) => line.choices[0].delta.content || '').join('');
}
const ndjson = async (response) => {
  assert.equal(response.status, 200);
  return (await response.text()).trim().split('\n').map(JSON.parse);
};
export const stream = async (response, options) => assertChatStream(await ndjson(response), options);
