import { APIError, Sandbox } from '@vercel/sandbox';
import { PROVIDER_COMMAND, PROVIDER_PORT, PROVIDER_ROOT, type SandboxKind } from './contract.js';

export type ProviderStatus = 'pending' | 'running' | 'stopping' | 'stopped' | 'failed' | 'aborted' | 'snapshotting' | 'missing';
export interface ProviderView { name: string; status: ProviderStatus; expiresAt: string | null; domain: string | null }
export interface CreatedProvider extends ProviderView { launch(): Promise<void> }
export interface SandboxProvider {
  create(input: { name: string; kind: SandboxKind; token: string; expiresAt: string }): Promise<CreatedProvider>;
  get(name: string): Promise<ProviderView>;
  stopAndDelete(name: string): Promise<void>;
}

function checkedDomain(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || !url.hostname.endsWith('.vercel.run') || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('provider returned an invalid sandbox domain');
  }
  return url.origin;
}

function view(sandbox: Sandbox): ProviderView {
  return {
    name: sandbox.name,
    status: sandbox.status,
    expiresAt: sandbox.expiresAt?.toISOString() ?? null,
    domain: sandbox.status === 'running' ? checkedDomain(sandbox.domain(PROVIDER_PORT)) : null,
  };
}

export class VercelSandboxProvider implements SandboxProvider {
  constructor(readonly snapshotId = process.env.DIVIDENDX_SANDBOX_SNAPSHOT_ID, readonly operationTimeoutMs = 15_000) {
    if (!snapshotId) throw new Error('DIVIDENDX_SANDBOX_SNAPSHOT_ID is required');
  }

  private signal(): AbortSignal { return AbortSignal.timeout(this.operationTimeoutMs); }

  async create(input: { name: string; kind: SandboxKind; token: string; expiresAt: string }): Promise<CreatedProvider> {
    const remaining = Date.parse(input.expiresAt) - Date.now();
    if (remaining <= 0) throw new Error('sandbox reservation already expired');
    const sandbox = await Sandbox.create({
      name: input.name,
      source: { type: 'snapshot', snapshotId: this.snapshotId! },
      ports: [PROVIDER_PORT], timeout: remaining, resources: { vcpus: 2 }, networkPolicy: 'deny-all', persistent: false,
      env: {
        DIVIDENDX_SANDBOX_KIND: input.kind,
        DIVIDENDX_GATEWAY_TOKEN: input.token,
        DIVIDENDX_SESSION_EXPIRES_AT: input.expiresAt,
      },
      tags: { application: 'dividendx', flow: input.kind },
      signal: this.signal(),
    });
    return {
      ...view(sandbox),
      launch: async () => {
        await sandbox.runCommand({ cmd: PROVIDER_COMMAND[0], args: [...PROVIDER_COMMAND.slice(1)], cwd: PROVIDER_ROOT,
          detached: true, timeoutMs: Math.max(1, Date.parse(input.expiresAt) - Date.now()), signal: this.signal() });
      },
    };
  }

  async get(name: string): Promise<ProviderView> {
    try { return view(await Sandbox.get({ name, resume: false, signal: this.signal() })); }
    catch (error) {
      if (error instanceof APIError && error.response.status === 404) return { name, status: 'missing', expiresAt: null, domain: null };
      throw error;
    }
  }

  async stopAndDelete(name: string): Promise<void> {
    let sandbox: Sandbox;
    try { sandbox = await Sandbox.get({ name, resume: false, signal: this.signal() }); }
    catch (error) {
      if (error instanceof APIError && error.response.status === 404) return;
      throw error;
    }
    if (sandbox.status === 'running' || sandbox.status === 'pending') await sandbox.stop({ signal: this.signal() });
    const checked = await Sandbox.get({ name, resume: false, signal: this.signal() });
    if (!['stopped', 'failed', 'aborted'].includes(checked.status)) throw new Error('sandbox stop was not verified');
    await checked.delete({ signal: this.signal() });
  }
}
