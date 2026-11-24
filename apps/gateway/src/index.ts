import 'dotenv/config';
import { createFastifyGateway } from './server';
import { DEFAULT_GATEWAY_HOST, DEFAULT_GATEWAY_PORT } from '../../../packages/configuration/src/index';

const host = process.env.WEBSESSION2API_HOST || DEFAULT_GATEWAY_HOST;
const port = Number(process.env.WEBSESSION2API_PORT || DEFAULT_GATEWAY_PORT);

if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
  console.error(
    `[WebSession2API] Refusing to bind local gateway to non-loopback host "${host}". Use 127.0.0.1 or ::1.`
  );
  process.exit(1);
}

const { app } = createFastifyGateway({
  enforceLoopbackHost: true,
  environment: 'local_gateway',
});

app.listen({ host, port }).then(() => {
  console.log(`[WebSession2API] Local API Gateway listening on http://${host}:${port}`);
  console.log(`[WebSession2API] OpenAI-compatible base URL:    http://${host}:${port}/v1`);
  console.log(`[WebSession2API] Anthropic-compatible base URL: http://${host}:${port}`);
});
