const { createClient } = require('@supabase/supabase-js');
const buckets = new Map();
function createClientFromEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function sendJson(response, code, body) {
  response.statusCode = code;
  response.setHeader('Content-Type','application/json');
  response.setHeader('Cache-Control','no-store');
  response.end(JSON.stringify(body));
}
function checkRateLimit(request, route, limit, windowMs) {
  const now=Date.now();
  if(buckets.size>10000)for(const [key,bucket] of buckets)if(bucket.until<=now)buckets.delete(key);
  const ip=String(request.headers['x-forwarded-for']||request.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const key=`${route}:${ip}`;let bucket=buckets.get(key);
  if(!bucket||bucket.until<=now){bucket={count:0,until:now+windowMs};buckets.set(key,bucket);}
  return ++bucket.count<=limit;
}
module.exports={createClientFromEnv,sendJson,checkRateLimit};
