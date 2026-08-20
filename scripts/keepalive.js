/**
 * Ping backend + frontend every 14 minutes (Render cron).
 * Keeps the free-tier backend web service from sleeping.
 */
const backend = process.env.BACKEND_URL;
const frontend = process.env.FRONTEND_URL;

const targets = [
  backend ? `${backend.replace(/\/$/, '')}/health` : null,
  frontend ? frontend.replace(/\/$/, '') : null,
].filter(Boolean);

if (targets.length === 0) {
  console.error('No BACKEND_URL or FRONTEND_URL set');
  process.exit(1);
}

async function ping(url) {
  const res = await fetch(url, { method: 'GET' });
  console.log(`${new Date().toISOString()} ${url} → ${res.status}`);
  if (!res.ok) process.exitCode = 1;
}

(async () => {
  for (const url of targets) {
    try {
      await ping(url);
    } catch (err) {
      console.error(`${url} failed:`, err.message);
      process.exitCode = 1;
    }
  }
})();
