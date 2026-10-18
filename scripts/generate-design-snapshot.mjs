import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../.impeccable/design/', import.meta.url);
const destination = new URL('../.impeccable/design.json', import.meta.url);
const read = async (file) => JSON.parse(await readFile(new URL(file, source), 'utf8'));

try {
  const { componentFiles, ...metadata } = await read('metadata.json');
  const extensions = await read('extensions.json');
  const components = await Promise.all(componentFiles.map(read));
  const narrative = await read('narrative.json');
  const content =
    JSON.stringify({ ...metadata, extensions, components, narrative }, null, 2) + '\n';
  const existing = await readFile(destination, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  if (existing !== content) {
    if (process.argv.includes('--check')) {
      throw new Error('Design snapshot is missing or stale. Run pnpm generate:design.');
    }
    await writeFile(destination, content);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
