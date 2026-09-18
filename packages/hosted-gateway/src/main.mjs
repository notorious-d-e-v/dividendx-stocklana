import { configFromEnvironment, startGateway } from './server.mjs';

let gateway;
try {
  gateway = await startGateway(configFromEnvironment());
} catch (error) {
  process.stderr.write(`Hosted gateway failed to start: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}

if (gateway) {
  const shutdown = () => { void gateway.close('stopped').finally(() => process.exit(0)); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
