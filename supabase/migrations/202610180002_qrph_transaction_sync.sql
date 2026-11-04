-- Allow Android's QR Ph transaction journal to use the existing sync path.
begin;
alter table public.transactions drop constraint if exists transactions_payment_method;
alter table public.transactions add constraint transactions_payment_method
  check (payment_method in ('coin', 'voucher', 'qrph'));
commit;
