/* Campus Bank - front end. All data and rules live on the server; this file only shows screens and calls the API. */
const K="campus.v1",MODES={UPI:[100000,0],IMPS:[200000,5],NEFT:[1000000,0]},RATES={6:6.0,12:6.8,24:7.0,60:7.2},MIN={Savings:1000,Current:0};
let D,U=null,AC,V="home",flash="",F={dir:"",cat:"",q:"",from:"",to:""},T="own";
const $=i=>document.getElementById(i),v=i=>$(i).value,r2=x=>Math.round(x*100)/100,sum=l=>l.reduce((s,x)=>s+x.amt,0);
const inr=n=>"₹"+Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dt=d=>new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
const uid=p=>p+Math.random().toString(36).slice(2,8).toUpperCase();
const digits=n=>Array.from({length:n},()=>Math.floor(Math.random()*10)).join("");
const save=()=>{};
const acc=()=>D.accounts.find(x=>x.no==AC),mine=()=>D.accounts.filter(x=>x.uid==U.id);
const fail=m=>{$("msg").textContent=m;return false},done=m=>{flash=m;save();render()};
const today=(a,cat)=>sum(D.txns.filter(t=>t.acc==a.no&&t.cat==cat&&t.dir=="d"&&new Date(t.date).toDateString()==new Date().toDateString()));
const maturity=(p,r,m)=>r2(p*Math.pow(1+r/400,4*m/12));
const emi=(p,r,n)=>{r/=1200;return r2(p*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1))};
/* ---------- auth ---------- */
const LOGO='<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect width="30" height="30" rx="6" fill="#F2A33A"/><text x="15" y="21.5" text-anchor="middle" font-size="19" font-weight="700" fill="#14213D" font-family="sans-serif">C</text></svg>';
function authView(reg){
$("app").innerHTML=`<div class="lg"><div class="lf"><div class="brand" style="margin-bottom:12px">${LOGO}<div>Campus Bank</div></div>
${reg?`<label for="rn">Full name</label><input id="rn">`:""}
<label for="lm">Mobile number</label><input id="lm" inputmode="numeric" maxlength="10">
<label for="lp">${reg?"Create 4-digit PIN":"PIN"}</label><input id="lp" type="password" inputmode="numeric" maxlength="4" autocomplete="off" ${reg?"":`onkeydown="if(event.key=='Enter')login()"`}>
${reg?`<label for="rd">Opening deposit (min ₹1,000)</label><input id="rd" type="number">`:""}
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="${reg?"register()":"login()"}">${reg?"Open account":"Log in"}</button><button class="btn alt" onclick="authView(${!reg})">${reg?"Back to login":"Open a new account"}</button></div><div id="msg"></div></div></div>`}
/* ---------- helpers for views ---------- */
const fld=(id,l,t="text",x="")=>`<label for="${id}">${l}</label><input id="${id}" type="${t}" ${x}>`;
const pinf=()=>fld("pin","Confirm with your 4-digit PIN","password",'maxlength="4" inputmode="numeric" autocomplete="off"');
const opts=(l,sel)=>l.map(([a,b])=>`<option value="${a}" ${a==sel?"selected":""}>${esc(b)}</option>`).join("");
const rows=l=>l.length?`<div class="tw"><table><thead><tr><th>Date</th><th>Details</th><th class="n">Amount</th><th class="n">Balance</th></tr></thead><tbody>${l.map(t=>`<tr><td>${dt(t.date)}</td><td>${esc(t.note)}</td><td class="n ${t.dir=="c"?"cr":"dr"}">${t.dir=="c"?"+":"−"}${inr(t.amt)}</td><td class="n">${inr(t.bal)}</td></tr>`).join("")}</tbody></table></div>`:'<p class="m">No transactions to show yet.</p>';
let SUB="";const to=(x,s="")=>{V=x;SUB=s;flash="";render()},go=x=>to(x);
const NAV=[["home","Overview"],["transfer","Send money"],["stmt","Statement"],["dep","Fixed deposits"],["loan","Loans"],["bills","Pay bills"],["card","Debit card"],["svc","Services"],["profile","Profile"]];
function render(){if(!U)return authView(false);
 if(!acc()||acc().uid!=U.id)AC=mine()[0].no;
 $("app").innerHTML=`<div class="shell"><nav><div class="logo">${LOGO}<span>Campus <i>Bank</i></span></div>${NAV.map(([k,l])=>`<button class="${k==V?"on":""}" onclick="go('${k}')">${l}</button>`).join("")}<div class="sp"></div><button onclick="logout()">Log out</button></nav>
<div class="mainc"><div class="top"><h2 style="margin:0">Hello, ${esc(U.name.split(" ")[0])}</h2><select aria-label="Account" onchange="AC=this.value;render()">${opts(mine().map(a=>[a.no,`${a.type} · …${a.no.slice(-4)} · ${inr(a.bal)}`]),AC)}</select></div>
${flash?`<div class="flash" role="status">${esc(flash)}</div>`:""}${VIEWS[V]()}</div></div>`}
/* ---------- views ---------- */
const VIEWS={
home(){const a=acc(),t=D.txns.filter(x=>x.acc==a.no),mo=new Date().toISOString().slice(0,7),cm=t.filter(x=>x.date.slice(0,7)==mo),fd=sum(D.fds.filter(f=>f.u==U.id&&f.status=="Active").map(f=>({amt:f.p})));
const IC={transfer:'<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',dep:'<path d="M3 10 12 4l9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>',loan:'<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',bills:'<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'};
return`<div class="card hero"><div><div class="m">${a.type} account · ${a.no}</div><div class="bal">${inr(a.bal)}</div><div class="m">Available balance</div></div>
<div class="hs"><div><span>Money in this month</span><b class="g">${inr(sum(cm.filter(x=>x.dir=="c")))}</b></div><div><span>Money out this month</span><b class="rd">${inr(sum(cm.filter(x=>x.dir=="d")))}</b></div><div><span>Fixed deposits</span><b>${inr(fd)}</b></div></div></div>
<div class="qa">${[["Send money","transfer"],["Fixed deposit","dep"],["Loan","loan"],["Pay bills","bills"],["Debit card","card"]].map(([n,k])=>`<button onclick="go('${k}')"><span class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg></span>${n}</button>`).join("")}</div>
<div class="card"><h3>Recent transactions</h3>${rows(t.slice(0,5))}</div>
<div class="card"><h3>Alerts</h3>${D.notes.filter(n=>n.u==U.id).slice(0,4).map(n=>`<p class="m" style="margin:0 0 8px">${esc(n.t)}</p>`).join("")||'<p class="m">No alerts yet.</p>'}</div>`},
transfer(){const a=acc(),own=mine().filter(x=>x.no!=a.no),some=own.length;
return`<div class="card"><h3>Send money</h3><label for="tt">Send to</label><select id="tt" onchange="$('tw').style.display=this.value=='new'?'block':'none'">${own.length?`<optgroup label="My accounts">${opts(own.map(x=>[x.no,`${x.type} · …${x.no.slice(-4)}`]))}</optgroup>`:""}<option value="new">Someone else</option></select>
<div id="tw" style="display:${some?"none":"block"}">${fld("tu","Account number or UPI ID","text",'placeholder="e.g. 500011223302 or rohan@campus"')}</div>
${fld("amt","Amount (₹)","number",'min="1" step="0.01"')}${pinf()}<button class="btn" onclick="doTransfer()">Send money</button><div id="msg"></div></div>`},
stmt(){const l=fl();return`<div class="card"><h3>Account statement</h3><div class="grid"><div><label for="fd">Type</label><select id="fd" onchange="F.dir=this.value;render()">${opts([["","All"],["c","Credits"],["d","Debits"]],F.dir)}</select></div><div><label for="fq">Search</label><input id="fq" value="${esc(F.q)}" onchange="F.q=this.value;render()"></div></div><button class="btn sm" style="margin-top:12px" onclick="pdf()">Download statement (PDF)</button> <button class="btn alt sm" style="margin-top:12px" onclick="csv()">Download CSV</button></div><div class="card">${rows(l)}</div>`},
dep(){const a=acc(),fds=D.fds.filter(f=>f.u==U.id);return`<div class="grid"><div class="card"><h3>Open a fixed deposit</h3>${fld("fa","Amount (₹, min 10,000)","number")}<label for="fm">Tenure</label><select id="fm">${opts(Object.entries(RATES).map(([m,r])=>[m,`${m} months · ${r.toFixed(1)}% p.a.`]))}</select>${pinf()}<button class="btn" onclick="openFD()">Book FD from this account</button><div id="msg"></div></div>
<div class="card"><h3>Savings interest</h3><p class="m">Savings accounts earn 3.5% p.a., credited monthly on the current balance.</p><button class="btn" onclick="interest()">Credit this month’s interest</button></div></div>
<div class="card"><h3>Your fixed deposits</h3>${fds.length?`<div class="tw"><table><thead><tr><th>Booked</th><th class="n">Principal</th><th>Rate</th><th class="n">At maturity</th><th>Status</th><th></th></tr></thead><tbody>${fds.map(f=>`<tr><td>${dt(f.start)}</td><td class="n">${inr(f.p)}</td><td>${f.r}% · ${f.m}m</td><td class="n">${inr(maturity(f.p,f.r,f.m))}</td><td>${f.status}</td><td>${f.status=="Active"?`<button class="btn alt sm" onclick="closeFD('${f.id}',1)">Close early</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:'<p class="m">No fixed deposits yet.</p>'}</div>`},
loan(){const ls=D.loans.filter(l=>l.u==U.id);return`<div class="grid"><div class="card"><h3>Personal loan · 11.5% p.a.</h3>${fld("la","Amount (₹10,000 – 5,00,000)","number",'oninput="calc()"')}${fld("ln","Tenure (6 – 60 months)","number",'value="12" oninput="calc()"')}<p id="emi" class="m">Enter an amount to see your EMI.</p><button class="btn" onclick="applyLoan()">Apply and credit to this account</button><div id="msg"></div></div>
<div class="card"><h3>Your loans</h3>${ls.length?ls.map(l=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${inr(l.p)}</b> · EMI ${inr(l.emi)} · ${l.paid}/${l.m} paid · ${l.status}<div style="display:flex;gap:6px;margin-top:6px">${l.status=="Active"?`<button class="btn sm" onclick="payEMI('${l.id}')">Pay EMI</button><button class="btn alt sm" onclick="forecl('${l.id}')">Foreclose (${inr(out(l)*1.02)})</button>`:""}</div></div>`).join("")+'<div id="msg"></div>':'<p class="m">No loans taken.</p>'}</div></div>`},
bills(){return`<div class="card"><h3>Pay a bill</h3><label for="bc">Category</label><select id="bc">${opts(["Electricity","Mobile recharge","Water","DTH","Piped gas"].map(x=>[x,x]))}</select>${fld("bb","Biller name")}${fld("bk","Consumer or mobile number")}${fld("amt","Amount (₹)","number",'min="1"')}${pinf()}<button class="btn" onclick="payBill()">Pay now</button><div id="msg"></div></div>`},
card(){const c=D.cards[U.id],a=mine()[0],sp=today(a,"Card"),pc=Math.min(100,sp/c.limit*100),tx=D.txns.filter(t=>t.acc==a.no&&t.cat=="Card").slice(0,5);
return`<div class="cg"><div><div class="dc2 ${c.blocked?"off":""}"><div class="tp"><span class="bn">${LOGO} Campus Bank</span><span class="stt">${c.blocked?"Blocked":"Active"}</span></div>
<div class="cp"><div class="chip"></div><svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 8c3 3 3 7 0 10M12 5c5 5 5 11 0 16M17 2c7 7 7 15 0 22"/></svg></div>
<div class="nm">•••• •••• •••• ${c.no.slice(-4)}</div>
<div class="bt"><div><small>CARD HOLDER</small>${esc(U.name.toUpperCase())}</div><div><small>VALID THRU</small>${c.exp}</div><b>DEBIT</b></div></div><p class="m" style="margin:10px 0 0">Linked to account …${a.no.slice(-4)}</p></div>
<div class="card" style="margin:0"><h3>Card settings</h3><p style="margin:0">Status: <b class="${c.blocked?"dr":"cr"}">${c.blocked?"Blocked":"Active"}</b></p>
<div class="frow"><div>${pinf()}</div><button class="btn" onclick="cardBlock()">${c.blocked?"Unblock card":"Block card"}</button></div>
<div class="frow"><div><label for="cl">Daily purchase limit</label><select id="cl">${opts([10000,25000,50000,100000].map(x=>[x,inr(x)]),c.limit)}</select></div><button class="btn alt" onclick="cardLimit()">Save limit</button></div>
<p class="m" style="margin:16px 0 4px">Spent today: ${inr(sp)} of ${inr(c.limit)}</p><div style="height:8px;background:var(--line);border-radius:4px"><div style="height:8px;width:${pc}%;background:var(--brand);border-radius:4px"></div></div><div id="msg"></div></div></div>
<div class="cg2"><div class="card"><h3>Make a card payment</h3>${fld("mn","Merchant")}${fld("amt","Amount (₹)","number")}<button class="btn" onclick="swipe()">Pay with card</button></div><div class="card"><h3>Card transactions</h3>${rows(tx)}</div></div>`},
svc(){const rq=D.reqs.filter(r=>r.u==U.id);return`<div class="grid"><div class="card"><h3>Cheque book</h3><label for="cv">Leaves</label><select id="cv">${opts([[25,"25 leaves · free"],[50,"50 leaves · ₹100"]])}</select>${pinf()}<button class="btn" onclick="chq()">Request cheque book</button>
<div id="msg"></div></div>
<div class="card"><h3>Open a current account</h3><p class="m">Funded from the account selected above. Minimum ₹5,000.</p>${fld("ca","Opening amount (₹)","number")}${pinf().replace('id="pin"','id="pin2"').replace('for="pin"','for="pin2"')}<button class="btn" onclick="openCur()">Open current account</button>
<h3 style="margin-top:20px">Service requests</h3>${rq.map(r=>`<p class="m" style="margin:0 0 6px">${esc(r.t)} · ${r.ref} · ${dt(r.d)}</p>`).join("")||'<p class="m">None yet.</p>'}</div></div>`},
profile(){const ac=mine(),tot=sum(ac.map(a=>({amt:a.bal}))),fd=sum(D.fds.filter(f=>f.u==U.id&&f.status=="Active").map(f=>({amt:f.p}))),ln=sum(D.loans.filter(l=>l.u==U.id&&l.status=="Active").map(l=>({amt:out(l)}))),ini=U.name.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();
return`<div class="card pf"><div class="av">${esc(ini)}</div><div style="flex:1"><h3 style="margin:0;font-size:20px">${esc(U.name)}</h3><div class="m">Mobile ${U.mobile} · Customer since ${U.since?dt(U.since):"today"}</div>
<div style="margin-top:8px"><span class="pill ${U.kyc?"ok":"no"}">${U.kyc?"KYC verified":"KYC pending"}</span><span class="pill">UPI ${esc(U.upi)}</span><button class="btn alt sm" onclick="copy('${esc(U.upi)}')">Copy UPI ID</button></div></div></div><div id="msg"></div>
<div class="grid"><div class="card"><h3>Personal details</h3>${fld("pe","Email","email",`value="${esc(U.email||"")}"`)}${fld("pa","Address","text",`value="${esc(U.addr||"")}" maxlength="80"`)}${fld("pn","Nominee name","text",`value="${esc(U.nom||"")}" maxlength="40"`)}<button class="btn" onclick="saveProf()">Save details</button></div>
<div class="card"><h3>KYC and limits</h3>${U.kyc?`<p class="m" style="margin:0">PAN ${esc(U.pan)} verified.</p>`:`${fld("pan","PAN number","text",'maxlength="10" placeholder="ABCDE1234F"')}<button class="btn" onclick="doKYC()">Verify KYC</button>`}
</div></div>
<div class="card"><h3>Your accounts</h3>${ac.map(a=>`<div class="row"><b>${a.type}</b> · ${a.no} <button class="btn alt sm" onclick="copy('${a.no}')">Copy</button><div class="m">IFSC ${a.ifsc} · Balance ${inr(a.bal)} · ${a.frozen?"Frozen":"Active"}</div><button class="btn alt sm" style="margin-top:6px" onclick="freeze('${a.no}')">${a.frozen?"Unfreeze":"Freeze"} account</button></div>`).join("")}</div>
<div class="card"><h3>Security</h3><p class="m" style="margin:0">Last login: ${U.prev?new Date(U.prev).toLocaleString("en-IN"):"this is your first login"}</p><div class="grid"><div>${fld("op","Current PIN","password",'maxlength="4"')}</div><div>${fld("np","New 4-digit PIN","password",'maxlength="4"')}</div></div><button class="btn" onclick="chPin()">Change PIN</button></div>`
}};
/* ---------- actions ---------- */
function fl(){const q=F.q.toLowerCase();return D.txns.filter(t=>t.acc==AC&&(!F.dir||t.dir==F.dir)&&(!F.cat||t.cat==F.cat)&&(!F.from||t.date.slice(0,10)>=F.from)&&(!F.to||t.date.slice(0,10)<=F.to)&&(!q||(t.note+t.ref).toLowerCase().includes(q)))}
const rs=n=>"Rs. "+Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}),lat=s=>String(s).replace(/[^\x20-\x7E\u00A0-\u00FF]/g,"?");
function stm(){const a=acc(),t=D.txns.filter(x=>x.acc==a.no).reverse(),f=t[0],op=f?r2(f.dir=="c"?f.bal-f.amt:f.bal+f.amt):a.bal;
 return{a,t,op,cr:sum(t.filter(x=>x.dir=="c")),dr:sum(t.filter(x=>x.dir=="d")),addr:U.addr||"",
 info:[["Account holder",lat(U.name)],["Account number",a.no],["Account type",a.type+" account"],["IFSC",a.ifsc],["Branch","Main Branch"],["Account status",a.frozen?"Frozen":"Active"],["Mobile",U.mobile],["UPI ID",U.upi],["Email",lat(U.email||"-")],["KYC",U.kyc?"Verified":"Pending"]],
 period:t.length?dt(t[0].date)+" to "+dt(t[t.length-1].date):"No transactions",on:new Date().toLocaleString("en-IN")}}
function pdf(){const J=window.jspdf&&window.jspdf.jsPDF;if(!J){flash="The PDF tool could not load. Check your internet connection and try again.";return render()}
 const m=stm(),d=new J({unit:"pt",format:"a4"}),W=d.internal.pageSize.getWidth(),H=d.internal.pageSize.getHeight();
 d.setFillColor(20,33,61);d.rect(0,0,W,62,"F");d.setTextColor(255);d.setFontSize(20);d.text("Campus Bank",36,39);d.setFontSize(11);d.text("Statement of Account",W-36,39,{align:"right"});
 d.setTextColor(30);d.setFontSize(9.5);
 m.info.forEach(([k,x],i)=>{const cx=36+(i%2)*(W/2-10),cy=88+Math.floor(i/2)*15;d.setFont(undefined,"bold");d.text(k+":",cx,cy);d.setFont(undefined,"normal");d.text(String(x).slice(0,34),cx+84,cy)});
 let y=88+Math.ceil(m.info.length/2)*15;if(m.addr){d.setFont(undefined,"bold");d.text("Address:",36,y);d.setFont(undefined,"normal");d.text(d.splitTextToSize(lat(m.addr),W-130),120,y);y+=15}
 d.autoTable({startY:y+2,theme:"grid",body:[["Statement period",m.period,"Opening balance",rs(m.op)],["Statement date",m.on,"Total credits",rs(m.cr)],["","","Total debits",rs(m.dr)],["","","Closing balance",rs(m.a.bal)]],styles:{fontSize:9,textColor:30},columnStyles:{0:{fontStyle:"bold",cellWidth:90},2:{fontStyle:"bold",cellWidth:90},3:{halign:"right"}}});
 const rows=m.t.map(t=>[dt(t.date),t.ref,lat(t.note),t.dir=="d"?rs(t.amt):"",t.dir=="c"?rs(t.amt):"",rs(t.bal)]);
 d.autoTable({startY:d.lastAutoTable.finalY+14,head:[["Date","Reference","Description","Debit","Credit","Balance"]],body:rows.length?rows:[["","","No transactions yet","","",""]],theme:"striped",headStyles:{fillColor:[20,33,61]},styles:{fontSize:8.5},columnStyles:{3:{halign:"right"},4:{halign:"right"},5:{halign:"right"}}});
 const n=d.internal.getNumberOfPages();for(let i=1;i<=n;i++){d.setPage(i);d.setFontSize(8);d.setTextColor(110);d.text("This is a computer-generated statement and does not need a signature.",36,H-20);d.text("Page "+i+" of "+n,W-36,H-20,{align:"right"})}
 saveFile("statement-"+m.a.no+".pdf",d.output("arraybuffer"),"application/pdf")}
function csv(){const m=stm(),q=x=>'"'+String(x).replace(/"/g,'""')+'"',L=[["Campus Bank - Statement of Account"],...m.info,["Address",m.addr||"-"],["Statement period",m.period],["Statement date",m.on],["Opening balance",m.op],["Total credits",m.cr],["Total debits",m.dr],["Closing balance",m.a.bal],[],["Date","Reference","Description","Debit","Credit","Balance"],...m.t.map(t=>[t.date.slice(0,10),t.ref,t.note,t.dir=="d"?t.amt:"",t.dir=="c"?t.amt:"",t.bal])];
 saveFile("statement-"+m.a.no+".csv","\ufeff"+L.map(r=>r.map(q).join(",")).join("\n"),"text/csv")}
function calc(){const p=+v("la"),n=+v("ln"),e=$("emi");if(!(p>=10000&&p<=500000&&n>=6&&n<=60)){e.textContent="Amount must be ₹10,000 – ₹5,00,000 and tenure 6 – 60 months.";return}
 const m=emi(p,11.5,n);e.innerHTML=`<b>EMI ${inr(m)}</b> · total interest ${inr(m*n-p)} · total payable ${inr(m*n)}`}
function out(l){const r=l.r/1200,k=l.paid,n=l.m;return r2(l.p*(Math.pow(1+r,n)-Math.pow(1+r,k))/(Math.pow(1+r,n)-1))}
function copy(t){const ok=()=>{flash="Copied "+t;render()},no=()=>{flash="Copy this manually: "+t;render()};try{navigator.clipboard.writeText(t).then(ok,no)}catch(e){no()}}
/* ---------- server calls ---------- */
let TOKEN=null;try{TOKEN=localStorage.getItem("cb.token")}catch(e){}
const setToken=t=>{TOKEN=t;try{t?localStorage.setItem("cb.token",t):localStorage.removeItem("cb.token")}catch(e){}};
async function api(path,body){const o={method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json"}};if(TOKEN)o.headers.Authorization="Bearer "+TOKEN;if(body!==undefined)o.body=JSON.stringify(body);
 let r;try{r=await fetch("/api"+path,o)}catch(e){throw new Error("Cannot reach the server. Check your connection.")}
 const j=await r.json().catch(()=>({}));if(!r.ok){if(r.status==401&&TOKEN){setToken(null);U=null;render()}throw new Error(j.error||"Something went wrong.")}return j}
async function refresh(){const s=await api("/state");U=s.user;D={accounts:s.accounts,txns:s.txns,fds:s.fds,loans:s.loans,cards:{[U.id]:s.card},notes:s.notes,reqs:s.reqs}}
async function run(path,body,then){try{const j=await api(path,body);await refresh();if(then)then(j);done(j.msg||"Done.")}catch(e){fail(e.message)}}
async function login(){try{const j=await api("/login",{mobile:v("lm").trim(),pin:v("lp")});setToken(j.token);await refresh();AC=mine()[0].no;V="home";flash="";render()}catch(e){fail(e.message)}}
async function register(){const n=v("rn").trim(),m=v("lm").trim(),p=v("lp"),d=r2(+v("rd"));
 if(n.length<3)return fail("Enter your full name.");if(!/^\d{10}$/.test(m))return fail("Mobile number must be 10 digits.");if(!/^\d{4}$/.test(p))return fail("PIN must be exactly 4 digits.");if(!(d>=1000))return fail("Savings accounts need an opening deposit of at least ₹1,000.");
 try{const j=await api("/register",{name:n,mobile:m,pin:p,deposit:d});setToken(j.token);await refresh();AC=mine()[0].no;V="home";flash="Welcome to Campus Bank. Your account number is "+AC+".";render()}catch(e){fail(e.message)}}
async function logout(){try{await api("/logout",{})}catch(e){}setToken(null);U=null;D=null;render()}
const doTransfer=()=>run("/transfer",{from:AC,to:v("tt")=="new"?v("tu").trim():v("tt"),amt:r2(+v("amt")),pin:v("pin")});
const openFD=()=>run("/fd",{acc:AC,amt:r2(+v("fa")),months:+v("fm"),pin:v("pin")});
const closeFD=id=>run("/fd/close",{id});
const interest=()=>run("/interest",{acc:AC});
const applyLoan=()=>run("/loan",{acc:AC,amt:r2(+v("la")),months:+v("ln")});
const payEMI=id=>run("/loan/pay",{id}),forecl=id=>run("/loan/foreclose",{id});
const payBill=()=>run("/bill",{acc:AC,cat:v("bc"),biller:v("bb").trim(),consumer:v("bk").trim(),amt:r2(+v("amt")),pin:v("pin")});
const cardBlock=()=>run("/card/block",{pin:v("pin")}),cardLimit=()=>run("/card/limit",{limit:+v("cl")}),swipe=()=>run("/card/pay",{merchant:v("mn").trim(),amt:r2(+v("amt"))});
const chq=()=>run("/cheque",{acc:AC,leaves:+v("cv"),pin:v("pin")});
const chPin=()=>run("/pin",{pin:v("op"),new:v("np")});
const openCur=()=>run("/account/open",{from:AC,amt:r2(+v("ca")),pin:v("pin2")},j=>{AC=j.no});
const doKYC=()=>run("/kyc",{pan:v("pan")});
const saveProf=()=>run("/profile",{email:v("pe").trim(),addr:v("pa").trim(),nom:v("pn").trim()});
const freeze=no=>run("/account/freeze",{acc:no});
function saveFile(name,data,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click()}
(async()=>{if(TOKEN){try{await refresh();AC=mine()[0].no}catch(e){setToken(null);U=null}}render()})();
