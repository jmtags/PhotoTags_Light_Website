import React, { useEffect, useState } from 'react';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import './business-transactions.css';

const INITIAL = { dateFrom: '', dateTo: '', deviceId: 'all', mode: 'all', paymentMethod: 'all', status: 'all' };
const MODES = ['Photobooth', 'ID Photo', 'Receiptbooth', 'Reprint'];
const METHODS = ['coin', 'voucher', 'qrph', 'none'];
const PRINT_LABELS = { submitted: 'Sent to printer', partial: 'Partially sent to printer', failed: 'Sending failed', unknown: 'Send outcome unknown' };
const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0) / 100);
const date = value => value ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not recorded';

export default function BusinessTransactionsSection({ devices, refreshToken }) {
  const [filters, setFilters] = useState(INITIAL);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => controller.abort(), 20000);
    setLoading(true);
    setError('');
    setReport(null);
    setExpandedId(null);
    const params = new URLSearchParams({ ...filters, page: String(page), pageSize: '50' });
    (async () => {
      try {
        const response = await fetch(`/api/business/transactions?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.status || 'report_unavailable');
        if (active) setReport(payload);
      } catch (failure) {
        if (active) setError(failure.message === 'invalid_report_filters'
          ? 'Check the selected dates and filters, then try again.'
          : 'Transaction reporting is unavailable. Try Refresh again.');
      } finally {
        window.clearTimeout(timer);
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [filters, page, revision, refreshToken]);

  const change = (name, value) => { setPage(1); setFilters(current => ({ ...current, [name]: value })); };
  const metrics = report ? [
    ['Recorded revenue', money(report.summary.recordedRevenueCentavos)],
    ['Completed transactions', report.summary.completedTransactions],
    ['Coin payments', report.summary.coinPayments], ['Voucher payments', report.summary.voucherPayments],
    ['QR Ph payments', report.summary.qrphPayments], ['Failed voucher attempts', report.summary.failedVoucherAttempts],
    ['Receiptbooth copies recorded', report.summary.receiptboothCopiesRecorded],
    ['Reprint batches', report.summary.reprintBatches], ['Reprint copies requested', report.summary.reprintCopiesRequested],
    ['Reprint copies sent', report.summary.reprintCopiesSent], ['Free/admin reprint batches', report.summary.freeAdminReprintBatches],
    ['Paid-reprint revenue', money(report.summary.paidReprintRevenueCentavos)],
    ['Reprint sends failed', report.summary.failedReprintBatches], ['Reprint sends partial', report.summary.partialReprintBatches],
    ['Reprint outcomes unknown', report.summary.unknownReprintBatches]
  ] : [];

  return (
    <section className="business-card business-transactions-card" aria-busy={loading}>
      <div className="business-section-heading">
        <div>
          <h2>PhotoTags transactions and reprints</h2>
          <p>Payments and printer-send activity are tracked separately. Sent to printer does not confirm physical output.</p>
        </div>
        <div className="business-section-actions">
          <button className="outline-button" type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="outline-button" type="button" onClick={() => { setPage(1); setFilters({ ...INITIAL }); }}>
            <SlidersHorizontal size={18} /> Clear Filters
          </button>
        </div>
      </div>
      <div className="business-transaction-filters">
        <label>From<input type="date" value={filters.dateFrom} onChange={event => change('dateFrom', event.target.value)} /></label>
        <label>To<input type="date" value={filters.dateTo} onChange={event => change('dateTo', event.target.value)} /></label>
        <label>Device<input list="transaction-report-devices" placeholder="All devices" value={filters.deviceId === 'all' ? '' : filters.deviceId} onChange={event => change('deviceId', event.target.value || 'all')} />
          <datalist id="transaction-report-devices">{(devices || []).map(device => <option key={device.device_id} value={device.device_id} />)}</datalist>
        </label>
        <label>Mode<select value={filters.mode} onChange={event => change('mode', event.target.value)}>
          <option value="all">All modes</option>{MODES.map(mode => <option key={mode}>{mode}</option>)}
        </select></label>
        <label>Payment<select value={filters.paymentMethod} onChange={event => change('paymentMethod', event.target.value)}>
          <option value="all">All payments</option>{METHODS.map(method => <option key={method} value={method}>{method === 'none' ? 'No payment (free/admin)' : method}</option>)}
        </select></label>
        <label>Transaction status<select value={filters.status} onChange={event => change('status', event.target.value)}>
          <option value="all">All statuses</option><option value="completed">completed</option><option value="failed">failed</option>
        </select></label>
      </div>
      <p className="transaction-report-context">{!filters.dateFrom && !filters.dateTo ? 'All recorded dates' : `${filters.dateFrom || 'First record'} to ${filters.dateTo || 'Latest record'}`} | Asia/Manila. Totals cover every matching record, across all pages.</p>
      {loading ? <p role="status">Loading transaction report...</p> : null}
      {error ? <p className="login-error" role="alert">{error}</p> : null}
      {report ? <>
        <div className="business-transaction-summary reprint-summary">
          {metrics.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
        </div>
        <p className="transaction-report-context">Free copies add no revenue. Paid-reprint revenue is included in recorded revenue; a failed send does not remove a collected payment. Updated {date(report.asOf)}.</p>
        <div className="transaction-report-table-scroll" tabIndex={0} role="region" aria-label="Transactions and reprints table">
          <table className="transaction-report-table">
            <caption>Click a row or View details to see the full transaction.</caption>
            <thead><tr>
              <th scope="col">Occurred (Manila)</th><th scope="col">Type</th><th scope="col">Amount</th>
              <th scope="col">Payment</th><th scope="col">Status</th><th scope="col">Copies</th>
              <th scope="col">Device</th><th scope="col">Details</th>
            </tr></thead>
            <tbody>
              {report.transactions.length ? report.transactions.map(transaction => {
                const expanded = expandedId === transaction.id;
                const detailsId = `transaction-details-${transaction.id}`;
                const toggle = () => setExpandedId(current => current === transaction.id ? null : transaction.id);
                return (
                  <React.Fragment key={transaction.id}>
                    <tr className={`transaction-report-summary-row${expanded ? ' is-expanded' : ''}`} onClick={toggle}>
                      <td>{date(transaction.occurred_at)}</td>
                      <td><strong>{transaction.mode}</strong>{transaction.mode === 'Reprint' ? <small>{transaction.payment_method === 'none' ? 'Free/admin' : transaction.amount_centavos > 0 ? 'Paid' : 'No new charge'}</small> : null}</td>
                      <td>{money(transaction.amount_centavos)}</td>
                      <td>{transaction.payment_method === 'none' ? 'No payment' : transaction.payment_method}</td>
                      <td>{transaction.status}</td>
                      <td>{transaction.print_status ? `${transaction.prints_used} / ${transaction.copies_requested} sent` : `${transaction.prints_used} recorded`}</td>
                      <td className="transaction-report-device">{transaction.device_id}</td>
                      <td><button type="button" className="transaction-details-toggle" aria-expanded={expanded} aria-controls={detailsId}
                        aria-label={`${expanded ? 'Hide' : 'View'} details for ${transaction.mode} transaction ${transaction.transaction_id}`}
                        onClick={event => { event.stopPropagation(); toggle(); }}>{expanded ? 'Hide details' : 'View details'}</button></td>
                    </tr>
                    <tr id={detailsId} className="transaction-report-detail-row" hidden={!expanded}>
                      <td colSpan={8}>
                        {expanded ? <>
                          <h3>Transaction details</h3>
                          <dl className="transaction-report-details">
                            <div><dt>Mode</dt><dd>{transaction.mode}</dd></div>
                            <div><dt>Amount recorded</dt><dd>{money(transaction.amount_centavos)}</dd></div>
                            <div><dt>Payment method</dt><dd>{transaction.payment_method === 'none' ? 'No payment (free/admin)' : transaction.payment_method}</dd></div>
                            <div><dt>Transaction status</dt><dd>{transaction.status}</dd></div>
                            <div><dt>Copies requested</dt><dd>{transaction.copies_requested ?? 'Not recorded'}</dd></div>
                            <div><dt>{transaction.print_status ? 'Copies sent' : 'Legacy copies recorded'}</dt><dd>{transaction.prints_used}</dd></div>
                            <div><dt>Printer send status</dt><dd>{PRINT_LABELS[transaction.print_status] || 'Not recorded (legacy)'}</dd></div>
                            <div><dt>Device</dt><dd>{transaction.device_id}</dd></div>
                            <div><dt>Occurred (Manila)</dt><dd>{date(transaction.occurred_at)}</dd></div>
                            <div><dt>Synced (Manila)</dt><dd>{date(transaction.received_at)}</dd></div>
                            <div><dt>Source mode</dt><dd>{transaction.source_mode || 'Not recorded'}</dd></div>
                            <div><dt>Original device transaction ID</dt><dd>{transaction.original_transaction_id || 'Not linked'}</dd></div>
                            <div><dt>Device transaction ID</dt><dd>{transaction.transaction_id}</dd></div>
                            <div><dt>Record ID</dt><dd>{transaction.id}</dd></div>
                            <div><dt>Voucher code</dt><dd>{transaction.voucher_code || 'None'}</dd></div>
                          </dl>
                          {transaction.note ? <p className="transaction-report-note">{transaction.note}</p> : null}
                        </> : null}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              }) : <tr><td colSpan={8} className="queue-empty">No transactions match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="transaction-report-pagination">
          <button type="button" className="outline-button" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button>
          <span>Page {report.page} | {report.total} matching records</span>
          <button type="button" className="outline-button" disabled={!report.hasMore || loading} onClick={() => setPage(value => value + 1)}>Next</button>
        </div>
      </> : null}
    </section>
  );
}
