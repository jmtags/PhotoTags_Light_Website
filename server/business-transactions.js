const { createClientFromEnv, getBusinessAuth, sendJson } = require('./_business-utils');
const { MODES, METHODS } = require('./_reprint-contract');

function reportParams(search, businessId) {
  const optional = name => {
    const value = search.get(name);
    return !value || value === 'all' ? null : value;
  };
  const date = name => {
    const value = optional(name);
    if (value === null) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('invalid_report_filters');
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('invalid_report_filters');
    return value;
  };
  const pageText = search.get('page') || '1';
  const sizeText = search.get('pageSize') || '50';
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(sizeText)) throw new Error('invalid_report_filters');
  const params = {
    p_business_id: businessId, p_date_from: date('dateFrom'), p_date_to: date('dateTo'),
    p_device_id: optional('deviceId'), p_mode: optional('mode'),
    p_payment_method: optional('paymentMethod'), p_status: optional('status'),
    p_page: Number(pageText), p_page_size: Number(sizeText)
  };
  if (params.p_page < 1 || params.p_page > 1000000 || params.p_page_size < 1 || params.p_page_size > 100
    || (params.p_date_from && params.p_date_to && params.p_date_from > params.p_date_to)
    || (params.p_device_id && params.p_device_id.length > 200)
    || (params.p_mode && !MODES.includes(params.p_mode))
    || (params.p_payment_method && !METHODS.includes(params.p_payment_method))
    || (params.p_status && !['completed', 'failed'].includes(params.p_status))) throw new Error('invalid_report_filters');
  return params;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { ok: false, status: 'method_not_allowed' }, { Allow: 'GET' });
  const supabase = createClientFromEnv();
  if (!supabase) return sendJson(response, 500, { ok: false, status: 'server_not_configured' });
  const auth = await getBusinessAuth(request, supabase);
  if (!auth) return sendJson(response, 401, { ok: false, status: 'unauthenticated' });
  let params;
  try { params = reportParams(new URL(request.url, 'https://phototags.local').searchParams, auth.business.id); }
  catch { return sendJson(response, 400, { ok: false, status: 'invalid_report_filters' }); }
  const { data, error } = await supabase.rpc('business_transaction_report', params);
  if (error || !data) return sendJson(response, 503, { ok: false, status: 'transaction_report_unavailable' });
  sendJson(response, 200, { ok: true, ...data });
};
module.exports.reportParams = reportParams;
