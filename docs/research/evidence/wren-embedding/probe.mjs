import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
const start = performance.now();
const child = spawn(process.env.WREN_PROBE_PYTHON || 'python3',
  [new URL('./probe.py', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });
let stdout = '', stderr = '';
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
child.stdout.on('data', s => stdout += s); child.stderr.on('data', s => stderr += s);
child.stdin.end(JSON.stringify({cube:'sales', measures:['net_revenue'], dimensions:['region'],
  filters:[{dimension:'status', operator:'eq', value:'paid'}]}));
child.on('error', e => { console.error(e); process.exitCode = 1; });
child.on('close', code => {
  assert.equal(code, 0, stderr);
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 2);
  assert.equal(result.unknown_metric_rejected, true);
  console.log(JSON.stringify({node:process.version, total_ms:Math.round(performance.now()-start), ...result}, null, 2));
});
