import React from 'react';
import type { QuoteTemplate, TextAlignment } from '@/types/quoteTemplate';
import { quoteTemplateSampleData, type AnteprimaModello } from '@/lib/quoteTemplatePreview';
import { testoSopra } from '../../../supabase/functions/_shared/temaColori';
import { formatCurrency } from '@/lib/formatters';
import { substituteMergeTags } from '../../../supabase/functions/_shared/quoteTemplateComposer';
import { campiContratto } from '../../../supabase/functions/_shared/campiContratto';
import { recalcPhaseAmounts, paymentPlanError, type QuotePaymentPhase } from '@/lib/preventivi/paymentTerms';

/** Optional real draft data. Without it the settings catalogue keeps its sample preview. */
export interface TemplatePreviewDocument {
  title: string; clientName: string; clientAddress?: string; siteAddress?: string; date: string;
  rows: Array<{ id: string; name: string; description: string; quantity: number; unit: string; price: number; amount: number }>;
  net: number; taxPending: boolean;
  tax?: number | null; gross?: number | null; taxBreakdown?: Record<string, number>; displayGross?: boolean;
  commonNotes?: string; scheduleText?: string; globalDiscountPercent?: number;
  paymentMethod?: string; paymentPhases?: QuotePaymentPhase[];
  blocks?: Array<{ id: string; title: string; text: string; image?: string; specs?: Array<{ label: string; value: string }> }>;
}
const DraftContext = React.createContext<TemplatePreviewDocument | undefined>(undefined);

interface Props {
  /** Il modello, anche già risolto coi blocchi collegati (colore della copertina compreso). */
  template: AnteprimaModello;
  companyName?: string;
  page?: 'cover' | 'detail';
  scale?: number;
  logoSrc?: string;
  logoLightSrc?: string;
  coverSrc?: string;
  documentData?: TemplatePreviewDocument;
}

/**
 * Helper: calcola le dimensioni font derivate dal base + scala.
 * Restituisce la scala relativa (moltiplicatore sul font_size_base) che
 * viene poi applicata ai singoli elementi del PDF.
 */
function buildTypographyScale(t: Partial<QuoteTemplate>) {
  const base = t.font_size_base ?? 10;
  const scale = t.heading_size_scale ?? 1.60;
  const lh = t.line_height ?? 1.40;
  return {
    base,                     // pt
    body: base,               // pt (testo corpo)
    small: Math.max(6, base - 2),
    label: Math.max(7, base - 2),
    h3: Math.round(base * 1.15),
    h2: Math.round(base * 1.30),
    h1: Math.round(base * scale),
    lineHeight: lh,
  };
}

function rowPadding(density: QuoteTemplate['row_density'] | undefined): number {
  if (density === 'compact') return 4;
  if (density === 'comfortable') return 11;
  return 7;
}

/**
 * Testi neutri per l'anteprima del template base.
 * L'anteprima deve descrivere una proposta generica: il verticale (serramenti,
 * bagni, fotovoltaico, ecc.) viene scelto nel preventivo reale, non qui.
 */
function previewCopy(t: Partial<QuoteTemplate>, draft?: TemplatePreviewDocument) {
  return {
    eyebrow: 'PROPOSTA COMMERCIALE',
    title: draft?.title || t.cover_title?.trim().replace(/\*/g, '') || 'Proposta personalizzata',
    subtitle: t.cover_subtitle?.trim() || (draft ? '' : 'Soluzione, tempi e investimento in un unico documento.'),
    tagline: t.cover_tagline?.trim() || (draft ? '' : 'Una proposta chiara, pensata per il tuo progetto.'),
    serviceLine: draft ? 'Preventivo · bozza locale' : 'Progetti su misura · qualità, tempi e assistenza',
  };
}

