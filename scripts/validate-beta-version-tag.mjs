import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function validateBetaVersionTagRefs(refs, version) {
  if (!Array.isArray(refs) || typeof version !== 'string' || !version) {
    throw new Error('Faltan las referencias de tags o la versión beta.');
  }
  const expectedRef = `refs/tags/${version}`;
  if (refs.flat().some(entry => entry?.ref === expectedRef)) {
    throw new Error(`Ya existe una etiqueta para esta versión: ${version}.`);
  }
  return 'available';
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--tags-file' || args[2] !== '--version') {
    throw new Error('Usa --tags-file y --version.');
  }
  const refs = JSON.parse((await readFile(args[1], 'utf8')).replace(/^\uFEFF/, ''));
  process.stdout.write(`${validateBetaVersionTagRefs(refs, args[3])}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
