// Fake IR device for local development (no hardware, no MQTT broker needed).
// It tails backend/storage/mqtt.log (written by the 'log' MQTT driver), reacts to commands
// exactly as the real firmware should, and keeps itself "online" via the status webhook.
//
// Usage:
//   node tools/device-simulator.mjs <DEVICE_CODE> <API_KEY> [--api http://localhost:8080] [--secret WEBHOOK_SECRET]
//        [--protocol DAIKIN]   protocol reported when learning (use an unknown one, e.g. NEC, to test raw mode)
import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [code, key] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
if (!code || !key) {
  console.error('Usage: node tools/device-simulator.mjs <DEVICE_CODE> <API_KEY> [--api URL] [--secret WEBHOOK_SECRET] [--protocol NAME]');
  process.exit(1);
}
const API = flag('api', 'http://localhost:8080');
const SECRET = flag('secret', '');
const PROTOCOL = flag('protocol', 'DAIKIN');
const LOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'storage', 'mqtt.log');
const TOPIC = `irdev/${code}/cmd`;

async function status(online) {
  if (!SECRET) return;
  await fetch(`${API}/internal/device-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': SECRET },
    body: JSON.stringify({ topic: `irdev/${code}/status`, payload: online ? 'online' : 'offline' }),
  }).catch((e) => console.error('status webhook failed:', e.message));
}

async function onCommand(p) {
  console.log('<-', JSON.stringify(p));
  if (p.cmd === 'learn') {
    console.log(`   learn mode for "${p.action_name}" — pretending the user pressed the remote in 3 s…`);
    await new Promise((r) => setTimeout(r, 3000));
    const rawData = Array.from({ length: 24 }, () => 400 + Math.floor(Math.random() * 1200));
    const res = await fetch(`${API}/device/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Key': key },
      body: JSON.stringify({ ir_device_id: code, action_name: p.action_name, protocol: PROTOCOL, length: rawData.length, rawData }),
    });
    console.log('-> POST /device/learn', res.status, await res.text());
  } else if (p.cmd === 'send' || p.cmd === 'send_ac') {
    console.log('   (would transmit IR now)');
  }
}

let pos = existsSync(LOG) ? statSync(LOG).size : 0;
let buf = '';
function poll() {
  if (!existsSync(LOG)) return;
  const size = statSync(LOG).size;
  if (size < pos) pos = 0;
  if (size === pos) return;
  const fd = openSync(LOG, 'r');
  const b = Buffer.alloc(size - pos);
  readSync(fd, b, 0, b.length, pos);
  closeSync(fd);
  pos = size;
  buf += b.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    try {
      const m = JSON.parse(line);
      if (m.topic === TOPIC) onCommand(m.payload);
    } catch { /* ignore partial/garbage lines */ }
  }
}

console.log(`Simulating ${code} (protocol ${PROTOCOL}), watching ${LOG}`);
await status(true);
setInterval(poll, 400);
setInterval(() => status(true), 30000); // like a heartbeat; real device relies on retained status + LWT
process.on('SIGINT', async () => { await status(false); process.exit(0); });
