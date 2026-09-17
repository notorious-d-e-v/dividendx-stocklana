import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(packageRoot, '../../programs/dividendx/idl/dividendx.json');
const destination = resolve(packageRoot, 'idl/dividendx.json');
await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
process.stdout.write('Synced genuine program IDL to the transaction SDK.\n');
