// Local fixture only. No PayMongo network requests or production credentials.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
module.exports = function fixture() {
  const intents = new Map(), checkouts = new Map(), calls = []; let sequence = 0;
  const fetcher = async (url, options) => {
    calls.push({url,options}); const path = new URL(url).pathname;
    const input = options.body ? JSON.parse(options.body).data.attributes : {};
    let value;
    if (path === '/v2/checkout_sessions' && options.method === 'POST') {
      const id='cs_fixture_'+crypto.randomUUID().replaceAll('-',''); value={id,attributes:{...input,checkout_url:`https://checkout.paymongo.com/${id}`,payments:[]}};checkouts.set(id,value);
    } else if (path.startsWith('/v1/checkout_sessions/')) { value=checkouts.get(path.split('/')[3]);assert.ok(value);
    } else if (path === '/v1/payment_intents' && options.method === 'POST') {
      value = {id:`pi_fixture_${++sequence}_${crypto.randomUUID().replaceAll('-','')}`,attributes:{...input,status:'awaiting_payment_method',payments:[]}};
      intents.set(value.id,value);
    } else if (path === '/v1/payment_methods') {
      assert.equal(input.type,'qrph'); value = {id:'pm_fixture'};
    } else {
      const id = path.split('/')[3]; value = intents.get(id); assert.ok(value,`Unknown fixture intent ${id}`);
      if (path.endsWith('/attach')) {
        value.attributes.status = 'awaiting_next_action';
        value.attributes.next_action = {code:{image_url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/e0AAAAASUVORK5CYII='}};
      }
      if (path.endsWith('/cancel')) { assert.notEqual(value.attributes.status,'succeeded'); value.attributes.status='cancelled'; }
    }
    return {ok:true,json:async()=>({data:structuredClone(value)})};
  };
  return {fetcher,intents,checkouts,calls,pay(id){const intent=intents.get(id)||checkouts.get(id),a=intent.attributes;a.status='succeeded';a.payments=[{id:'pay_fixture',attributes:{status:'paid',amount:a.amount||a.line_items[0].amount,currency:a.currency||'PHP',payment_intent_id:id,source:{type:'qrph'}}}];}};
};
