import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createApp } from './app';
import { parseConfig } from './config';
config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
async function bootstrap() {
  const config = parseConfig(process.env);
  const app = await createApp();
  await app.listen(config.PORT, '0.0.0.0');
}
bootstrap().catch(() => {
  console.error('API startup failed. Check configuration and service logs.');
  process.exitCode = 1;
});
