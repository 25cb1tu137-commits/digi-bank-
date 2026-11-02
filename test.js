/* Run with: npm test. Starts the server on a temporary database and checks the banking rules. */
const assert = require("node:assert/strict"), os = require("node:os"), path = require("node:path");
process.env.DB_PATH = path.join(os.tmpdir(), "campus-bank-test-" + Date.now() + ".db");
const { server, db } = require("./server");
let base, passed = 0;
const call = async (method, p, body, tok) => {
  const r = await fetch(base + p, { method, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
};
const ok = async (name, fn) => { await fn(); passed++; console.log("  ok  " + name); };
server.listen(0, async () => {
  base = "http://localhost:" + server.address().port;
  try {
    const asha = (await call("POST", "/api/login", { mobile: "9876543210", pin: "1234" })).token;
    const rohan = (await call("POST", "/api/login", { mobile: "9123456780", pin: "4321" })).token;
    const st = t => call("GET", "/api/state", null, t);
    const total = async () => (await st(asha)).accounts[0].bal + (await st(rohan)).accounts[0].bal;
    await ok("state needs login", async () => assert.equal((await call("GET", "/api/state")).status, 401));
    await ok("UPI transfer moves money and keeps the total", async () => {
      const t0 = await total();
      const r = await call("POST", "/api/transfer", { from: "500011223301", to: "rohan@campus", amt: 1000, pin: "1234" }, asha);
      assert.equal(r.status, 200); assert.equal(await total(), t0);
      assert.equal((await st(asha)).accounts[0].bal, 84000);
    });
    await ok("transfer by account number, wrong PIN refused", async () => {
      assert.equal((await call("POST", "/api/transfer", { from: "500011223301", to: "500011223302", amt: 10, pin: "1234" }, asha)).status, 200);
      assert.equal((await call("POST", "/api/transfer", { from: "500011223301", to: "500011223302", amt: 10, pin: "0000" }, asha)).status, 400);
    });
    await ok("cannot send from someone else's account", async () => assert.equal((await call("POST", "/api/transfer", { from: "500011223302", to: "500011223301", amt: 10, pin: "1234" }, asha)).status, 400));
    await ok("IMPS (above Rs 1,00,000) charges a Rs 5 fee", async () => {
      const r = await call("POST", "/api/register", { name: "Big Saver", mobile: "9000000002", pin: "2222", deposit: 500000 });
      const no = (await st(r.token)).accounts[0].no;
      await call("POST", "/api/kyc", { pan: "ABCDE1234F" }, r.token);
      assert.equal((await call("POST", "/api/transfer", { from: no, to: "500011223301", amt: 150000, pin: "2222" }, r.token)).status, 200);
      assert.equal((await st(r.token)).accounts[0].bal, 500000 - 150000 - 5);
    });
    const m = await call("POST", "/api/register", { name: "Test User", mobile: "9000000001", pin: "1111", deposit: 5000 });
    await ok("register, duplicate mobile refused", async () => {
      assert.ok(m.token); assert.equal((await call("POST", "/api/register", { name: "Test User", mobile: "9000000001", pin: "1111", deposit: 5000 })).status, 400);
    });
    await ok("no KYC: transfer limit and loan blocked, KYC lifts them", async () => {
      const s = await st(m.token), no = s.accounts[0].no;
      assert.equal((await call("POST", "/api/transfer", { from: no, to: "500011223301", amt: 30000, pin: "1111" }, m.token)).status, 400);
      assert.match((await call("POST", "/api/loan", { acc: no, amt: 20000, months: 12 }, m.token)).error, /KYC/);
      assert.equal((await call("POST", "/api/kyc", { pan: "ABCDE1234F" }, m.token)).status, 200);
      assert.equal((await call("POST", "/api/loan", { acc: no, amt: 20000, months: 12 }, m.token)).status, 200);
    });
    await ok("savings minimum balance", async () => {
      const no = (await st(m.token)).accounts[0].no;
      assert.match((await call("POST", "/api/bill", { acc: no, cat: "Water", biller: "BWSSB", consumer: "1", amt: 24500, pin: "1111" }, m.token)).error, /must keep/);
    });
    await ok("fixed deposit, early close, monthly interest once", async () => {
      assert.equal((await call("POST", "/api/fd", { acc: "500011223301", amt: 10000, months: 12, pin: "1234" }, asha)).status, 200);
      const f = (await st(asha)).fds[0];
      assert.equal(f.status, "Active"); assert.equal((await call("POST", "/api/fd/close", { id: f.id }, asha)).status, 200);
      assert.equal((await call("POST", "/api/interest", { acc: "500011223301" }, asha)).status, 200);
      assert.equal((await call("POST", "/api/interest", { acc: "500011223301" }, asha)).status, 400);
    });
    await ok("loan EMI and foreclosure", async () => {
      await call("POST", "/api/loan", { acc: "500011223301", amt: 50000, months: 12 }, asha);
      const l = (await st(asha)).loans[0];
      assert.equal((await call("POST", "/api/loan/pay", { id: l.id }, asha)).status, 200);
      assert.equal((await call("POST", "/api/loan/foreclose", { id: l.id }, asha)).status, 200);
      assert.equal((await st(asha)).loans[0].status, "Closed");
    });
    await ok("card block, limit and payment", async () => {
      assert.equal((await call("POST", "/api/card/pay", { merchant: "Cafe", amt: 200 }, asha)).status, 200);
      assert.equal((await call("POST", "/api/card/pay", { merchant: "TV", amt: 30000 }, asha)).status, 400);
      await call("POST", "/api/card/block", { pin: "1234" }, asha);
      assert.match((await call("POST", "/api/card/pay", { merchant: "Cafe", amt: 20 }, asha)).error, /blocked/);
      await call("POST", "/api/card/block", { pin: "1234" }, asha);
    });
    await ok("freeze blocks debits, open current account, cheque book, profile, PIN change", async () => {
      await call("POST", "/api/account/freeze", { acc: "500011223301" }, asha);
      assert.match((await call("POST", "/api/bill", { acc: "500011223301", cat: "DTH", biller: "X", consumer: "1", amt: 100, pin: "1234" }, asha)).error, /frozen/);
      await call("POST", "/api/account/freeze", { acc: "500011223301" }, asha);
      const o = await call("POST", "/api/account/open", { from: "500011223301", amt: 6000, pin: "1234" }, asha);
      assert.ok(o.no); assert.equal((await st(asha)).accounts.length, 2);
      assert.equal((await call("POST", "/api/cheque", { acc: "500011223301", leaves: 50, pin: "1234" }, asha)).status, 200);
      assert.equal((await call("POST", "/api/profile", { email: "asha@example.com", addr: "Pune", nom: "Meera" }, asha)).status, 200);
      assert.equal((await st(asha)).user.email, "asha@example.com");
      assert.equal((await call("POST", "/api/pin", { pin: "1234", new: "5678" }, asha)).status, 200);
      assert.equal((await call("POST", "/api/login", { mobile: "9876543210", pin: "5678" })).status, 200);
    });
    await ok("3 wrong PINs lock the login", async () => {
      for (let i = 0; i < 3; i++) await call("POST", "/api/login", { mobile: "9000000001", pin: "0000" });
      assert.equal((await call("POST", "/api/login", { mobile: "9000000001", pin: "1111" })).status, 429);
    });
    await ok("statement entries add up", async () => {
      const s = await st(rohan), t = s.txns.filter(x => x.acc == "500011223302");
      assert.equal(t.reduce((n, x) => n + (x.dir == "c" ? x.amt : -x.amt), 0), s.accounts[0].bal);
    });
    console.log(`\n${passed} checks passed`);
    db.close(); server.close();
  } catch (e) { console.error("FAILED:", e.message); process.exit(1); }
});
