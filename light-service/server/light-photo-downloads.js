// Reuse the existing APK upload API without changing its handlers, tables or bucket.
const crypto=require('node:crypto');
async function reserve(installationId,fetcher=fetch) {
  const response=await fetcher('https://www.phototags.app/api/upload',{
    method:'POST',headers:{'Content-Type':'application/json','User-Agent':'PhotoTagsLight/'+crypto.createHash('sha256').update(installationId).digest('hex').slice(0,24)},
    body:JSON.stringify({contentType:'image/jpeg'}),signal:AbortSignal.timeout(12000),redirect:'error'
  });
  if(response.status===429)throw new Error('light_photo_rate_limited');
  if(!response.ok)throw new Error('light_photo_upload_service_unavailable');
  const result=await response.json();
  if(!result.ok || !/^[A-Za-z0-9_-]{4,64}$/.test(result.code||''))throw new Error('light_photo_upload_response_invalid');
  const upload=new URL(result.signedUploadUrl);
  if(upload.protocol!=='https:' || !upload.hostname.endsWith('.supabase.co') || upload.username || upload.password ||
     !upload.pathname.startsWith('/storage/v1/object/upload/sign/photobooth-downloads/'))throw new Error('light_photo_upload_response_invalid');
  const expiry=Date.parse(result.expiresAt);
  if(!Number.isFinite(expiry) || expiry<=Date.now() || expiry>Date.now()+31*60000)throw new Error('light_photo_upload_response_invalid');
  return {code:result.code,signedUploadUrl:upload.href,qrUrl:'https://www.phototags.app/download/'+result.code,expiresAt:result.expiresAt};
}
module.exports={reserve};