export function QuoteTemplatePreview({
  template,
  companyName = 'La Tua Azienda Srl',
  page = 'cover',
  scale = 0.4,
  logoSrc,
  logoLightSrc,
  coverSrc,
  documentData,
}: Props) {
  const phases = documentData?.paymentPhases ?? [];
  const invalidPlan = paymentPlanError(phases);
  const plan = invalidPlan ? 'Piano di pagamento da completare e confermare.' : [documentData?.paymentMethod,
    ...recalcPhaseAmounts(phases, documentData?.gross ?? 0).map(phase => `${phase.label}: ${phase.percent}%${documentData?.gross != null ? ` — ${formatCurrency(phase.amount)}` : ' — importo da definire'}`),
  ].filter(Boolean).join('\n');
  const paymentText = plan || template.payment_terms_text || 'Da concordare';
  const draftText = documentData && ((value: string) => substituteMergeTags(value, {
    cliente: { nome_completo: documentData.clientName, nome: documentData.clientName, indirizzo: documentData.clientAddress || '[Da definire]' },
    cantiere: { indirizzo: documentData.siteAddress || '[Da definire]', citta: '[Da definire]' },
    contratto: Object.fromEntries(campiContratto(template.contractual_terms_text, template.legal_terms_text).map(f => [f.nome, '[Da compilare]'])),
    azienda: { ragione_sociale: companyName },
    preventivo: { data: documentData.date, numero: 'BOZZA', totale: !documentData.taxPending && documentData.gross != null ? formatCurrency(documentData.gross) : 'Da determinare', subtotale: documentData.rows.length ? formatCurrency(documentData.net) : 'Da determinare', iva: !documentData.taxPending && documentData.tax != null ? formatCurrency(documentData.tax) : 'Da definire', piano_pagamenti: paymentText, frase_pagamenti: `Il pagamento avviene secondo il piano concordato: ${paymentText}` },
    data: { oggi: documentData.date },
  }));
  const t = documentData ? Object.fromEntries(Object.entries(template).map(([key, value]) => [key, typeof value === 'string' ? draftText!(value) : value])) as AnteprimaModello : quoteTemplateSampleData(template, companyName);
  if (documentData && plan) t.payment_terms_text = plan;
  const primary = t.primary_color ?? '#1E40AF';
  const secondary = t.secondary_color ?? '#3B82F6';
  const accent = t.accent_color ?? '#DBEAFE';
  const headerText = t.header_text_color ?? '#FFFFFF';
  const textColor = t.text_color ?? '#111827';
  const layout = t.layout ?? 'classic';
  const useLightLogo = !!logoLightSrc && testoSopra(primary) === '#FFFFFF';
  const fontFamily = t.font_family === 'times' ? 'Georgia, serif'
    : t.font_family === 'courier' ? '"Courier New", monospace'
    : 'Helvetica, Arial, sans-serif';

  // Margini e tipografia derivati
  const marginMm = t.page_margin_mm ?? 18;
  const marginPx = Math.round(marginMm * 2.83); // 1mm ≈ 2.83pt @96dpi
  const type = buildTypographyScale(t);
  const alignment = (t.header_alignment ?? 'left') as TextAlignment;

  const sheetW = 595;
  const sheetH = 842;
  const hasCover = page === 'cover' && !!(t.cover_title?.trim() || t.cover_subtitle?.trim() || (t.show_cover_image && t.cover_image_url));

  return (
    <DraftContext.Provider value={documentData ? { ...documentData, blocks: documentData.blocks?.map(block => ({ ...block, title: draftText!(block.title), text: draftText!(block.text) })) } : undefined}><div data-template-layout={layout} style={{ width: sheetW * scale, ...(documentData ? { zoom: scale, width: sheetW } : { height: sheetH * scale, overflow: 'hidden' }) }}>
      <div
        style={{
          width: sheetW,
          ...(documentData ? { minHeight: sheetH } : { height: sheetH }),
          backgroundColor: '#FFFFFF',
          position: 'relative',
          overflow: documentData && !hasCover ? 'visible' : 'hidden',
          fontFamily,
          fontSize: type.body,
          lineHeight: type.lineHeight,
          transform: documentData ? undefined : `scale(${scale})`,
          transformOrigin: 'top left',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          borderRadius: 4,
          color: textColor,
        }}
      >
        {hasCover && <OfferCover template={t} companyName={companyName} primary={template.colore_copertina ?? primary} logoSrc={logoLightSrc || logoSrc} logoTransparent={!!logoLightSrc} coverSrc={coverSrc} />}
        {!hasCover && layout === 'classic' && (
          <ClassicLayout
            primary={primary} secondary={secondary} accent={accent}
            headerText={headerText} textColor={textColor}
            companyName={companyName} t={t} page={page} logoSrc={logoSrc}
            marginPx={marginPx} type={type} alignment={alignment}
          />
        )}
        {!hasCover && layout === 'modern' && (
          <ModernLayout
            primary={primary} secondary={secondary} accent={accent}
            headerText={headerText} textColor={textColor}
            companyName={companyName} t={t} page={page} logoSrc={useLightLogo ? logoLightSrc : logoSrc} logoTransparent={useLightLogo}
            marginPx={marginPx} type={type} alignment={alignment}
          />
        )}
        {!hasCover && layout === 'minimal' && (
          <MinimalLayout
            primary={primary} secondary={secondary} accent={accent}
            headerText={headerText} textColor={textColor}
            companyName={companyName} t={t} page={page} logoSrc={logoSrc}
            marginPx={marginPx} type={type} alignment={alignment}
          />
        )}
        {!hasCover && layout === 'bold' && (
          <BoldLayout
            primary={primary} secondary={secondary} accent={accent}
            headerText={headerText} textColor={textColor}
            companyName={companyName} t={t} page={page} logoSrc={useLightLogo ? logoLightSrc : logoSrc} logoTransparent={useLightLogo}
            marginPx={marginPx} type={type} alignment={alignment}
          />
        )}

        {/* Watermark */}
        {t.show_watermark && t.watermark_text && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%) rotate(-45deg)',
            fontSize: 48, fontWeight: 700, color: 'rgba(0,0,0,0.06)',
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            {t.watermark_text}
          </div>
        )}

        {/* Footer */}
        {!hasCover && t.footer_text && (
          <div style={{
            ...(documentData ? { margin: `32px ${marginPx}px 0`, paddingBottom: 20 } : { position: 'absolute', bottom: 16, left: marginPx, right: marginPx }),
            fontSize: type.small, color: '#9CA3AF', textAlign: 'center',
          }}>
            {t.footer_text}
          </div>
        )}
      </div>
    </div></DraftContext.Provider>
  );
}

