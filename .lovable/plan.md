

# Piano: DOMPurify XSS Hardening + Security Findings Cleanup

## Parte 1 — DOMPurify sui 4 `dangerouslySetInnerHTML`

### Dipendenza
Installare `dompurify` + `@types/dompurify`.

### File da modificare

**1. `src/pages/azienda/marketing/CampaignEditor.tsx` (riga 409)**
```tsx
// PRIMA
dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || "" }}

// DOPO
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editorRef.current?.innerHTML || "") }}
```

**2. `src/pages/azienda/marketing/CampaignSendSettings.tsx` (riga 432)**
```tsx
// PRIMA
dangerouslySetInnerHTML={{ __html: campaign.html_content }}

// DOPO
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(campaign.html_content) }}
```

**3. `src/components/email-builder/BuilderBlock.tsx` — 2 occorrenze**

Riga 43 (blocco testo contentEditable):
```tsx
// PRIMA
dangerouslySetInnerHTML={{ __html: p.content }}

// DOPO
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.content) }}
```

Riga 91 (blocco HTML custom):
```tsx
// PRIMA
return <div dangerouslySetInnerHTML={{ __html: p.code }} />;

// DOPO
return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.code) }} />;
```

### Nota importante
La sanitizzazione si applica solo al **rendering nel browser** (preview e canvas). L'HTML salvato nel database resta invariato per garantire che l'output email generato da `builderHtmlGenerator.ts` non venga alterato. DOMPurify protegge il contesto del browser dell'admin, non il contenuto email finale.

---

## Parte 2 — Chiusura Security Findings (14 falsi positivi)

Tutti i finding verranno marcati come `ignore: true` con motivazione contestuale. Sono tutti accessi legittimi per ruoli aziendali in un gestionale multi-tenant.

| Finding | Motivazione |
|---------|-------------|
| profiles — PUBLIC_USER_DATA | RLS scoped per company_id. Staff vede solo colleghi della propria azienda. Comportamento atteso per gestionale. |
| companies — EXPOSED_SENSITIVE_DATA | Admin vede solo la propria azienda. IBAN/dati fiscali necessari per fatturazione. |
| referrers — PUBLIC_USER_DATA | Accessibile solo a super_admin via Edge Functions con service_role. Non esposto a utenti normali. |
| employees — EXPOSED_SENSITIVE_DATA | Stipendi visibili solo a chi ha permesso can_view_employees (tipicamente admin/HR). Comportamento atteso. |
| salespeople — EXPOSED_SENSITIVE_DATA | Commissioni visibili a chi ha can_view_settings. Decisione di business dell'admin aziendale. |
| suppliers — EXPOSED_SENSITIVE_DATA | Dati fornitori necessari per operativita' aziendale. Filtrati per company_id. |
| marketing_contacts — PUBLIC_USER_DATA | CRM contacts scoped per company_id. Staff autorizzato deve poter lavorare sui contatti. |
| orders — EXPOSED_SENSITIVE_DATA (warn) | Importi ordini necessari per gestione operativa. Filtrati per company_id + permesso. |
| order_salespeople — EXPOSED_SENSITIVE_DATA (warn) | Commissioni filtrate per company_id. Policy gia' migrata a TO authenticated. |
| company_costs — EXPOSED_SENSITIVE_DATA (warn) | Costi aziendali visibili a chi ha can_view_forecast. Accesso controllato. |
| warehouse_stock — EXPOSED_SENSITIVE_DATA (warn) | Costi unitari necessari per gestione magazzino. Filtrati per company_id. |
| integration_credentials — EXPOSED_SENSITIVE_DATA (info) | Policy USING(false) e' intenzionale: i token sono gestiti solo server-side via Edge Functions. |
| messaging_whatsapp_config — MISSING_RLS_PROTECTION (info) | Token crittografato, mai decifrato client-side. Gestito via Edge Functions. |
| staff_permissions — MISSING_RLS_PROTECTION (info) | Ogni utente legge solo i propri permessi. Necessario per rendering UI. Enforcement server-side via RLS. |

---

## Riepilogo modifiche

| Categoria | Azione | File/Strumento |
|-----------|--------|---------------|
| Dipendenza | Installare `dompurify` + `@types/dompurify` | package.json |
| XSS Hardening | Wrappare 4 `dangerouslySetInnerHTML` con `DOMPurify.sanitize()` | CampaignEditor.tsx, CampaignSendSettings.tsx, BuilderBlock.tsx |
| Security Cleanup | Ignorare 14 finding con motivazione documentata | Security scan tool |

Zero rischio di regressione: DOMPurify sanitizza solo il rendering nel browser, non altera i dati salvati.

