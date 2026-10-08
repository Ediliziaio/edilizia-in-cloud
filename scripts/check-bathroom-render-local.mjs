// Offline QA of the actual app renderer. Synthetic data, local stock images,
// no database, no paid model, no WhatsApp, no production asset fetches.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { signBathroomProjectMedia } from '../supabase/functions/_shared/scopedProjectMedia.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const out = mkdtempSync(path.join(tmpdir(), 'eic-bathroom-pdf-'));
console.log(`LOCAL_PDF_QA_DIR=${out}`);
const privateOrigin = 'https://db.offline.invalid';
globalThis.Deno = { env: { get: key => key === 'APP_URL' ? 'https://app.ediliziaincloud.com' : key === 'SUPABASE_URL' ? privateOrigin : undefined } };
let images = 0, privateImages = 0;
globalThis.fetch = async url => {
  const u = new URL(String(url));
  let imagePath = decodeURIComponent(u.pathname);
  if (u.origin === privateOrigin && imagePath === `/storage/v1/object/sign/progetti-media/${company}/bagni/${project}/00000000-0000-4000-8000-000000000003.jpg` && u.searchParams.get('token') === 'fixture') {
    imagePath = '/pdf-stock/bagni/risultato-moderno.jpg'; privateImages++;
  } else if (u.origin !== 'https://app.ediliziaincloud.com') throw new Error(`QA forbids external network: ${u.origin}`);
  const file = path.resolve(publicRoot, '.' + imagePath);
  if (!file.startsWith(publicRoot + path.sep)) throw new Error('Asset path outside public');
  const bytes = readFileSync(file); images++;
  return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
};
const { renderBagnoReale } = await import('../supabase/functions/bgn-genera-pdf/_render.mjs');
const company = '00000000-0000-4000-8000-000000000001';
const project = '00000000-0000-4000-8000-000000000002';
const revision = '2026-10-08T08:00:00Z';
const mediaRows = [{ id: '00000000-0000-4000-8000-000000000004', company_id: company, progetto_id: project,
  url: `progetti-media/${company}/bagni/${project}/00000000-0000-4000-8000-000000000003.jpg`,
  tipo: 'situazione', caption: 'Foto privata sintetica - verifica locale', ordine: 0 }];
const mediaClient = { storage: { from: bucket => {
  assert.equal(bucket, 'progetti-media');
  return { createSignedUrl: async storagePath => ({ data: { signedUrl: `${privateOrigin}/storage/v1/object/sign/progetti-media/${storagePath}?token=fixture` }, error: null }) };
} } };
const types = { completo: 'rifacimento_completo', 'vasca-doccia': 'vasca_in_doccia', doccia: 'rifacimento_parziale',
  sanitari: 'sostituzione_sanitari', accessibilita: 'abbattimento_barriere', rinnovo: 'rifacimento_parziale' };
const rows = [
  { capitolo_nome: 'Preparazioni', descrizione: 'Protezione pavimenti e percorsi, rimozione delle dotazioni esistenti', quantita: 1, prezzo_unitario: 680, unita_misura: 'corpo' },
  { capitolo_nome: 'Forniture', descrizione: 'Box doccia e piatto antiscivolo: fornitura secondo misure confermate', quantita: 1, prezzo_unitario: 1240, unita_misura: 'cad' },
  { capitolo_nome: 'Finiture', descrizione: 'Rivestimento in gres e posa nelle superfici concordate', quantita: 20, prezzo_unitario: 62, unita_misura: 'mq' },
  { capitolo_nome: 'Manodopera', descrizione: 'Collegamenti idraulici, montaggio e verifiche finali', quantita: 30, prezzo_unitario: 28, unita_misura: 'ora' },
].map((r, ordine) => ({ ...r, id: `qa-${ordine}`, progetto_id: project, company_id: company,
  importo: r.quantita * r.prezzo_unitario, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, ordine }));
const net = rows.reduce((sum, row) => sum + row.importo, 0);
for (const [model, type] of Object.entries(types)) {
  const title = `Test modello ${model}`;
  const template = { id: `qa-${model}`, company_id: company, cover_title: title,
    pdf_cover_hero: title, pdf_cover_eyebrow: 'DEMO LOCALE - DATI FITTIZI',
    pdf_cover_subhero: 'Documento di verifica del modello e del computo, non una proposta commerciale reale.',
    cover_image_url: '/cover-stock/bagni/2.jpg', pdf_cover_overlay_opacity: 0.6,
    ragione_sociale: 'Demo Azienda 2 - Test locale', color_primary: '#1E3A5F', color_secondary: '#F97316',
    esigenze: [{ titolo: 'Rinnovare il bagno', descrizione: 'Funzionalità e superfici definite nel computo.' }],
    soluzione: [{ titolo: 'Intervento coordinato', descrizione: 'Forniture e lavorazioni secondo le voci approvate.' }],
    usp: [], garanzie: [], testimonianze: [], faq: [], percorso: [], cronoprogramma: [], gallery_lavori: [],
    show_chi_siamo: false, show_garanzie: false, show_percorso: false,
    condizioni_legali_attivo: false, pdf_pagine_libere: [], pdf_blocchi: { modulo_intervento: model } };
  const input = { progetto: { id: project, company_id: company, code: `QA-${model}`, stato: 'bozza', tipo_intervento: type,
    numero_bagni: 1, cliente_nome: 'Cliente fittizio', cliente_cognome: 'Test', cantiere_indirizzo: 'Via Esempio 10',
    cantiere_citta: 'Milano', iva_pct: 10, sconto_pct: 0, detrazione_pct: 0, totale_imponibile: net,
    totale: net * 1.1, created_at: revision, updated_at: revision, modello_snapshot: { version: 1, modelId: model,
      companyId: company, capturedAt: revision, template } }, computo: rows,
    media: await signBathroomProjectMedia(mediaClient, company, project, mediaRows, privateOrigin),
    company: { name: 'Demo Azienda 2 - Test locale' } };
  const bytes = await renderBagnoReale(input);
  const pdf = path.join(out, `${model}.pdf`); writeFileSync(pdf, bytes);
  const parsed = await PDFDocument.load(bytes);
  assert.ok(parsed.getPageCount() >= 3, 'Expected actual multi-page model');
  const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
  assert.ok(text.replace(/\s/g, '').includes(title.replace(/\s/g, '')), 'Exact chosen model title missing');
  assert.ok(text.includes('Collegamenti idraulici'), 'Quote line missing');
  assert.ok(text.includes('4.400,00'), 'Expected total with 10% IVA missing');
  assert.ok(text.includes('Foto privata sintetica'), 'Private project photo caption missing');
  console.log(`PASS ${model}: ${parsed.getPageCount()} pages, ${bytes.length} bytes, exact title/lines/total`);
}
assert.equal(privateImages, 6, 'Private project photo must be loaded once in each actual model render');
assert.ok(mediaRows[0].url.startsWith('progetti-media/'), 'Persisted reference must remain unchanged');
console.log(`LOCAL_PDF_QA_DIR=${out}; local image reads=${images}; private photo reads=${privateImages}; real sends=0`);
