#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = process.env.DIVIDENDX_PROBE_ROOT ?? '/opt/dividendx';
assert.ok(['/opt/dividendx', '/vercel/sandbox/dividendx'].includes(ROOT),
  'DIVIDENDX_PROBE_ROOT must be a reviewed runtime root');
const EXPECTED_ELF = 'a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070';
const EXPECTED_IDL = 'd4953c8a234e1b235e07db92f464dfb0033b62ff41bf378657fe1357a3211da4';
const TIMEOUT_MS = 12 * 60_000;

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function memoryBytes() {
  for (const path of ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes']) {
    try { return Number.parseInt((await readFile(path, 'utf8')).trim(), 10); } catch {}
  }
  return null;
}

function capture(command, args, options = {}) {
  const { timeoutMs = TIMEOUT_MS, ...spawnOptions } = options;
  const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...spawnOptions });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-100_000); });
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-100_000); });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);
  timeout.unref();
  const completion = new Promise((resolveCompletion, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolveCompletion({ code, signal, timedOut, stdout, stderr });
    });
  });
  return { child, completion, output: () => ({ stdout, stderr }) };
}

async function withMemorySampling(action) {
  let peak = await memoryBytes();
  let stopped = false;
  const sample = async () => {
    while (!stopped) {
      const current = await memoryBytes();
      if (current !== null) peak = Math.max(peak ?? 0, current);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  };
  const sampler = sample();
  let value;
  let failure;
  try { value = await action(); } catch (error) { failure = error; }
  stopped = true;
  await sampler;
  const final = await memoryBytes();
  if (final !== null) peak = Math.max(peak ?? 0, final);
  if (failure) throw failure;
  return { value, peakBytes: peak };
}

async function waitForWalletReady(processHandle) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    if (processHandle.child.exitCode !== null) {
      const output = processHandle.output();
      throw new Error(`wallet runtime exited during startup (${processHandle.child.exitCode}): ${output.stderr || output.stdout}`);
    }
    try {
      const response = await fetch('http://127.0.0.1:4180/manifest', { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return { manifest: await response.json(), startupMs: Date.now() - started };
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`wallet runtime startup exceeded ${TIMEOUT_MS}ms`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveWait) => child.once('exit', resolveWait)),
    new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function nativeProbe() {
  const packageRequire = createRequire(resolve(ROOT, 'packages/local-runtime/package.json'));
  const surfpoolPath = packageRequire.resolve('@solana/surfpool');
  const nativePackage = packageRequire('@solana/surfpool-linux-x64-gnu/package.json');
  const started = process.hrtime.bigint();
  await import(pathToFileURL(surfpoolPath));
  const loadMs = Number(process.hrtime.bigint() - started) / 1e6;
  const report = process.report.getReport();
  return {
    mode: 'native',
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    glibcRuntime: report.header.glibcVersionRuntime,
    glibcCompiler: report.header.glibcVersionCompiler,
    surfpoolNative: { name: nativePackage.name, version: nativePackage.version },
    loaderMs: Math.round(loadMs * 100) / 100,
    rssBytes: process.memoryUsage().rss,
    cgroupMemoryBytes: await memoryBytes(),
  };
}

async function walletProbe() {
  const runtime = capture('node', ['packages/local-runtime/src/server.mjs']);
  const started = Date.now();
  try {
    const ready = await waitForWalletReady(runtime);
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
    const idleBytes = await memoryBytes();
    // The existing smoke completes its assertions but web3 may retain a WS
    // handle. Exit explicitly after its top-level await has finished.
    const smoke = capture('node', ['--input-type=module', '--eval',
      'await import("./scripts/protocol/wallet-runtime-smoke.mjs"); process.exit(process.exitCode ?? 0);']);
    const completed = await smoke.completion;
    assert.equal(completed.timedOut, false, `wallet smoke exceeded ${TIMEOUT_MS}ms`);
    assert.equal(completed.code, 0, completed.stderr || completed.stdout);
    return {
      mode: 'wallet',
      startupMs: ready.startupMs,
      idleCgroupMemoryBytes: idleBytes,
      journeyMs: Date.now() - started - ready.startupMs,
      runtimeId: ready.manifest.runtimeId,
      genesisHash: ready.manifest.genesisHash,
      smoke: JSON.parse(completed.stdout.trim().split('\n').at(-1)),
    };
  } finally {
    await stop(runtime.child);
  }
}

async function guidedProbe() {
  const started = Date.now();
  const smoke = capture('node', ['packages/guided-runtime/dist/scripts/smoke.js']);
  const completed = await smoke.completion;
  assert.equal(completed.timedOut, false, `guided smoke exceeded ${TIMEOUT_MS}ms`);
  assert.equal(completed.code, 0, completed.stderr || completed.stdout);
  return {
    mode: 'guided',
    journeyMs: Date.now() - started,
    smoke: JSON.parse(completed.stdout.trim()),
  };
}

async function main() {
  const mode = process.argv[2] ?? 'native';
  const hashes = {
    dividendXElfSha256: await sha256(resolve(ROOT, 'target/deploy/dividendx.so')),
    transactionIdlSha256: await sha256(resolve(ROOT, 'packages/transaction-sdk/idl/dividendx.json')),
  };
  assert.equal(hashes.dividendXElfSha256, EXPECTED_ELF);
  assert.equal(hashes.transactionIdlSha256, EXPECTED_IDL);
  const probe = mode === 'native' ? nativeProbe : mode === 'wallet' ? walletProbe : mode === 'guided' ? guidedProbe : null;
  assert.ok(probe, `unknown probe mode: ${mode}`);
  const measured = await withMemorySampling(probe);
  process.stdout.write(`${JSON.stringify({ ok: true, hashes, ...measured.value, peakCgroupMemoryBytes: measured.peakBytes }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.stack : String(error) })}\n`);
  process.exitCode = 1;
});
