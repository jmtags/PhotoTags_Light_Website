-- Additive reprint journal and business-scoped reporting. No history is invented.
begin;
alter table public.transactions
  add column if not exists copies_requested integer,
  add column if not exists print_status text,
  add column if not exists original_transaction_id text,
  add column if not exists source_mode text;
alter table public.transactions drop constraint if exists transactions_mode;
alter table public.transactions add constraint transactions_mode
  check (mode in ('Photobooth', 'ID Photo', 'Receiptbooth', 'Reprint'));
alter table public.transactions drop constraint if exists transactions_payment_method;
alter table public.transactions add constraint transactions_payment_method
  check (payment_method in ('coin', 'voucher', 'qrph', 'none'));
alter table public.transactions drop constraint if exists transactions_reprint_metadata;
alter table public.transactions add constraint transactions_reprint_metadata check (
  (copies_requested is null or copies_requested between 1 and 10)
  and (print_status is null or print_status in ('submitted', 'partial', 'failed', 'unknown'))
  and ((copies_requested is null) = (print_status is null))
  and (mode <> 'Reprint' or (copies_requested is not null and print_status is not null))
  and (copies_requested is null or prints_used <= copies_requested)
  and (print_status is distinct from 'submitted' or prints_used = copies_requested)
  and (print_status is distinct from 'partial' or prints_used between 1 and copies_requested - 1)
  and (print_status is distinct from 'failed' or prints_used = 0)
  and (original_transaction_id is null or char_length(btrim(original_transaction_id)) between 1 and 200)
  and (source_mode is null or source_mode in ('Photobooth', 'ID Photo', 'Receiptbooth'))
  and (payment_method <> 'none' or (mode = 'Reprint' and amount_centavos = 0 and voucher_code is null))
  and (mode <> 'Reprint' or
    (amount_centavos > 0 and status = 'completed') or
    (amount_centavos = 0 and status = case when prints_used > 0 then 'completed' else 'failed' end))
);

create or replace function public.business_transaction_report(
  p_business_id uuid,
  p_date_from date default null, p_date_to date default null,
  p_device_id text default null, p_mode text default null,
  p_payment_method text default null, p_status text default null,
  p_page integer default 1, p_page_size integer default 50
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_business_id is null or p_page is null or p_page < 1 or p_page > 1000000
     or p_page_size is null or p_page_size < 1 or p_page_size > 100
     or (p_date_from is not null and p_date_to is not null and p_date_from > p_date_to)
     or (p_mode is not null and p_mode not in ('Photobooth', 'ID Photo', 'Receiptbooth', 'Reprint'))
     or (p_payment_method is not null and p_payment_method not in ('coin', 'voucher', 'qrph', 'none'))
     or (p_status is not null and p_status not in ('completed', 'failed')) then
    raise exception 'invalid_report_filters';
  end if;
  return (
    with filtered as materialized (
      select t.* from public.transactions t
      where t.business_id = p_business_id
        and (p_date_from is null or t.occurred_at >= (p_date_from::timestamp at time zone 'Asia/Manila'))
        and (p_date_to is null or t.occurred_at < ((p_date_to + 1)::timestamp at time zone 'Asia/Manila'))
        and (p_device_id is null or t.device_id = p_device_id)
        and (p_mode is null or t.mode = p_mode)
        and (p_payment_method is null or t.payment_method = p_payment_method)
        and (p_status is null or t.status = p_status)
    ), totals as (
      select count(*) as total,
        jsonb_build_object(
          'recordedRevenueCentavos', coalesce(sum(amount_centavos) filter (where status = 'completed'), 0),
          'completedTransactions', count(*) filter (where status = 'completed'),
          'coinPayments', count(*) filter (where payment_method = 'coin' and status = 'completed'),
          'voucherPayments', count(*) filter (where payment_method = 'voucher' and status = 'completed'),
          'qrphPayments', count(*) filter (where payment_method = 'qrph' and status = 'completed'),
          'failedVoucherAttempts', count(*) filter (where payment_method = 'voucher' and status = 'failed'),
          'receiptboothCopiesRecorded', coalesce(sum(prints_used) filter (where mode = 'Receiptbooth' and status = 'completed'), 0),
          'reprintBatches', count(*) filter (where mode = 'Reprint'),
          'reprintCopiesSent', coalesce(sum(prints_used) filter (where mode = 'Reprint'), 0),
          'reprintCopiesRequested', coalesce(sum(copies_requested) filter (where mode = 'Reprint'), 0),
          'freeAdminReprintBatches', count(*) filter (where mode = 'Reprint' and payment_method = 'none'),
          'paidReprintRevenueCentavos', coalesce(sum(amount_centavos) filter (where mode = 'Reprint' and status = 'completed' and amount_centavos > 0), 0),
          'failedReprintBatches', count(*) filter (where mode = 'Reprint' and print_status = 'failed'),
          'partialReprintBatches', count(*) filter (where mode = 'Reprint' and print_status = 'partial'),
          'unknownReprintBatches', count(*) filter (where mode = 'Reprint' and print_status = 'unknown')
        ) as summary
      from filtered
    ), page_rows as (
      select id, device_id, transaction_id, occurred_at, received_at, mode, payment_method,
        status, amount_centavos, voucher_code, prints_used, note, copies_requested,
        print_status, original_transaction_id, source_mode
      from filtered order by occurred_at desc, id desc
      limit p_page_size offset ((p_page::bigint - 1) * p_page_size)
    )
    select jsonb_build_object(
      'transactions', coalesce((select jsonb_agg(to_jsonb(r) order by r.occurred_at desc, r.id desc) from page_rows r), '[]'::jsonb),
      'summary', totals.summary, 'total', totals.total,
      'page', p_page, 'pageSize', p_page_size,
      'hasMore', totals.total > p_page::bigint * p_page_size,
      'reportingTimezone', 'Asia/Manila', 'asOf', transaction_timestamp()
    ) from totals
  );
end;
$$;
-- The server supplies the authenticated business ID. Never expose this RPC to clients.
revoke all on function public.business_transaction_report(uuid, date, date, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.business_transaction_report(uuid, date, date, text, text, text, text, integer, integer) to service_role;
commit;
