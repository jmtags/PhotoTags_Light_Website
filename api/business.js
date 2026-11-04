const auth = require('../server/business-auth');
const dashboard = require('../server/business-dashboard');
const pairingCode = require('../server/business-pairing-code');
const paymongo = require('../server/business-paymongo');
const transactions = require('../server/business-transactions');

function routeName(request) {
  return request.query?.route || new URL(request.url || '/', 'https://phototags.local').searchParams.get('route');
}

module.exports = async function handler(request, response) {
  const route = routeName(request);

  if (route === 'transactions') {
    await transactions(request, response);
    return;
  }

  if (route === 'auth') {
    await auth(request, response);
    return;
  }

  if (route === 'dashboard') {
    await dashboard(request, response);
    return;
  }

  if (route === 'paymongo') {
    await paymongo(request, response);
    return;
  }

  if (route === 'pairing-code') {
    await pairingCode(request, response);
    return;
  }

  response.statusCode = 404;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ ok: false, status: 'route_not_found' }));
};
