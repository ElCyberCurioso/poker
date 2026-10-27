import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.js'));
let failed = 0;
for (const f of files) {
  const mod = await import('./' + f);
  const t0 = Date.now();
  try {
    await mod.run(assert);
    console.log(`✓ ${f} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    console.error(`✗ ${f}\n`, e);
  }
}
process.exit(failed ? 1 : 0);
