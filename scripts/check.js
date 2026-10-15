import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.filter(e => !['.git', 'node_modules', 'artifacts'].includes(e.name)).map(async e => {
    const file = path.join(directory, e.name);
    return e.isDirectory() ? files(file) : file.endsWith('.js') ? [file] : [];
  }))).flat();
}
const targets = await files('.');
for (const file of targets) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Syntax verified: ${targets.length} JavaScript files.`);
