-- 037: Windows printer assignments per site
-- kot_printer_name  — the Windows printer used for KOT slips (kitchen)
-- bill_printer_name — the Windows printer used for customer bills
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS kot_printer_name  TEXT,
  ADD COLUMN IF NOT EXISTS bill_printer_name TEXT;
