import { createApp } from './app';
import { connectRedis } from './db/redis';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = createApp();

// Best-effort — routes that don't need Redis (health, login, most of the
// app) must keep working even if this fails or REDIS_URL isn't set;
// only the OTP signup flow actually depends on it, and that fails on
// its own, clearly, at the point of use if Redis isn't reachable.
connectRedis().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Redis connection failed at startup (OTP signup will not work until this is fixed):', err);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Inveon Events API listening on port ${PORT}`);
});
