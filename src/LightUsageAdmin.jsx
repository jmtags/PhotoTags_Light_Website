import React,{useCallback,useEffect,useRef,useState} from 'react';
import {lightEndpoint} from './lightEndpoint';
import './LightUsageAdmin.css';
const when=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Not reported';
const number=value=>new Intl.NumberFormat('en-PH').format(value||0);
const profiles={deli:'Deli ES423 · 384 dots',g80:'VOZY G80 · 576 dots'};
export default function LightUsageAdmin({password}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [offset,setOffset]=useState(0),[search,setSearch]=useState(''),[query,setQuery]=useState('');
 const pending=useRef(null),generation=useRef(0);
 const refresh=useCallback(async()=>{
  pending.current?.abort();const controller=new AbortController();pending.current=controller;const current=++generation.current;
  setBusy(true);
  try{
   const response=await fetch(lightEndpoint('admin-usage')+`&offset=${offset}&search=${encodeURIComponent(query)}`,{headers:{'X-Admin-Password':password},cache:'no-store',signal:controller.signal});
   const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.status==='unauthorized'?'Your admin session could not access usage data. Sign in again.':'Usage data is temporarily unavailable.');
   if(current===generation.current){setData(result);setError('');}
  }catch(e){if(e.name!=='AbortError'&&current===generation.current)setError(e.message);}
  finally{if(current===generation.current)setBusy(false);}
 },[password,offset,query]);
 useEffect(()=>{
  void refresh();const update=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void refresh();};
  const interval=setInterval(update,30000);document.addEventListener('visibilitychange',update);window.addEventListener('online',update);
  return()=>{generation.current++;pending.current?.abort();clearInterval(interval);document.removeEventListener('visibilitychange',update);window.removeEventListener('online',update);};
 },[refresh]);
 return <section className="light-usage" aria-label="PhotoTags LRB usage analytics">
  <div className="light-usage-heading"><div><h3>PhotoTags LRB usage</h3><p>App opens, online activity and reported equipment.</p></div><button className="outline-button" onClick={()=>void refresh()} disabled={busy}>Refresh usage</button></div>
  {error&&<p role="alert" className="light-usage-alert">{error}</p>}
  <p role="status" className="light-admin-note">{busy?'Updating usage...':data?.generatedAt?`Updated ${when(data.generatedAt)} · Philippine time. Refreshes every 30 seconds while this page is visible.`:''}</p>
  {data?.available===false?<div className="light-usage-empty"><h4>Usage tracking needs database setup</h4><p>Run <code>202611120004_light_usage_tracking.sql</code> in Supabase SQL Editor, then refresh this tab. Existing licensing continues to work.</p></div>:data?.available&&<>
   <div className="light-summary">{[['App opens',data.summary.pageViews],['Unique installations',data.summary.uniqueInstallations],['Online now',data.summary.activeNow],['Active today',data.summary.activeToday],['Opens today',data.summary.viewsToday],['Active last 30 days',data.summary.active30Days]].map(([label,value])=><article key={label}><span>{label}</span><strong>{number(value)}</strong></article>)}</div>
   <p className="light-admin-note">Online now means a visible app reported within the last 5 minutes. Unique installations are browser/app installations, not individual people or hardware IDs. Offline devices cannot report live activity. Counts begin after tracking setup.</p>
   <div className="light-usage-panels"><article><h4>App opens · last 30 days</h4><p>{number(data.summary.views30Days)} opens</p><div className="light-usage-chart" role="img" aria-label={`Daily app opens over the last 30 days, total ${data.summary.views30Days}`}>
    {data.daily.map(day=><div key={day.day} title={`${day.day}: ${day.views} opens, ${day.active} active installations`}><span style={{height:`${Math.max(2,Number(day.views)/Math.max(1,...data.daily.map(d=>Number(d.views)))*125)}px`}}/></div>)}
   </div><div className="light-usage-chart-labels"><span>{data.daily[0]?.day}</span><span>{data.daily.at(-1)?.day}</span></div><details><summary>Daily numbers</summary><div className="light-table-wrap" tabIndex={0} role="region" aria-label="Daily usage numbers"><table><thead><tr><th>Date</th><th>App opens</th><th>Active installations</th></tr></thead><tbody>{[...data.daily].reverse().map(day=><tr key={day.day}><td>{day.day}</td><td>{number(day.views)}</td><td>{number(day.active)}</td></tr>)}</tbody></table></div></details></article>
    <article><h4>Reported operating systems</h4>{data.platforms.length?data.platforms.map(platform=><div className="light-usage-platform" key={platform.name}><span>{platform.name}</span><strong>{number(platform.count)}</strong></div>):<p>No devices have reported yet.</p>}</article>
   </div>
   <form className="light-usage-search" onSubmit={event=>{event.preventDefault();setOffset(0);setQuery(search.trim());}}><label>Find an installation or device<input value={search} maxLength={80} placeholder="Name, OS, camera or printer" onChange={event=>setSearch(event.target.value)}/></label><button className="outline-button" disabled={busy}>Search usage</button></form>
   <div className="light-table-wrap" tabIndex={0} role="region" aria-label="Installation equipment and activity"><table className="light-usage-table"><thead><tr><th>Installation</th><th>Activity</th><th>Device / browser</th><th>Last camera</th><th>Printer queue / profile</th><th>License</th></tr></thead><tbody>{data.devices.map(device=><tr key={device.installation_id}>
    <td><strong>{device.name}</strong><small>{device.installation_id}</small><small>{number(device.total_views)} opens</small></td>
    <td><span className={`light-usage-status ${device.online?'online':''}`}>{device.online?'Online':'Not recently online'}</span><small>{device.app_mode==='kiosk'?'Guest kiosk':'Settings'}</small><small>{when(device.last_seen_at)}</small></td>
    <td>{device.device.os} · {device.device.type}<small>{device.device.browser}</small><small>{device.device.installed?'Installed app':'Browser tab'}</small></td>
    <td>{device.camera.label||'Not reported'}<small>{device.camera.width&&device.camera.height?`${device.camera.width} × ${device.camera.height}`:''}{device.camera.facingMode?` · ${device.camera.facingMode}`:''}</small><small>{device.camera.active?'Camera open at last report':'Camera closed at last report'}</small></td>
    <td>{device.printer.queue||'No queue selected'}<small>{profiles[device.printer.profile]||'No profile reported'}</small></td>
    <td>{device.license_status}<small>{device.plan||''}</small></td>
   </tr>)}</tbody></table>{!data.devices.length&&<p className="light-usage-empty">No matching usage records yet. Open the updated booth online to send its first report.</p>}</div>
   <div className="light-usage-pagination"><span>{number(data.totalDevices)} matching installations · {data.totalDevices?offset+1:0}–{Math.min(offset+50,data.totalDevices)}</span><button className="outline-button" disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous devices</button><button className="outline-button" disabled={busy||offset+50>=data.totalDevices} onClick={()=>setOffset(offset+50)}>Next devices</button></div>
   <p className="light-admin-note">Camera labels appear only when the browser provides them after permission. Printer names are reported queue names and selected output profiles; they do not confirm the physical model or a successful print. Usage reports contain no photos, PINs, IP addresses or camera hardware IDs.</p>
  </>}
 </section>;
}
