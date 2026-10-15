// Build a branded, print-ready vendor spec for one campaign and open it in a new
// tab. The admin hits "Print / Save as PDF". Uses live campaign data (ping key,
// number) straight from the Campaigns page — nothing round-trips the server.

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function openVendorSpec(c) {
  const origin = window.location.origin;
  const logo = `${origin}/coverwise-logo.png`;
  const isPing = c.type !== 'direct';
  const number = c.phone_number || '[number not set]';
  const key = c.ping_key || '[no key]';
  const states = (c.states && c.states.length) ? c.states.join(', ') : 'any state you are approved to send';
  const cost = Number(c.cost_per_call || 0).toFixed(2);
  const buffer = c.buffer_seconds || 90;

  const pingBody = `
  <h2>Endpoint &amp; Authentication</h2>
  <div class="kv"><b>POST</b> &nbsp;<code>${origin}/api/ping</code> &nbsp;<span class="pill">Content-Type: application/json</span></div>
  <div class="kv">Authenticate with this campaign's ping key as header <code>X-Ping-Key: ${esc(key)}</code> (or <code>ping_key</code> in the body). Keep it server-side.</div>

  <h2>Request Fields</h2>
  <p class="s">Flat JSON. Field names are case-insensitive; spaces, underscores and hyphens are ignored.</p>
  <table>
  <tr><th>Field</th><th>Required</th><th>Notes / accepted aliases</th></tr>
  <tr><td>phone</td><td class="req">Required</td><td>Caller's phone number. Aliases: caller, callerid, ani, number.</td></tr>
  <tr><td>state</td><td class="req">Required</td><td>Caller's 2-letter state — enforces licensing. Aliases: st, region.</td></tr>
  <tr><td>zip</td><td>Optional</td><td>Caller's ZIP. Aliases: zipcode, postal.</td></tr>
  <tr><td>call_id</td><td>Optional</td><td>Your reference id, echoed back. Aliases: id, ref, reference, transaction_id, sub_id.</td></tr>
  </table>

  <div class="cols">
    <div>
      <h2>Example Request</h2>
      <pre>curl -X POST ${origin}/api/ping \\
  -H "X-Ping-Key: ${esc(key)}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "555-201-3040",
    "state": "TX",
    "zip": "75001",
    "call_id": "abc-123"
  }'</pre>
    </div>
    <div>
      <h2>Responses</h2>
      <pre>ACCEPT (route the call to "number"):
{
  "decision": "accept",
  "number": "${esc(number)}",
  "cost": ${cost},
  "buffer_seconds": ${buffer},
  "call_id": "..."
}

REJECT:
{ "decision": "reject",
  "reason": "no_agent" }</pre>
    </div>
  </div>

  <h2>Reject Reasons</h2>
  <div class="reasons">
    <div><code>missing_key</code> / <code>invalid_key</code> — bad or missing ping key</div>
    <div><code>inactive</code> — campaign is paused</div>
    <div><code>missing_state</code> — no caller state supplied</div>
    <div><code>state_not_allowed</code> — caller's state not bought here</div>
    <div><code>cap</code> — daily / monthly spend or concurrency cap reached</div>
    <div><code>duplicate</code> — same caller within the duplicate window</div>
    <div><code>no_agent</code> — no licensed agent available right now</div>
    <div><code>no_route_number</code> — campaign has no number set (contact us)</div>
  </div>`;

  const directBody = `
  <h2>How to Route</h2>
  <div class="kv">Send all calls for this campaign directly to:</div>
  <div class="routenum">${esc(number)}</div>
  <div class="kv">No ping required — we accept all calls on this number and route them to available licensed agents. Apply your own state/area filtering before routing.</div>

  <h2>What We Accept</h2>
  <table>
  <tr><th>Item</th><th>Detail</th></tr>
  <tr><td>States</td><td>${esc(states)}</td></tr>
  <tr><td>Hours</td><td>Route during the agency's staffed calling hours.</td></tr>
  </table>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.name)} — Coverwise Vendor Spec</title>
<style>
@page { size: Letter; margin: 0.5in; }
* { box-sizing:border-box; }
body { font-family:-apple-system,'Helvetica Neue',Arial,sans-serif; margin:0; color:#1f2430; padding:24px; }
.bar { position:fixed; top:0; left:0; right:0; background:#000077; color:#fff; padding:8px 16px; font-size:13px; display:flex; justify-content:space-between; align-items:center; }
.bar button { background:#98dcf5; color:#000077; border:none; border-radius:7px; padding:7px 14px; font-weight:800; cursor:pointer; font-size:13px; }
.wrap { max-width:720px; margin:48px auto 0; }
.top { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #000077; padding-bottom:12px; }
.top img { height:34px; } .top .tag { color:#000077; font-weight:800; font-size:12px; letter-spacing:.06em; text-transform:uppercase; }
h1 { color:#000077; font-size:20px; margin:14px 0 2px; }
.camp { color:#55607a; font-size:12px; margin:0 0 10px; }
h2 { color:#000077; font-size:12px; text-transform:uppercase; letter-spacing:.05em; margin:13px 0 5px; border-bottom:1px solid #dce3ef; padding-bottom:3px; }
p,li,td,th,.kv { font-size:10.8px; line-height:1.45; } .s{ color:#55607a; margin:2px 0; }
.kv { margin:3px 0; } .kv b { color:#000077; }
code { background:#eff9fe; border:1px solid #dcf1fb; border-radius:4px; padding:1px 5px; font-size:10px; color:#000077; word-break:break-all; }
table { width:100%; border-collapse:collapse; margin:4px 0; } th,td { border:1px solid #dce3ef; padding:5px 8px; text-align:left; vertical-align:top; }
th { background:#eff9fe; color:#000077; font-size:9.5px; text-transform:uppercase; }
.req { color:#b42318; font-weight:700; }
pre { background:#0d1230; color:#e8ecff; border-radius:8px; padding:10px 12px; font-size:9.6px; line-height:1.4; white-space:pre-wrap; margin:5px 0; }
.cols { display:flex; gap:16px; } .cols>div { flex:1; }
.reasons { columns:2; font-size:10px; } .reasons div { margin:2px 0; break-inside:avoid; }
.pill { display:inline-block; background:#98dcf5; color:#000077; font-weight:700; border-radius:999px; padding:1px 9px; font-size:9.5px; }
.routenum { font-size:22px; font-weight:800; color:#000077; background:#eff9fe; border:1px solid #dcf1fb; border-radius:10px; padding:10px 14px; display:inline-block; margin:4px 0; }
.foot { margin-top:14px; border-top:1px solid #dce3ef; padding-top:8px; color:#8a93a6; font-size:9px; }
@media print { .bar { display:none; } body { padding:0; } .wrap { margin-top:0; } }
</style></head><body>
<div class="bar"><span>Coverwise vendor spec — ${esc(c.name)}</span><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="wrap">
<div class="top"><img src="${logo}" alt="Coverwise"><span class="tag">${isPing ? 'Inbound Call Ping API' : 'Inbound Call Routing'}</span></div>
<h1>${isPing ? 'Inbound Call Ping API Specification' : 'Inbound Call Routing Specification'}</h1>
<div class="camp">Campaign: <b>${esc(c.name)}</b> &nbsp;·&nbsp; Cost per billable call: <b>$${cost}</b> &nbsp;·&nbsp; Billable after <b>${buffer}s</b> connected to an agent${isPing ? ` &nbsp;·&nbsp; States: <b>${esc(states)}</b>` : ''}</div>
${isPing ? pingBody : directBody}
<h2>Billing</h2>
<p>A call becomes <b>billable</b> only after it connects to an agent and remains connected past <b>${buffer} seconds</b>, at <b>$${cost}</b> per call. Send calls in real time, over HTTPS/SIP, during staffed hours.</p>
<div class="foot">Coverwise — gocoverwise.com &nbsp;•&nbsp; For questions, contact your Coverwise account manager. &nbsp;•&nbsp; Confidential.</div>
</div></body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to open the vendor spec.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
