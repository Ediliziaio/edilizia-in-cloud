-- IVA di riserva dei preventivatori edili: 10% per tutti (prima 22% in sei moduli).
-- Cambia solo il valore di partenza dei NUOVI preventivi e modelli; le righe esistenti non si toccano.
alter table public.clm_progetti      alter column iva_pct         set default 10;
alter table public.clm_template_pdf  alter column default_iva_pct set default 10;
alter table public.ele_progetti      alter column iva_pct         set default 10;
alter table public.ele_template_pdf  alter column default_iva_pct set default 10;
alter table public.idr_progetti      alter column iva_pct         set default 10;
alter table public.idr_template_pdf  alter column default_iva_pct set default 10;
alter table public.pav_progetti      alter column iva_pct         set default 10;
alter table public.pav_template_pdf  alter column default_iva_pct set default 10;
alter table public.pis_progetti      alter column iva_pct         set default 10;
alter table public.pis_template_pdf  alter column default_iva_pct set default 10;
alter table public.rst_progetti      alter column iva_pct         set default 10;
