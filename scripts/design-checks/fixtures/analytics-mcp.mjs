// Local, stateless JSON-RPC data fixture; never used by the normal application.
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

createServer(async (request, response) => {
  let source = '';
  for await (const chunk of request) source += chunk;
  let message;
  try {
    message = JSON.parse(source);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (request.headers.authorization !== 'Bearer test-only') {
    response.writeHead(401).end();
    return;
  }
  if (message.id === undefined) {
    response.writeHead(202).end();
    return;
  }
  let result;
  if (message.method === 'initialize') {
    result = {
      protocolVersion: message.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'local-analytics-fixture', version: '1' },
    };
  } else if (message.method === 'tools/call') {
    await delay(650);
    const name = message.params.name;
    const isError = name === 'describe_cube';
    const value = isError
      ? { error: 'Fixture: metric definition temporarily unavailable' }
      : name === 'get_context'
        ? { snapshot_date: '2026-08-31', company: '星辰科技（测试夹具）' }
        : { columns: ['headcount'], rows: [[528]], complete: true, snapshot_date: '2026-08-31' };
    result = { content: [{ type: 'text', text: JSON.stringify(value) }], isError };
  } else if (message.method === 'tools/list') {
    result = { tools: [] };
  } else {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not found' },
      }),
    );
    return;
  }
  response
    .writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
}).listen(3908, '127.0.0.1', () => console.log('Test data provider: http://127.0.0.1:3908/mcp'));
