import React, { useEffect, useState } from 'react';
import './light.css';
import { lightEndpoint } from './lightEndpoint';
const empty = { plans: [], licenses: [], installations: [], activations: [], payments: [], audit: [] };
const when = date => date ? new Date(date).toLocaleString() : '—';
const money = row => new Intl.NumberFormat(undefined, { style: 'currency', currency: row.currency || 'PHP' }).format(row.amount / 100);
export default function LightAdmin({ password }) {
  const [data, setData] = useState(empty), [tab, setTab] = useState('overview'), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [search, setSearch] = useState('');
  const [planId, setPlanId] = useState('monthly'), [email, setEmail] = useState('');
  async function request(body) {
    const response = await fetch(lightEndpoint('admin'), { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error((result.status || 'Light administration unavailable').replace(/_/g, ' '));
    return result;
  }
  async function refresh() {
    setBusy(true);
    try { setData(await request()); } catch(e) { setMessage(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, [password]);
  async function action(action, id, values, confirmation) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(true); setMessage('');
    try {
      const result = await request({ action, id, values });
      setMessage(result.licenseKey ? `Light license created: ${result.licenseKey}` : 'Light changes saved.');
      await refresh();
    } catch(e) { setMessage(e.message); } finally { setBusy(false); }
  }
  const filtered = rows => rows.filter(row => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  const activeLicenses = data.licenses.filter(l => l.status === 'active' && (!l.expires_at || Date.parse(l.expires_at) > Date.now()));
  return <section className="light-admin">
    <header className="light-admin-heading"><div><p className="eyebrow">Separate product · Web booth</p><h2>PhotoTags Light</h2><p>Licenses, registered installations and payments for the Light booth.</p></div><button className="outline-button" disabled={busy} onClick={refresh}>Refresh Light</button></header>
    <nav className="light-tabs" aria-label="PhotoTags Light sections">{['overview','licenses','installations','plans','payments'].map(t => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</nav>
    <p className="light-admin-message" role="status">{busy ? 'Loading Light records...' : message}</p>
    <p className="light-admin-note">These records belong to PhotoTags Light. APK licenses, devices, pricing and payments are managed in their existing sections. Lists show up to 1,000 recent records per section.</p>
    {tab === 'overview' && <><div className="light-summary">{[['Active Light licenses',activeLicenses.length],['Registered installations',data.installations.length],['Light payments',data.payments.filter(p=>p.status==='paid').length]].map(([label,value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><h3>Recent Light activity</h3><div className="light-table-wrap"><table><thead><tr><th>Action</th><th>Subject</th><th>Time</th></tr></thead><tbody>{data.audit.slice(0,30).map(a=><tr key={a.id}><td>{a.action}</td><td>{a.subject}</td><td>{when(a.created_at)}</td></tr>)}</tbody></table></div></>}
    {['licenses','installations','payments'].includes(tab) && <label className="light-search">Search Light {tab}<input value={search} onChange={e=>setSearch(e.target.value)} /></label>}
    {tab === 'licenses' && <><form className="light-create" onSubmit={e=>{e.preventDefault();void action('create_license','',{planId,email});}}><h3>Issue a Light license</h3><label>Plan<select value={planId} onChange={e=>setPlanId(e.target.value)}>{data.plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Customer email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} /></label><button className="primary-button" disabled={busy || !data.plans.length}>Create Light license</button></form>
      <div className="light-table-wrap"><table><thead><tr><th>License / customer</th><th>Plan / seats</th><th>Status</th><th>Expiry</th><th>Action</th></tr></thead><tbody>{filtered(data.licenses).map(l=><tr key={l.id}><td><code>{l.license_key}</code><small>{l.customer_email || 'No email'}</small></td><td>{l.plan_id}<small>{data.activations.filter(a=>a.license_id===l.id).length}/{l.max_installations} installations</small></td><td>{l.expires_at && Date.parse(l.expires_at)<=Date.now() ? 'expired' : l.status}</td><td>{l.expires_at ? when(l.expires_at) : 'Lifetime'}</td><td><button disabled={busy} onClick={()=>action('set_license_status',l.id,{status:l.status==='active'?'revoked':'active'},'Change this Light license status? Existing offline permits can remain valid until their expiry.')}>{l.status==='active'?'Revoke':'Reactivate'}</button></td></tr>)}</tbody></table></div></>}
    {tab === 'installations' && <><p>Last seen is the last successful server check, not a live online indicator. Block/release takes effect on reconnect; saved offline permits expire at the time shown.</p><div className="light-table-wrap"><table><thead><tr><th>Installation</th><th>Platform</th><th>License</th><th>Last seen / offline until</th><th>Actions</th></tr></thead><tbody>{filtered(data.installations).map(i=>{
      const activation=data.activations.find(a=>a.installation_id===i.id);const license=data.licenses.find(l=>l.id===activation?.license_id);
      return <tr key={i.id}><td><strong>{i.name}</strong><small>{i.id}</small><small>{i.blocked?'Blocked':'Registered'}</small></td><td>{i.platform}</td><td>{license?.license_key || 'Not activated'}</td><td>{when(i.last_seen_at)}<small>Offline until: {when(i.last_permit_expires_at)}</small></td><td><button disabled={busy} onClick={()=>action('set_installation_blocked',i.id,{blocked:!i.blocked},'Change this Light installation status? Issued offline permits remain valid until expiry.')}>{i.blocked?'Unblock':'Block'}</button><button disabled={busy || !activation} onClick={()=>action('release_installation',i.id,{},'Release this Light seat for transfer? The old installation will be blocked. Activate the same key on the new installation. Avoid overlapping use until the old offline permit expires.')}>Release for transfer</button></td></tr>;
    })}</tbody></table></div></>}
    {tab === 'plans' && <><p>Light plans start disabled. Set their price and terms, then enable sales. Prices below are in PHP. Existing purchases retain the terms recorded at checkout.</p><div className="light-plan-editor-grid">{data.plans.map(p=><PlanEditor key={JSON.stringify(p)} plan={p} busy={busy} onSave={values=>action('update_plan',p.id,values)} />)}</div></>}
    {tab === 'payments' && <div className="light-table-wrap"><table><thead><tr><th>Reference / customer</th><th>Plan / amount</th><th>Status</th><th>Installation</th><th>Created / paid</th></tr></thead><tbody>{filtered(data.payments).map(p=><tr key={p.id}><td>{p.reference_number}<small>{p.customer_email}</small></td><td>{p.plan_id}<small>{money(p)}</small></td><td>{p.status}{p.status==='pending' && <form onSubmit={e=>{e.preventDefault();void action('recover_checkout',p.id,{checkoutId:new FormData(e.currentTarget).get('checkoutId')},'Verify this checkout with PayMongo and reconcile only this Light purchase?');}}><label>PayMongo checkout ID<input name="checkoutId" placeholder="cs_..." required pattern="cs_[A-Za-z0-9_]+" /></label><button disabled={busy}>Verify / recover checkout</button></form>}</td><td>{p.installation_id}</td><td>{when(p.created_at)}<small>{when(p.paid_at)}</small></td></tr>)}</tbody></table></div>}
  </section>;
}
function PlanEditor({plan,busy,onSave}) {
  const [draft,setDraft]=useState({name:plan.name,pesos:plan.amount/100,durationDays:plan.duration_days ?? '',maxInstallations:plan.max_installations,active:plan.active});
  const field=(name,value)=>setDraft({...draft,[name]:value});
  return <form className="light-plan-editor" onSubmit={e=>{e.preventDefault();onSave({name:draft.name,amount:Math.round(Number(draft.pesos)*100),durationDays:draft.durationDays===''?null:Number(draft.durationDays),maxInstallations:Number(draft.maxInstallations),active:draft.active});}}><h3>{plan.name}</h3><label>Name<input required maxLength={80} value={draft.name} onChange={e=>field('name',e.target.value)} /></label><label>Price (PHP)<input required type="number" min={draft.active?1:0} max={100000} step="0.01" value={draft.pesos} onChange={e=>field('pesos',e.target.value)} /></label><label>Duration in days (blank = lifetime)<input type="number" min="1" max="36500" value={draft.durationDays} onChange={e=>field('durationDays',e.target.value)} /></label><label>Installation allowance<input required type="number" min="1" max="1000" value={draft.maxInstallations} onChange={e=>field('maxInstallations',e.target.value)} /></label><label><input type="checkbox" checked={draft.active} onChange={e=>field('active',e.target.checked)} />Enable Light sales</label><button className="primary-button" disabled={busy}>Save Light plan</button></form>;
}