/** Copertina dedicata del generatore PDF, con dati dimostrativi. */
function OfferCover({ template: t, companyName, primary, logoSrc, coverSrc, logoTransparent }: {
  template: Partial<QuoteTemplate>; companyName: string; primary: string; logoSrc?: string; coverSrc?: string; logoTransparent?: boolean;
}) {
  const draft = React.useContext(DraftContext);
  const [failedPhoto, setFailedPhoto] = React.useState<string | null>(null);
  if (t.show_cover_image && t.cover_image_url?.endsWith('.pdf')) return <div style={{ position: 'absolute', inset: 0, background: '#f8fafc', color: '#334155', display: 'grid', placeContent: 'center', padding: 48, textAlign: 'center' }}><strong>Copertina PDF personalizzata</strong><p>La grafica originale è visibile nell'anteprima PDF.</p></div>;
  const photo = t.show_cover_image && coverSrc !== failedPhoto ? coverSrc : undefined;
  const title = t.cover_title?.trim() || 'La nostra *offerta* per voi.';
  return (
    <div style={{ position: 'absolute', inset: 0, background: primary, color: '#fff', padding: 48, display: 'flex', flexDirection: 'column' }}>
      {photo && <img src={photo} alt="" onError={() => setFailedPhoto(photo)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,15,35,.25), rgba(5,15,35,.78))' }} />
      {!photo && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)', backgroundSize: '35px 35px' }} />}
      {!photo && <div style={{ position: 'absolute', width: 380, height: 380, top: 60, right: -65, border: '1px solid rgba(255,255,255,.18)', borderRadius: '50%' }} />}
      <div style={{ position: 'relative' }}>
        {logoSrc && t.show_logo !== false ? <img src={logoSrc} alt="" style={{ maxWidth: 175, height: 56, objectFit: 'contain', padding: '8px 12px', background: logoTransparent ? 'transparent' : '#fff' }} /> : <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', overflowWrap: 'anywhere' }}>{companyName}</div>}
      </div>
      <div style={{ position: 'relative', marginTop: 'auto', marginBottom: 40 }}>
        <div style={{ fontSize: 9, letterSpacing: 3, marginBottom: 20, color: '#dbeafe' }}>PROPOSTA COMMERCIALE</div>
        <div style={{ fontSize: title.length > 90 ? 30 : 40, lineHeight: 1.16, fontWeight: 700, maxWidth: 460, overflowWrap: 'anywhere' }}>
          {title.split('*').map((part, index) => index % 2 ? <em key={index} style={{ fontFamily: 'Georgia, serif', fontWeight: 400, color: '#dbeafe' }}>{part}</em> : <React.Fragment key={index}>{part}</React.Fragment>)}
        </div>
        {t.cover_subtitle && <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 20, maxWidth: 420, color: '#e2e8f0' }}>{t.cover_subtitle}</p>}
      </div>
      <div style={{ position: 'relative', display: 'flex', gap: 3, marginBottom: 16 }}>
        {[1, .72, .48, .28, .14].map((opacity) => <span key={opacity} style={{ height: 2, background: '#fff', opacity, flex: 1 }} />)}
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[["PREPARATO PER", draft?.clientName ?? "Mario Rossi"], ["INDIRIZZO", draft ? draft.clientAddress || 'Da definire' : "Via Garibaldi 10, Roma"], ["RIFERIMENTO", draft ? 'BOZZA LOCALE' : "OFF-2026-001"], ["DATA", draft?.date ?? "9 marzo 2026"]].map(([label, value]) => <div key={label}><div style={{ fontSize: 6.5, letterSpacing: 1, color: '#dbeafe', marginBottom: 8 }}>{label}</div><div style={{ fontSize: 9.5, fontWeight: 700 }}>{value}</div></div>)}
      </div>
    </div>
  );
}

