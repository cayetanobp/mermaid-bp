import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function validateLinuxUpdaterAssetNames(names, {productName, version, architecture}) {
  if (!Array.isArray(names) || typeof productName !== 'string' || typeof version !== 'string' || typeof architecture !== 'string') {
    throw new Error('Faltan nombres de paquetes, producto, versión o arquitectura.');
  }
  const packages = names.filter(name => typeof name === 'string' && name.toLowerCase().endsWith('.deb'));
  if (packages.length !== 1) throw new Error('Se esperaba exactamente un paquete Debian.');
  const expected = `${productName}_${version}_${architecture}.deb`;
  if (packages[0] !== expected) throw new Error(`El paquete Debian debe llamarse ${expected}.`);
  return packages[0];
}

async function main() {
  const values = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith('--') || !args[i + 1] || values[args[i]]) throw new Error('Usa --names-file, --product-name, --version y --architecture.');
    values[args[i]] = args[i + 1];
  }
  for (const name of ['--names-file', '--product-name', '--version', '--architecture']) if (!values[name]) throw new Error(`Falta ${name}.`);
  const text = await readFile(values['--names-file'], 'utf8');
  const names = JSON.parse(text.replace(/^\uFEFF/, ''));
  process.stdout.write(`${validateLinuxUpdaterAssetNames(names, {
    productName: values['--product-name'], version: values['--version'], architecture: values['--architecture'],
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
