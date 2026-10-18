import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const cli = join(root, 'desktop-app', 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const keyPath = join(process.env.RUNNER_TEMP ?? tmpdir(), `mermaid-bp-ci-${randomUUID()}.key`);
const result = spawnSync(process.execPath, [cli, 'signer', 'generate', '--ci', '--write-keys', keyPath], { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error(`Tauri CI signer key generation failed (exit ${result.status ?? result.signal}).`);
const privateKey = await readFile(keyPath, 'utf8');
const publicKey = (await readFile(`${keyPath}.pub`, 'utf8')).trim();
if (!privateKey.trim() || !publicKey) throw new Error('Generated CI updater keypair is incomplete.');
const envPath = process.env.GITHUB_ENV;
if (!envPath) throw new Error('GITHUB_ENV is required to export the temporary CI updater key.');
await writeFile(envPath, `TAURI_SIGNING_PRIVATE_KEY=${keyPath}\nTAURI_SIGNING_PRIVATE_KEY_PASSWORD=\nMERMAID_BP_CI_UPDATER_PUBKEY=${publicKey}\n`, { flag: 'a' });