interface LayoutProps {
  primary: string;
  secondary: string;
  accent: string;
  headerText: string;
  textColor: string;
  companyName: string;
  t: Partial<QuoteTemplate>;
  page: 'cover' | 'detail';
  logoSrc?: string;
  logoTransparent?: boolean;
  marginPx: number;
  type: ReturnType<typeof buildTypographyScale>;
  alignment: TextAlignment;
}

function logoSizePx(size: QuoteTemplate['logo_size'] | undefined): number {
  if (size === 'small') return 34;
  if (size === 'large') return 62;
  return 48;
}

function logoJustify(position: QuoteTemplate['logo_position'] | undefined): React.CSSProperties['justifyContent'] {
  if (position === 'center') return 'center';
  if (position === 'right') return 'flex-end';
  return 'flex-start';
}

function PreviewLogo({
  t,
  logoSrc,
  primary,
  headerText,
  transparent = false,
}: {
  t: Partial<QuoteTemplate>;
  logoSrc?: string;
  primary: string;
  headerText?: string;
  transparent?: boolean;
}) {
  const draft = React.useContext(DraftContext);
  if (t.show_logo === false) return null;
  if (draft && !logoSrc) return null;

  const size = logoSizePx(t.logo_size);

  if (logoSrc) {
    return (
      <img loading="lazy"
        src={logoSrc}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: 8,
          backgroundColor: transparent ? 'transparent' : 'rgba(255,255,255,0.94)',
          padding: 5,
          border: transparent ? 'none' : '1px solid rgba(148,163,184,0.28)',
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        backgroundColor: headerText ? 'rgba(255,255,255,0.16)' : `${primary}14`,
        color: headerText ?? primary,
        border: `1px solid ${headerText ? 'rgba(255,255,255,0.24)' : `${primary}33`}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(10, Math.round(size * 0.28)),
        fontWeight: 800,
        letterSpacing: 0,
      }}
    >
      LOGO
    </div>
  );
}

function ClassicLayout({ primary, accent, textColor, companyName, t, page, logoSrc, marginPx, type, alignment }: LayoutProps) {
  const draft = React.useContext(DraftContext); const copy = previewCopy(t, draft);
  return (
    <>
      <div style={{ height: 8, backgroundColor: primary }} />
      <div style={{
        padding: `${marginPx}px ${marginPx}px 0`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flex: 1,
          justifyContent: logoJustify(t.logo_position),
          textAlign: alignment,
        }}>
          <PreviewLogo t={t} logoSrc={logoSrc} primary={primary} />
          <div>
            <div style={{ fontSize: type.h2, fontWeight: 760, color: textColor }}>{companyName}</div>
            <div style={{ fontSize: type.small, color: '#6B7280', marginTop: 2 }}>{copy.serviceLine}</div>
          </div>
        </div>
        {t.show_quote_number !== false && (
          <div style={{ fontSize: type.small, color: '#6B7280' }}>{draft ? 'BOZZA LOCALE' : 'OFFERTA N. OFF-2026-001'}</div>
        )}
      </div>
      <div style={{ margin: `12px ${marginPx}px`, height: 1, backgroundColor: '#E5E7EB' }} />
      {page === 'cover' ? (
        <CoverBody primary={primary} textColor={textColor} companyName={companyName} t={t} marginPx={marginPx} type={type} />
      ) : (
        <DetailBody primary={primary} accent={accent} textColor={textColor} t={t} marginPx={marginPx} type={type} />
      )}
    </>
  );
}

function ModernLayout({ primary, accent, headerText, textColor, companyName, t, page, logoSrc, logoTransparent, marginPx, type, alignment }: LayoutProps) {
  const draft = React.useContext(DraftContext); const copy = previewCopy(t, draft);
  return (
    <>
      <div style={{
        backgroundColor: primary,
        padding: `${Math.round(marginPx * 1.2)}px ${marginPx}px ${marginPx}px`,
        color: headerText,
        textAlign: alignment,
      }}>
        <div style={{ display: 'flex', justifyContent: logoJustify(t.logo_position), marginBottom: 12 }}>
          <PreviewLogo t={t} logoSrc={logoSrc} primary={primary} headerText={headerText} transparent={logoTransparent} />
        </div>
        <div style={{ fontSize: type.body + 2, fontWeight: 650, marginBottom: 6 }}>{companyName}</div>
        {t.show_quote_number !== false && <div style={{ fontSize: type.small, opacity: 0.8, marginBottom: 14 }}>{draft ? `BOZZA LOCALE · ${draft.date}` : 'OFFERTA N. OFF-2026-001 · 09/03/2026'}</div>}
        <div style={{ fontSize: type.small, letterSpacing: 1.2, fontWeight: 700, opacity: 0.82 }}>{copy.eyebrow}</div>
        <div style={{ fontSize: type.h1, fontWeight: 700, marginTop: 4 }}>{copy.title}</div>
        <div style={{ fontSize: type.body, marginTop: 6, opacity: 0.9 }}>{copy.subtitle}</div>
        <div style={{ fontSize: type.small, marginTop: 10, fontStyle: 'italic', opacity: 0.85 }}>{copy.tagline}</div>
      </div>
      {page === 'cover' ? (
        <CoverBody primary={primary} textColor={textColor} companyName={companyName} t={t} marginPx={marginPx} type={type} inline />
      ) : (
        <DetailBody primary={primary} accent={accent} textColor={textColor} t={t} marginPx={marginPx} type={type} />
      )}
    </>
  );
}

function MinimalLayout({ primary, accent, textColor, companyName, t, page, logoSrc, marginPx, type, alignment }: LayoutProps) {
  const draft = React.useContext(DraftContext); const copy = previewCopy(t, draft);
  return (
    <div style={{ padding: `${marginPx}px ${marginPx}px 0`, textAlign: alignment }}>
      <div style={{ borderBottom: `2px solid ${primary}`, paddingBottom: 20, marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PreviewLogo t={t} logoSrc={logoSrc} primary={primary} />
            <div style={{ fontSize: type.body + 4, fontWeight: 650, color: textColor }}>{companyName}</div>
          </div>
          {t.show_quote_number !== false && (
            <div style={{ fontSize: type.small, color: '#9CA3AF' }}>{draft ? 'BOZZA LOCALE' : 'OFF-2026-001'}</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: type.small, letterSpacing: 1.2, fontWeight: 700, color: primary, marginBottom: 6 }}>{copy.eyebrow}</div>
      <div style={{ fontSize: type.h1, fontWeight: 700, color: textColor, marginBottom: 8 }}>{copy.title}</div>
      <div style={{ fontSize: type.body, color: '#6B7280', marginBottom: 6 }}>{copy.subtitle}</div>
      <div style={{ fontSize: type.small, color: primary, fontStyle: 'italic', marginBottom: 20 }}>{copy.tagline}</div>
      {page === 'cover' ? (
        <CoverBody primary={primary} textColor={textColor} companyName={companyName} t={t} marginPx={0} type={type} inline />
      ) : (
        <DetailBody primary={primary} accent={accent} textColor={textColor} t={t} marginPx={0} type={type} inline />
      )}
    </div>
  );
}

function BoldLayout({ primary, accent, headerText, textColor, companyName, t, page, logoSrc, logoTransparent, marginPx, type, alignment }: LayoutProps) {
  const draft = React.useContext(DraftContext); const copy = previewCopy(t, draft);
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{
        width: 80, backgroundColor: primary,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: 'column',
        paddingTop: marginPx,
        paddingBottom: marginPx * 2,
      }}>
        <PreviewLogo t={t} logoSrc={logoSrc} primary={primary} headerText={headerText} transparent={logoTransparent} />
        <div style={{
          transform: 'rotate(-90deg)', transformOrigin: 'center',
          whiteSpace: 'nowrap', color: headerText,
          fontSize: type.body + 1, fontWeight: 600, letterSpacing: 1,
        }}>
          {companyName}
        </div>
      </div>
      <div style={{ flex: 1, padding: `${marginPx * 2}px ${marginPx}px 0`, textAlign: alignment }}>
        {t.show_quote_number !== false && (
          <div style={{ fontSize: type.small, color: '#9CA3AF', marginBottom: 30 }}>{draft ? 'BOZZA LOCALE' : 'OFFERTA N. OFF-2026-001'}</div>
        )}
        <div style={{
          fontSize: type.h1 * 1.4, fontWeight: 800, lineHeight: 1.1,
          color: textColor, marginBottom: 12,
        }}>
          {copy.eyebrow}<br />{copy.title}
        </div>
        <div style={{ fontSize: type.body, color: '#6B7280', marginBottom: 8 }}>{copy.subtitle}</div>
        <div style={{ fontSize: type.small, color: primary, fontStyle: 'italic', marginBottom: 20 }}>{copy.tagline}</div>
        {page === 'cover' ? (
          <CoverBody primary={primary} textColor={textColor} companyName={companyName} t={t} marginPx={0} type={type} inline />
        ) : (
          <DetailBody primary={primary} accent={accent} textColor={textColor} t={t} marginPx={0} type={type} inline />
        )}
      </div>
    </div>
  );
}

function CoverBody({
  primary, textColor, companyName, t, marginPx, type, inline,
}: {
  primary: string;
  textColor: string;
  companyName: string;
  t: Partial<QuoteTemplate>;
  marginPx: number;
  type: ReturnType<typeof buildTypographyScale>;
  inline?: boolean;
}) {
  const copy = previewCopy(t);
  const wrapperStyle: React.CSSProperties = inline
    ? {}
    : { padding: `20px ${marginPx}px` };
  return (
    <div style={wrapperStyle}>
      {!inline && (
        <>
          <div style={{ fontSize: type.h2, fontWeight: 700, color: textColor, marginBottom: 4 }}>
            {copy.eyebrow}
          </div>
          <div style={{ fontSize: type.small, color: '#6B7280', marginBottom: 6 }}>
            {copy.title} · {copy.subtitle}
          </div>
          <div style={{ fontSize: type.small, color: primary, fontStyle: 'italic', marginBottom: 16 }}>
            {copy.tagline}
          </div>
        </>
      )}
      <div style={{ marginTop: inline ? 30 : 20, display: 'flex', gap: 60, textAlign: 'left' }}>
        {t.show_company_details !== false && (
          <div>
            <div style={{ fontSize: type.label - 2, fontWeight: 700, color: '#9CA3AF', marginBottom: 6, letterSpacing: 1 }}>
              EMESSA DA
            </div>
            <div style={{ fontSize: type.body, fontWeight: 600 }}>{companyName}</div>
            {/* Mail e telefono scritti nel modello, come nel PDF; se no un esempio. */}
            <div style={{ fontSize: type.small, color: '#6B7280' }}>{t.email_impresa?.trim() || 'info@azienda.it'}</div>
            {t.telefono_impresa?.trim() && <div style={{ fontSize: type.small, color: '#6B7280' }}>Tel. {t.telefono_impresa.trim()}</div>}
            <div style={{ fontSize: type.small, color: '#6B7280' }}>Via Roma 1, Milano</div>
          </div>
        )}
        {t.show_client_details !== false && (
          <div>
            <div style={{ fontSize: type.label - 2, fontWeight: 700, color: '#9CA3AF', marginBottom: 6, letterSpacing: 1 }}>
              DESTINATARIO
            </div>
            <div style={{ fontSize: type.body, fontWeight: 600 }}>Mario Rossi</div>
            <div style={{ fontSize: type.small, color: '#6B7280' }}>mario.rossi@email.it</div>
            <div style={{ fontSize: type.small, color: '#6B7280' }}>Via Garibaldi 10, Roma</div>
          </div>
        )}
      </div>
      {t.show_validity_date !== false && (
        <div style={{ marginTop: 24, fontSize: type.small, color: '#6B7280' }}>
          Data: 09/03/2026 — Valida fino al: 08/04/2026
        </div>
      )}
      {(t.show_payment_terms !== false || t.show_delivery_terms !== false) && (
        <div style={{
          marginTop: 24,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          fontSize: type.small,
        }}>
          {t.show_payment_terms !== false && (
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 10 }}>
              <div style={{ color: '#9CA3AF', fontWeight: 700, marginBottom: 4 }}>PAGAMENTO</div>
              <div style={{ color: '#4B5563' }}>{t.payment_terms_text || 'Acconto 30%, saldo a consegna.'}</div>
            </div>
          )}
          {t.show_delivery_terms !== false && (
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 10 }}>
              <div style={{ color: '#9CA3AF', fontWeight: 700, marginBottom: 4 }}>CONSEGNA</div>
              <div style={{ color: '#4B5563' }}>{t.delivery_terms_text || '3-4 settimane dalla conferma.'}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateText({ text }: { text: string }) {
  // The same template may be markdown or HTML. Text-only conversion never executes markup.
  const lines = text.replace(/<br\s*\/?\s*>|<\/p>|<\/div>|<\/h[1-6]>|<\/li>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').split('\n');
  return <div>{lines.map((line, i) => /^#{1,6}\s+/.test(line) ? <h5 key={i} style={{ marginTop: 10, fontWeight: 700 }}>{line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '')}</h5> : <p key={i} style={{ whiteSpace: 'pre-wrap', marginTop: line.trim() ? 5 : 8 }}>{line.replace(/\*\*/g, '')}</p>)}</div>;
}
function DraftDetail({ draft, primary, accent, textColor, t, marginPx, type }: {
  draft: TemplatePreviewDocument; primary: string; accent: string; textColor: string;
  t: Partial<QuoteTemplate>; marginPx: number; type: ReturnType<typeof buildTypographyScale>;
}) {
  const padding = rowPadding(t.row_density);
  const border = t.table_borders === 'none' ? 'none' : '1px solid #e5e7eb';
  const cell: React.CSSProperties = { padding: `${padding}px 7px`, borderBottom: border, ...(t.table_borders === 'all' ? { borderRight: border } : {}), verticalAlign: 'top' };
  return <div style={{ padding: `20px ${marginPx}px 32px`, color: textColor }}>
    {t.layout === 'classic' && <h3 style={{ fontSize: type.h1, fontWeight: 700, marginBottom: 20 }}>{draft.title}</h3>}
    {t.show_client_details !== false && <div style={{ marginBottom: 24 }}><small style={{ color: '#64748b' }}>PREPARATO PER</small><p style={{ fontWeight: 600 }}>{draft.clientName}</p>{draft.clientAddress && <p>{draft.clientAddress}</p>}</div>}
    {draft.siteAddress && <p style={{ marginBottom: 16, fontSize: type.small }}>Cantiere: {draft.siteAddress}</p>}
    <table aria-label="Lavorazioni confermate nel modello" style={{ width: '100%', borderCollapse: 'collapse', fontSize: type.body }}>
      <thead><tr style={{ backgroundColor: primary, color: t.header_text_color || '#fff' }}>{['Descrizione', 'Qtà / U.M.', 'Prezzo netto', 'Importo netto'].map((label, i) => <th key={label} style={{ padding: `${padding}px 7px`, textAlign: i ? 'right' : 'left' }}>{label}</th>)}</tr></thead>
      <tbody>{draft.rows.map((row, i) => <tr className="quote-template-row-motion" key={`${row.id}:${row.quantity}:${row.price}:${row.name}`} style={{ background: t.table_zebra !== false && i % 2 === 0 ? accent : undefined }}>
        <td style={{ ...cell, width: '53%', overflowWrap: 'anywhere' }}><strong>{row.name}</strong><p style={{ fontSize: type.small, whiteSpace: 'pre-wrap', marginTop: 5 }}>{row.description}</p></td>
        <td style={{ ...cell, textAlign: 'right' }}>{row.quantity.toLocaleString('it-IT')} {row.unit}</td><td style={{ ...cell, textAlign: 'right' }}>{formatCurrency(row.price)}</td><td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(row.amount)}</td>
      </tr>)}</tbody>
    </table>
    {!draft.rows.length && <p style={{ padding: '28px 0', color: '#64748b' }}>Le lavorazioni appariranno dopo la conferma. Nessuna proposta incompleta è inclusa nel documento.</p>}
    <div style={{ marginTop: 24, textAlign: 'right' }}>{draft.globalDiscountPercent != null && draft.globalDiscountPercent > 0 && <p>Sconto generale applicato: {draft.globalDiscountPercent.toLocaleString('it-IT')}%</p>}{!draft.taxPending && draft.gross != null ? <><p>Imponibile netto: {formatCurrency(draft.net)}</p>{Object.entries(draft.taxBreakdown ?? {}).map(([rate, amount]) => <p key={rate}>IVA {rate}%: {formatCurrency(amount)}</p>)}<strong style={{ fontSize: type.h3, color: primary }} data-testid="live-quote-total">Totale IVA compresa: {formatCurrency(draft.gross)}</strong></> : <><p style={{ color: '#64748b' }}>IVA da definire</p><strong style={{ fontSize: type.h3, color: primary }} data-testid="live-quote-total">{draft.rows.length ? `Parziale netto: ${formatCurrency(draft.net)}` : 'Importo da determinare'}</strong></>}</div>
    {draft.commonNotes && <section style={{ marginTop: 22 }} aria-label="Ipotesi ed esclusioni comuni"><h4 style={{ color: primary, fontWeight: 700 }}>Ipotesi, esclusioni e note</h4><p style={{ whiteSpace: 'pre-wrap', fontSize: type.small, marginTop: 6 }}>{draft.commonNotes}</p></section>}
    {draft.scheduleText && <section style={{ marginTop: 22 }} aria-label="Programma lavori nel preventivo"><h4 style={{ color: primary, fontWeight: 700 }}>Programma indicativo dei lavori</h4><p style={{ whiteSpace: 'pre-wrap', fontSize: type.small, marginTop: 6 }}>{draft.scheduleText}</p></section>}
    <p style={{ marginTop: 20, fontSize: type.small, color: '#64748b' }}>Bozza parziale: solo lavorazioni confermate. Dati cliente, IVA, tempi e condizioni da verificare prima dell’emissione.</p>
    {!!draft.blocks?.length && <p style={{ marginTop: 28, fontSize: type.small, color: '#64748b' }}>Contenuti allegati dal modello scelto · non aggiungono lavorazioni o importi</p>}
    {draft.blocks?.map(block => <section key={block.id} style={{ marginTop: 28 }}><h4 style={{ color: primary, fontWeight: 700 }}>{block.title}</h4>{block.image && <img src={block.image} alt={block.title} style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', marginTop: 10 }} />}<TemplateText text={block.text} />{block.specs?.map((spec, i) => <p key={i} style={{ marginTop: 5 }}><strong>{spec.label}:</strong> {spec.value}</p>)}</section>)}
    {[[t.show_payment_terms !== false, 'Pagamenti', t.payment_terms_text], [t.show_delivery_terms !== false, 'Tempi e consegna', t.delivery_terms_text], [t.show_contractual_terms, 'Condizioni contrattuali', t.contractual_terms_text], [t.show_legal_terms, 'Termini legali', t.legal_terms_text]].map(([show, title, text]) => show && typeof text === 'string' && text.trim() ? <section key={String(title)} style={{ marginTop: 24, fontSize: type.body }}><h4 style={{ color: primary, fontWeight: 700 }}>{String(title)}</h4><TemplateText text={text} /></section> : null)}
  </div>;
}

function DetailBody({
  primary, accent, textColor, t, marginPx, type, inline,
}: {
  primary: string;
  accent: string;
  textColor: string;
  t: Partial<QuoteTemplate>;
  marginPx: number;
  type: ReturnType<typeof buildTypographyScale>;
  inline?: boolean;
}) {
  const draft = React.useContext(DraftContext);
  if (draft) return <DraftDetail draft={draft} primary={primary} accent={accent} textColor={textColor} t={t} marginPx={inline ? 0 : marginPx} type={type} />;
  const rows = [
    { name: 'Fornitura principale su misura', qty: 3, price: '€ 890,00', total: '€ 2.670,00' },
    { name: 'Dotazioni e finiture concordate', qty: 2, price: '€ 1.200,00', total: '€ 2.400,00' },
    { name: 'Installazione e posa', qty: 1, price: '€ 800,00', total: '€ 800,00' },
  ];
  const density = t.row_density ?? 'normal';
  const padding = rowPadding(density);
  const zebra = t.table_zebra !== false;
  const borders = t.table_borders ?? 'horizontal';

  const wrapperStyle: React.CSSProperties = inline
    ? {}
    : { padding: `20px ${marginPx}px` };

  const cellStyle = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    padding: `${padding}px 8px`,
    borderBottom: borders === 'none' ? 'none' : `1px solid ${borders === 'all' ? '#D1D5DB' : '#E5E7EB'}`,
    borderRight: borders === 'all' ? '1px solid #D1D5DB' : 'none',
    color: textColor,
    ...extra,
  });

  return (
    <div style={wrapperStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: type.body }}>
        <thead>
          <tr style={{ backgroundColor: primary, color: '#FFFFFF' }}>
            <th style={{ padding: `${padding}px 8px`, textAlign: 'left', fontWeight: 600 }}>Descrizione</th>
            <th style={{ padding: `${padding}px 8px`, textAlign: 'center', fontWeight: 600 }}>Qtà</th>
            <th style={{ padding: `${padding}px 8px`, textAlign: 'right', fontWeight: 600 }}>Prezzo</th>
            <th style={{ padding: `${padding}px 8px`, textAlign: 'right', fontWeight: 600 }}>Totale</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{
              backgroundColor: zebra && i % 2 === 0 ? accent : 'transparent',
            }}>
              <td style={cellStyle()}>{r.name}</td>
              <td style={cellStyle({ textAlign: 'center' })}>{r.qty}</td>
              <td style={cellStyle({ textAlign: 'right' })}>{r.price}</td>
              <td style={cellStyle({ textAlign: 'right', fontWeight: 600 })}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 20, textAlign: 'right', fontSize: type.body }}>
        <div style={{ marginBottom: 4, color: '#6B7280' }}>Subtotale: € 5.870,00</div>
        <div style={{ marginBottom: 4, color: '#6B7280' }}>IVA 22%: € 1.291,40</div>
        <div style={{ fontSize: type.h3, fontWeight: 700, color: primary, marginTop: 8 }}>TOTALE: € 7.161,40</div>
      </div>
      {(t.show_payment_terms !== false || t.show_delivery_terms !== false || t.show_notes !== false) && (
        <div style={{ marginTop: 24, display: 'grid', gap: 8, fontSize: type.small, color: '#4B5563' }}>
          {t.show_payment_terms !== false && (
            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 8 }}>
              <strong style={{ color: textColor }}>Pagamento:</strong> {t.payment_terms_text || 'Acconto del 30% alla firma, saldo alla consegna.'}
            </div>
          )}
          {t.show_delivery_terms !== false && (
            <div>
              <strong style={{ color: textColor }}>Consegna:</strong> {t.delivery_terms_text || 'Tempistiche concordate dopo rilievo tecnico.'}
            </div>
          )}
          {t.show_notes !== false && (
            <div>
              <strong style={{ color: textColor }}>Note:</strong> prezzo valido salvo variazioni misure in fase di rilievo.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
