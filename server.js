"use strict";
/* Campus Bank backend.
   Node.js (no npm packages) + SQLite (built-in node:sqlite). Needs Node 22.13 or newer.
   Money is stored as whole paise (integers). The server enforces every banking rule. */
const http = require("node:http"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = +process.env.PORT || 3000;
// On Vercel the project folder is read-only, so the database lives in /tmp (temporary, see README).
const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? "/tmp/bank.db" : path.join(__dirname, "data", "bank.db"));
const PUB = path.join(__dirname, "public");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,mobile TEXT UNIQUE,pin_hash TEXT,salt TEXT,fails INTEGER DEFAULT 0,lock_until INTEGER DEFAULT 0,kyc INTEGER DEFAULT 0,pan TEXT DEFAULT '',upi TEXT UNIQUE,email TEXT DEFAULT '',addr TEXT DEFAULT '',nom TEXT DEFAULT '',since TEXT,last_login TEXT DEFAULT '',prev_login TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS accounts(no TEXT PRIMARY KEY,uid TEXT,type TEXT,bal INTEGER,frozen INTEGER DEFAULT 0,ifsc TEXT);
CREATE TABLE IF NOT EXISTS txns(id TEXT,ref TEXT,acc TEXT,dir TEXT,amt INTEGER,bal INTEGER,note TEXT,cat TEXT,date TEXT);
CREATE INDEX IF NOT EXISTS tx_acc ON txns(acc);
CREATE TABLE IF NOT EXISTS fds(id TEXT PRIMARY KEY,uid TEXT,acc TEXT,p INTEGER,r REAL,m INTEGER,start TEXT,status TEXT);
CREATE TABLE IF NOT EXISTS loans(id TEXT PRIMARY KEY,uid TEXT,acc TEXT,p INTEGER,r REAL,m INTEGER,emi INTEGER,paid INTEGER DEFAULT 0,status TEXT);
CREATE TABLE IF NOT EXISTS cards(uid TEXT PRIMARY KEY,no TEXT,exp TEXT,blocked INTEGER DEFAULT 0,lim INTEGER);
CREATE TABLE IF NOT EXISTS notes(uid TEXT,t TEXT,d TEXT);
CREATE TABLE IF NOT EXISTS reqs(uid TEXT,t TEXT,ref TEXT,d TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,uid TEXT,exp INTEGER);`);

/* ---------- helpers ---------- */
const q = (s, ...a) => db.prepare(s).get(...a), qa = (s, ...a) => db.prepare(s).all(...a), ex = (s, ...a) => db.prepare(s).run(...a);
const now = () => new Date().toISOString();
const uid = p => p + crypto.randomBytes(4).toString("hex").toUpperCase();
const digits = n => Array.from({ length: n }, () => crypto.randomInt(10)).join("");
const inr = p => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rup = p => p / 100, paise = r => Math.round(r * 100);
const ist = () => new Date(Date.now() + 19800000).toISOString(), dayNow = () => ist().slice(0, 10), monthNow = () => ist().slice(0, 7);
class Err extends Error { constructor(m, c = 400) { super(m); this.code = c; } }
const need = (c, m) => { if (!c) throw new Err(m); };
function tx(fn) { db.exec("BEGIN IMMEDIATE"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } }
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString("hex");

const RATES = { 6: 6.0, 12: 6.8, 24: 7.0, 60: 7.2 }, MIN = { Savings: 100000, Current: 0 };
const mat = f => Math.round(f.p * Math.pow(1 + f.r / 400, 4 * f.m / 12));
const EMI = (p, r, n) => { r /= 1200; return Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)); };
const OUT = l => { const r = l.r / 1200; return Math.round(l.p * (Math.pow(1 + r, l.m) - Math.pow(1 + r, l.paid)) / (Math.pow(1 + r, l.m) - 1)); };

/* ---------- accounts and ledger ---------- */
function newAcc(id, type, no) {
  if (!no) { do no = "50" + digits(10); while (q("SELECT 1 x FROM accounts WHERE no=?", no)); }
  ex("INSERT INTO accounts VALUES(?,?,?,?,?,?)", no, id, type, 0, 0, "CAMP0000101");
  return q("SELECT * FROM accounts WHERE no=?", no);
}
/* One place that changes a balance. Every credit and debit goes through here. */
function post(a, dir, amt, note, cat, ref) {
  ex(`UPDATE accounts SET bal=bal${dir == "c" ? "+" : "-"}? WHERE no=?`, amt, a.no);
  const bal = q("SELECT bal FROM accounts WHERE no=?", a.no).bal, d = now();
  ex("INSERT INTO txns VALUES(?,?,?,?,?,?,?,?,?)", uid("T"), ref || uid("R"), a.no, dir, amt, bal, note, cat, d);
  ex("INSERT INTO notes VALUES(?,?,?)", a.uid, `${inr(amt)} ${dir == "c" ? "credited to" : "debited from"} a/c …${a.no.slice(-4)} · ${note}`, d);
}
function check(a, amt, extra = 0) {
  need(!a.frozen, "This account is frozen. Unfreeze it from Profile.");
  need(amt > 0, "Enter an amount greater than zero.");
  if (a.bal - amt - extra < MIN[a.type])
    throw new Err(a.type == "Savings" ? `A savings account must keep ₹1,000. You can use up to ${inr(Math.max(0, a.bal - 100000))}.` : `Insufficient balance. Available: ${inr(a.bal)}.`);
}
const own = (u, no) => { const a = q("SELECT * FROM accounts WHERE no=? AND uid=?", String(no || ""), u.id); need(a, "Account not found."); return a; };
const firstAcc = u => q("SELECT * FROM accounts WHERE uid=? ORDER BY rowid LIMIT 1", u.id);
const nameOf = id => q("SELECT name FROM users WHERE id=?", id).name;
function createUser(name, mobile, pin, dep, o = {}) {
  const id = uid("U"), salt = crypto.randomBytes(8).toString("hex"), base = name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "") || "user";
  let upi = base + "@campus";
  while (q("SELECT 1 x FROM users WHERE upi=?", upi)) upi = base + digits(3) + "@campus";
  ex("INSERT INTO users(id,name,mobile,pin_hash,salt,kyc,pan,upi,since) VALUES(?,?,?,?,?,?,?,?,?)", id, name, mobile, hashPin(pin, salt), salt, o.kyc ? 1 : 0, o.kyc ? "XXXXXX123K" : "", upi, now());
  const y = String(new Date().getFullYear() + 5).slice(-2), mo = String(new Date().getMonth() + 1).padStart(2, "0");
  ex("INSERT INTO cards VALUES(?,?,?,?,?)", id, "4" + digits(15), mo + "/" + y, 0, 2500000);
  post(newAcc(id, "Savings", o.no), "c", dep, "Opening deposit", "Deposit");
  return id;
}

/* ---------- login, PIN lock, sessions ---------- */
function pinOk(u, pin) {
  const r = q("SELECT * FROM users WHERE id=?", u.id);
  if (r.lock_until > Date.now()) throw new Err(`Too many wrong PINs. Try again in ${Math.ceil((r.lock_until - Date.now()) / 1000)}s.`, 429);
  const good = /^\d{4}$/.test(String(pin || "")) && crypto.timingSafeEqual(Buffer.from(hashPin(pin, r.salt)), Buffer.from(r.pin_hash));
  if (good) { if (r.fails) ex("UPDATE users SET fails=0 WHERE id=?", r.id); return; }
  const f = r.fails + 1;
  if (f >= 3) { ex("UPDATE users SET fails=0,lock_until=? WHERE id=?", Date.now() + 30000, r.id); throw new Err("3 wrong PINs. Locked for 30 seconds.", 429); }
  ex("UPDATE users SET fails=? WHERE id=?", f, r.id);
  throw new Err(`Wrong PIN. ${3 - f} attempt(s) left.`);
}
function session(id) {
  const t = crypto.randomBytes(24).toString("hex");
  ex("DELETE FROM sessions WHERE exp<?", Date.now());
  ex("INSERT INTO sessions VALUES(?,?,?)", t, id, Date.now() + 7 * 864e5);
  return t;
}
const token = req => (/^Bearer (\S+)$/.exec(req.headers.authorization || "") || [])[1];
const authUser = req => { const t = token(req), s = t && q("SELECT uid FROM sessions WHERE token=? AND exp>?", t, Date.now()); return s && q("SELECT * FROM users WHERE id=?", s.uid); };

function settleFDs(id) { /* credit deposits whose term is over */
  for (const f of qa("SELECT * FROM fds WHERE uid=? AND status='Active'", id)) {
    const d = new Date(f.start); d.setMonth(d.getMonth() + f.m);
    if (d <= new Date()) { post(q("SELECT * FROM accounts WHERE no=?", f.acc), "c", mat(f), "FD matured", "Deposit"); ex("UPDATE fds SET status='Matured' WHERE id=?", f.id); }
  }
}
function state(u) {
  return {
    user: { id: u.id, name: u.name, mobile: u.mobile, upi: u.upi, kyc: !!u.kyc, pan: u.pan, email: u.email, addr: u.addr, nom: u.nom, since: u.since, prev: u.prev_login },
    accounts: qa("SELECT * FROM accounts WHERE uid=? ORDER BY rowid", u.id).map(a => ({ no: a.no, uid: a.uid, type: a.type, bal: rup(a.bal), ifsc: a.ifsc, frozen: !!a.frozen })),
    txns: qa("SELECT t.* FROM txns t JOIN accounts a ON a.no=t.acc WHERE a.uid=? ORDER BY t.rowid DESC LIMIT 1000", u.id).map(t => ({ id: t.id, ref: t.ref, acc: t.acc, dir: t.dir, amt: rup(t.amt), bal: rup(t.bal), note: t.note, cat: t.cat, date: t.date })),
    fds: qa("SELECT * FROM fds WHERE uid=? ORDER BY rowid DESC", u.id).map(f => ({ id: f.id, u: f.uid, acc: f.acc, p: rup(f.p), r: f.r, m: f.m, start: f.start, status: f.status })),
    loans: qa("SELECT * FROM loans WHERE uid=? ORDER BY rowid DESC", u.id).map(l => ({ id: l.id, u: l.uid, acc: l.acc, p: rup(l.p), r: l.r, m: l.m, emi: rup(l.emi), paid: l.paid, status: l.status })),
    card: (c => ({ no: "XXXXXXXXXXXX" + c.no.slice(-4), exp: c.exp, blocked: !!c.blocked, limit: rup(c.lim) }))(q("SELECT * FROM cards WHERE uid=?", u.id)),
    notes: qa("SELECT * FROM notes WHERE uid=? ORDER BY rowid DESC LIMIT 30", u.id).map(n => ({ u: n.uid, t: n.t, d: n.d })),
    reqs: qa("SELECT * FROM reqs WHERE uid=? ORDER BY rowid DESC LIMIT 30", u.id).map(r => ({ u: r.uid, t: r.t, ref: r.ref, d: r.d })),
  };
}

/* ---------- routes: handler(user, body, req). pin:1 checks the PIN first, tx:1 runs in one transaction ---------- */
const routes = {};
const route = (k, o, fn) => { routes[k] = { ...o, fn }; };

route("POST /api/register", { auth: false, tx: 1 }, (_, b) => {
  const name = String(b.name || "").trim().slice(0, 60), mobile = String(b.mobile || "").trim(), pin = String(b.pin || ""), dep = paise(+b.deposit);
  need(name.length >= 3, "Enter your full name.");
  need(/^\d{10}$/.test(mobile), "Mobile number must be 10 digits.");
  need(/^\d{4}$/.test(pin), "PIN must be exactly 4 digits.");
  need(dep >= 100000, "Savings accounts need an opening deposit of at least ₹1,000.");
  need(dep <= 100000000, "Opening deposit can be up to ₹10,00,000.");
  need(!q("SELECT 1 x FROM users WHERE mobile=?", mobile), "This mobile number is already registered.");
  return { token: session(createUser(name, mobile, pin, dep)) };
});
route("POST /api/login", { auth: false }, (_, b) => {
  const u = q("SELECT * FROM users WHERE mobile=?", String(b.mobile || "").trim());
  need(u, "No account with this mobile number.");
  pinOk(u, b.pin);
  ex("UPDATE users SET prev_login=last_login,last_login=? WHERE id=?", now(), u.id);
  return { token: session(u.id) };
});
route("POST /api/logout", {}, (u, b, req) => { ex("DELETE FROM sessions WHERE token=?", token(req)); return { ok: true }; });
route("GET /api/state", { tx: 1 }, u => { settleFDs(u.id); return state(u); });

route("POST /api/transfer", { pin: 1, tx: 1 }, (u, b) => {
  const a = own(u, b.from), t = String(b.to || "").trim().toLowerCase(), amt = paise(+b.amt);
  const to = t && (q("SELECT * FROM accounts WHERE no=?", t) || (x => x && firstAcc(x))(q("SELECT id FROM users WHERE upi=?", t)));
  need(to, "Choose who to send to. For someone else, enter a valid account number or UPI ID.");
  need(to.no != a.no, "You can’t send money to the same account.");
  need(amt > 0, "Enter an amount greater than zero.");
  need(u.kyc || amt <= 2500000, "Without KYC you can send up to ₹25,000 per transfer. Complete KYC in Profile.");
  need(amt <= 100000000, "The limit is ₹10,00,000 per transfer.");
  const mode = amt <= 10000000 ? "UPI" : amt <= 20000000 ? "IMPS" : "NEFT", fee = mode == "IMPS" ? 500 : 0;
  check(a, amt, fee);
  const ref = uid("R"), name = nameOf(to.uid);
  post(a, "d", amt, `${mode} to ${name}`, "Transfer", ref);
  if (fee) post(a, "d", fee, "IMPS fee", "Charges", ref);
  post(to, "c", amt, `${mode} from ${u.name}`, "Transfer", ref);
  return { msg: `${inr(amt)} sent to ${name}. Reference ${ref}.` };
});

route("POST /api/fd", { pin: 1, tx: 1 }, (u, b) => {
  const a = own(u, b.acc), amt = paise(+b.amt), m = +b.months, r = RATES[m];
  need(r, "Choose a valid tenure.");
  need(amt >= 1000000, "Minimum FD amount is ₹10,000.");
  check(a, amt);
  post(a, "d", amt, `FD booked · ${m} months`, "Deposit");
  ex("INSERT INTO fds VALUES(?,?,?,?,?,?,?,?)", uid("F"), u.id, a.no, amt, r, m, now(), "Active");
  return { msg: `FD booked. It will mature at ${inr(mat({ p: amt, r, m }))}.` };
});
route("POST /api/fd/close", { tx: 1 }, (u, b) => {
  const f = q("SELECT * FROM fds WHERE id=? AND uid=? AND status='Active'", String(b.id || ""), u.id);
  need(f, "Deposit not found.");
  const a = q("SELECT * FROM accounts WHERE no=?", f.acc), yrs = (Date.now() - new Date(f.start)) / 31557600000;
  const val = Math.round(f.p * Math.pow(1 + (f.r - 1) / 400, 4 * yrs));
  post(a, "c", val, "FD closed early (1% penalty rate)", "Deposit");
  ex("UPDATE fds SET status='Closed early' WHERE id=?", f.id);
  return { msg: `${inr(val)} credited to …${a.no.slice(-4)}.` };
});
route("POST /api/interest", { tx: 1 }, (u, b) => {
  const a = own(u, b.acc);
  need(a.type == "Savings", "Interest applies to savings accounts only.");
  need(!q("SELECT 1 x FROM txns WHERE acc=? AND cat='Interest' AND strftime('%Y-%m',date,'+330 minutes')=?", a.no, monthNow()), "This month’s interest is already credited.");
  const i = Math.round(a.bal * 0.035 / 12);
  need(i > 0, "No interest to credit yet.");
  post(a, "c", i, "Savings interest", "Interest");
  return { msg: `${inr(i)} interest credited.` };
});

route("POST /api/loan", { tx: 1 }, (u, b) => {
  const a = own(u, b.acc), p = paise(+b.amt), n = +b.months;
  need(u.kyc, "Complete KYC in Profile to apply for a loan.");
  need(p >= 1000000 && p <= 50000000 && Number.isInteger(n) && n >= 6 && n <= 60, "Amount must be ₹10,000 – ₹5,00,000 and tenure 6 – 60 months.");
  need(q("SELECT COUNT(*) c FROM loans WHERE uid=? AND status='Active'", u.id).c < 2, "You can have at most 2 active loans.");
  need(!a.frozen, "This account is frozen. Unfreeze it from Profile.");
  const emi = EMI(p, 11.5, n);
  ex("INSERT INTO loans(id,uid,acc,p,r,m,emi,paid,status) VALUES(?,?,?,?,?,?,?,?,?)", uid("L"), u.id, a.no, p, 11.5, n, emi, 0, "Active");
  post(a, "c", p, "Personal loan disbursed", "Loan");
  return { msg: `Loan approved. ${inr(p)} credited. EMI ${inr(emi)} for ${n} months.` };
});
const loanOf = (u, id) => { const l = q("SELECT * FROM loans WHERE id=? AND uid=? AND status='Active'", String(id || ""), u.id); need(l, "Loan not found."); return l; };
route("POST /api/loan/pay", { tx: 1 }, (u, b) => {
  const l = loanOf(u, b.id), a = q("SELECT * FROM accounts WHERE no=?", l.acc);
  check(a, l.emi);
  post(a, "d", l.emi, `Loan EMI ${l.paid + 1}/${l.m}`, "Loan");
  ex("UPDATE loans SET paid=paid+1,status=? WHERE id=?", l.paid + 1 >= l.m ? "Closed" : "Active", l.id);
  return { msg: "EMI paid." };
});
route("POST /api/loan/foreclose", { tx: 1 }, (u, b) => {
  const l = loanOf(u, b.id), a = q("SELECT * FROM accounts WHERE no=?", l.acc), amt = Math.round(OUT(l) * 1.02);
  check(a, amt);
  post(a, "d", amt, "Loan foreclosed (2% charge)", "Loan");
  ex("UPDATE loans SET status='Closed' WHERE id=?", l.id);
  return { msg: "Loan closed." };
});

route("POST /api/bill", { pin: 1, tx: 1 }, (u, b) => {
  const a = own(u, b.acc), amt = paise(+b.amt), biller = String(b.biller || "").trim().slice(0, 40), no = String(b.consumer || "").trim().slice(0, 30);
  need(["Electricity", "Mobile recharge", "Water", "DTH", "Piped gas"].includes(b.cat), "Choose a bill category.");
  need(biller && no, "Enter the biller name and consumer number.");
  check(a, amt);
  post(a, "d", amt, `${b.cat} · ${biller} · ${no}`, "Bills");
  return { msg: `${inr(amt)} paid to ${biller}.` };
});

route("POST /api/card/block", { pin: 1, tx: 1 }, u => {
  ex("UPDATE cards SET blocked=1-blocked WHERE uid=?", u.id);
  return { msg: q("SELECT blocked FROM cards WHERE uid=?", u.id).blocked ? "Card blocked." : "Card unblocked." };
});
route("POST /api/card/limit", { tx: 1 }, (u, b) => {
  need([10000, 25000, 50000, 100000].includes(+b.limit), "Choose one of the listed limits.");
  ex("UPDATE cards SET lim=? WHERE uid=?", paise(+b.limit), u.id);
  return { msg: "Daily limit updated." };
});
route("POST /api/card/pay", { tx: 1 }, (u, b) => {
  const c = q("SELECT * FROM cards WHERE uid=?", u.id), a = firstAcc(u), amt = paise(+b.amt), shop = String(b.merchant || "").trim().slice(0, 40);
  need(!c.blocked, "This card is blocked. Unblock it to pay.");
  need(shop, "Enter a merchant name.");
  check(a, amt);
  const spent = q("SELECT COALESCE(SUM(amt),0) s FROM txns WHERE acc=? AND cat='Card' AND dir='d' AND date(date,'+330 minutes')=?", a.no, dayNow()).s;
  need(spent + amt <= c.lim, `This would pass your daily limit of ${inr(c.lim)}.`);
  post(a, "d", amt, "Card purchase · " + shop, "Card");
  return { msg: "Payment approved." };
});

route("POST /api/cheque", { pin: 1, tx: 1 }, (u, b) => {
  const a = own(u, b.acc), n = +b.leaves, fee = n == 50 ? 10000 : 0;
  need(n == 25 || n == 50, "Choose 25 or 50 leaves.");
  if (fee) { check(a, fee); post(a, "d", fee, "Cheque book fee", "Charges"); }
  ex("INSERT INTO reqs VALUES(?,?,?,?)", u.id, `Cheque book, ${n} leaves`, uid("S"), now());
  return { msg: "Cheque book requested. Delivery in 5–7 days." };
});
route("POST /api/account/open", { pin: 1, tx: 1 }, (u, b) => {
  const a = own(u, b.from), amt = paise(+b.amt);
  need(amt >= 500000, "Minimum opening amount is ₹5,000.");
  need(q("SELECT COUNT(*) c FROM accounts WHERE uid=?", u.id).c < 5, "You can have up to 5 accounts.");
  check(a, amt);
  const n = newAcc(u.id, "Current"), ref = uid("R");
  post(a, "d", amt, "Funds for new current account", "Transfer", ref);
  post(n, "c", amt, "Opening deposit", "Deposit", ref);
  return { no: n.no, msg: "Current account " + n.no + " opened." };
});
route("POST /api/account/freeze", { tx: 1 }, (u, b) => {
  const a = own(u, b.acc);
  ex("UPDATE accounts SET frozen=1-frozen WHERE no=?", a.no);
  return { msg: a.frozen ? "Account unfrozen." : "Account frozen. Debits are blocked." };
});

route("POST /api/profile", { tx: 1 }, (u, b) => {
  const email = String(b.email || "").trim().slice(0, 80);
  need(!email || /^\S+@\S+\.\S+$/.test(email), "Enter a valid email address.");
  ex("UPDATE users SET email=?,addr=?,nom=? WHERE id=?", email, String(b.addr || "").trim().slice(0, 80), String(b.nom || "").trim().slice(0, 40), u.id);
  return { msg: "Details saved." };
});
route("POST /api/kyc", { tx: 1 }, (u, b) => {
  const p = String(b.pan || "").trim().toUpperCase();
  need(/^[A-Z]{5}\d{4}[A-Z]$/.test(p), "Enter a valid PAN like ABCDE1234F.");
  ex("UPDATE users SET kyc=1,pan=? WHERE id=?", "XXXXXX" + p.slice(6), u.id);
  return { msg: "KYC verified. Your limits are lifted." };
});
route("POST /api/pin", { pin: 1, tx: 1 }, (u, b) => {
  need(/^\d{4}$/.test(String(b.new || "")), "New PIN must be 4 digits.");
  need(String(b.new) != String(b.pin), "New PIN must differ from the current one.");
  const salt = crypto.randomBytes(8).toString("hex");
  ex("UPDATE users SET pin_hash=?,salt=? WHERE id=?", hashPin(b.new, salt), salt, u.id);
  return { msg: "PIN changed." };
});

/* ---------- http server ---------- */
const SEC = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "SAMEORIGIN" };
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SEC }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  let s = "";
  req.on("data", c => { s += c; if (s.length > 1e5) { no(new Err("Request too large.", 413)); req.destroy(); } });
  req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(new Err("Invalid request.")); } });
  req.on("error", no);
});
const hits = new Map();
function limited(ip) { const t = Date.now(), a = (hits.get(ip) || []).filter(x => t - x < 60000); a.push(t); hits.set(ip, a); return a.length > 30; }

async function api(req, res, url) {
  const r = routes[req.method + " " + url.pathname];
  if (!r) return send(res, 404, { error: "Not found." });
  try {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
    if (r.auth === false && limited(ip)) throw new Err("Too many attempts. Please wait a minute.", 429);
    const b = req.method == "POST" ? await readBody(req) : {};
    let u = null;
    if (r.auth !== false) { u = authUser(req); if (!u) return send(res, 401, { error: "Please log in again." }); }
    if (r.pin) pinOk(u, b.pin);
    send(res, 200, (r.tx ? tx(() => r.fn(u, b, req)) : r.fn(u, b, req)) || { ok: true });
  } catch (e) {
    if (e instanceof Err) return send(res, e.code, { error: e.message });
    console.error(e); send(res, 500, { error: "Server error. Please try again." });
  }
}
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function serve(pathname, res) {
  const f = path.join(PUB, path.normalize(decodeURIComponent(pathname === "/" ? "/index.html" : pathname)));
  if (!f.startsWith(PUB + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404, { "Content-Type": "text/plain", ...SEC }); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache", ...SEC });
  fs.createReadStream(f).pipe(res);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    serve(url.pathname, res);
  } catch (e) { console.error(e); send(res, 500, { error: "Server error." }); }
});

if (!q("SELECT 1 x FROM users") && process.env.SEED_DEMO !== "false") {
  tx(() => {
    createUser("Asha Verma", "9876543210", "1234", 8500000, { kyc: 1, no: "500011223301" });
    createUser("Rohan Mehta", "9123456780", "4321", 4000000, { kyc: 1, no: "500011223302" });
  });
}
if (require.main === module) server.listen(PORT, () => console.log(`Campus Bank running on port ${PORT}`));
module.exports = { server, db };
