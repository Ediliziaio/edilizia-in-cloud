

## Piano: Aggiungere entità e campi mancanti ai BUILTIN_FIELDS

### Problema
Mancano **4 entità complete** (Utente, Venditore, Squadra Esterna, Fornitore) e **~90 campi** dalle 10 entità esistenti.

### Nuove entità da aggiungere

**Utente/Profilo** (`profiles` — folder: `user`): `id`, `first_name`, `last_name`, `email`, `phone`, `fiscal_code`, `address`, `site_address`, `avatar_url`, `notes`, `salesperson_id`

**Venditore** (`salespeople` — folder: `salesperson`): `id`, `first_name`, `last_name`, `email`, `phone`, `commission_type`, `commission_value`, `area_geografica`, `zona`, `data_inizio`, `is_active`

**Squadra Esterna** (`external_teams` — folder: `external_team`): `id`, `name`, `contact_name`, `email`, `phone`, `notes`, `vat_rate`, `is_active`

**Fornitore** (`suppliers` — folder: `supplier`): `id`, `name`, `email`, `phone`, `vat_number`, `fiscal_code`, `address`, `city`, `province`, `postal_code`, `country`, `website`, `iban`, `bank_name`, `payment_method`, `credit_limit`, `lead_time_days`, `min_order_amount`, `product_category`, `rating`, `notes`, `is_active`, `is_foreign`

### Campi mancanti da entità esistenti

**Contatto** (+17): `id`, `contact_type`, `fiscal_code`, `vat_number`, `tags`, `notes`, `lead_score`, `icp_tier`, `score`, `preferred_language`, `preferred_channel`, `optout_email`, `optout_whatsapp`, `optout_sms`, `optout_call`, `unsubscribed`, `last_activity_at`

**Opportunità** (+10): `id`, `company_name`, `notes`, `tags`, `probability`, `next_action`, `next_action_date`, `loss_notes`, `lost_reason_category`, `competitor_won`

**Appuntamento** (+3): `order_id`, `is_completed`, `reminder_minutes`

**Ordine** (+16): `internal_notes`, `payment_type`, `vat_rate`, `financing_cost`, `financing_amount`, `warehouse_arrival_date`, `work_end_date`, `deposit_2_amount`, `deposit_paid`, `deposit_2_paid`, `balance_paid`, `deposit_paid_date`, `deposit_2_paid_date`, `balance_paid_date`, `has_building_bonus`, `financing_paid`

**Fattura** (+14): `invoice_year`, `client_fiscal_code`, `client_pec`, `client_sdi_code`, `client_address`, `client_city`, `client_zip`, `client_country`, `payment_terms`, `payment_days`, `bank_iban`, `notes`, `pdf_url`, `order_id`, `quote_id`, `client_id`

**Preventivo** (+14): `description`, `internal_notes`, `terms_and_conditions`, `subtotal`, `vat_amount`, `discount_percent`, `discount_amount`, `client_company`, `client_vat_number`, `client_fiscal_code`, `client_address`, `sent_at`, `viewed_at`, `signed_at`, `opportunity_id`, `assigned_to`

**Ticket** (+2): `order_id`, `last_message_at`

**Task** (+4): `order_id`, `opportunity_id`, `ticket_id`, `completed_at`

**Dipendente** (+2): `monthly_hours`, `is_active`

**Magazzino** (+6): `description`, `vat_rate`, `supplier_id`, `quantity_reserved`, `reorder_quantity`, `last_delivery_date`

### Implementazione

**File**: `src/components/settings/CustomFieldsConfig.tsx`

1. Aggiungere 4 nuovi folder in `FOLDER_COLORS` e `FOLDER_LABELS` (user, salesperson, external_team, supplier)
2. Aggiungere 4 nuove entità in `GROUP_OPTIONS` e `OBJECT_NAME_MAP`
3. Aggiungere ~130 nuovi `sysField()` nell'array `BUILTIN_FIELDS`
4. Tutti come campi di sistema non modificabili (lucchetto)

