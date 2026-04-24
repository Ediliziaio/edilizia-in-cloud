import React from 'react';
import type { QuoteTemplate, TextAlignment } from '@/types/quoteTemplate';

interface Props {
  template: Partial<QuoteTemplate>;
  companyName?: string;
  page?: 'cover' | 'detail';
  scale?: number;
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

export function QuoteTemplatePreview({
  template: t,
  companyName = 'La Tua Azienda Srl',
  page = 'cover',
  scale = 0.4,
}: Props) {
  const primary = t.primary_color ?? '#1E40AF';
  const secondary = t.secondary_color ?? '#3B82F6';
  const accent = t.accent_color ?? '#DBEAFE';
  const headerText = t.header_text_color ?? '#FFFFFF';
  const textColor = t.text_color ?? '#111827';
  const layout = t.layout ?? 'classic';
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

  return (
    <div style={{ width: sheetW * scale, height: sheetH * scale, overflow: 'hidden' }}>
      <div
        style={{
          width: sheetW,
          height: sheetH,
          backgroundColor: '#FFFFFF',
          position: 'relative',
          overflow: 'hidden',
          fontFamily,
          fontSize: type.body,
          lineHeight: type.lineHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          borderRadius: 4,
          color: textColor,
        }}
      >
        {layout === 'classic' && (
          <ClassicLayout
            primary={primary} secondary={secondary} accent={accent}
            headerText={headerText} textColor={textColor}
            companyName={companyName} t={t} page={page}
            marginPx={marginPx} type={type} alignment={alignment}
          />
        )}
        {layout === 'modern' && (
          <ModernLayout
            primary={primary} secondary={secondary} accent={accent}
            headerText={headerText} textColor={textColor}
            companyName={companyName} t={t} page={page}
            marginPx={marginPx} type={type} alignment={alignment}
          />
        )}
        {layout === 'minimal' && (
          <MinimalLayout
            primary={primary} secondary={secondary} accent={accent}
            headerText={headerText} textColor={textColor}
            companyName={companyName} t={t} page={page}
            marginPx={marginPx} type={type} alignment={alignment}
          />
        )}
        {layout === 'bold' && (
          <BoldLayout
            primary={primary} secondary={secondary} accent={accent}
            headerText={headerText} textColor={textColor}
            companyName={companyName} t={t} page={page}
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
        {t.footer_text && (
          <div style={{
            position: 'absolute', bottom: 16, left: marginPx, right: marginPx,
            fontSize: type.small, color: '#9CA3AF', textAlign: 'center',
          }}>
            {t.footer_text}
          </div>
        )}
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
  marginPx: number;
  type: ReturnType<typeof buildTypographyScale>;
  alignment: TextAlignment;
}

function ClassicLayout({ primary, accent, textColor, companyName, t, page, marginPx, type, alignment }: LayoutProps) {
  return (
    <>
      <div style={{ height: 8, backgroundColor: primary }} />
      <div style={{
        padding: `${marginPx}px ${marginPx}px 0`,
        display: 'flex',
        justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ fontSize: type.h2, fontWeight: 700, color: textColor, textAlign: alignment }}>{companyName}</div>
        {alignment === 'left' && t.show_quote_number !== false && (
          <div style={{ fontSize: type.small, color: '#6B7280' }}>OFFERTA N. OFF-2026-001</div>
        )}
      </div>
      <div style={{ margin: `12px ${marginPx}px`, height: 1, backgroundColor: '#E5E7EB' }} />
      {page === 'cover' ? (
        <CoverBody primary={primary} textColor={textColor} t={t} marginPx={marginPx} type={type} />
      ) : (
        <DetailBody primary={primary} accent={accent} textColor={textColor} t={t} marginPx={marginPx} type={type} />
      )}
    </>
  );
}

function ModernLayout({ primary, accent, headerText, textColor, companyName, t, page, marginPx, type, alignment }: LayoutProps) {
  return (
    <>
      <div style={{
        backgroundColor: primary,
        padding: `${Math.round(marginPx * 1.2)}px ${marginPx}px ${marginPx}px`,
        color: headerText,
        textAlign: alignment,
      }}>
        <div style={{ fontSize: type.body + 2, fontWeight: 600, marginBottom: 8 }}>{companyName}</div>
        {t.show_quote_number !== false && (
          <div style={{ fontSize: type.small, opacity: 0.8, marginBottom: 16 }}>OFFERTA N. OFF-2026-001</div>
        )}
        <div style={{ fontSize: type.h1, fontWeight: 700 }}>OFFERTA COMMERCIALE</div>
        <div style={{ fontSize: type.body, marginTop: 6, opacity: 0.9 }}>Offerta serramenti Villa Rossi</div>
        {t.cover_tagline && (
          <div style={{ fontSize: type.small, marginTop: 10, fontStyle: 'italic', opacity: 0.85 }}>{t.cover_tagline}</div>
        )}
      </div>
      {page === 'cover' ? (
        <CoverBody primary={primary} textColor={textColor} t={t} marginPx={marginPx} type={type} startY={0} />
      ) : (
        <DetailBody primary={primary} accent={accent} textColor={textColor} t={t} marginPx={marginPx} type={type} />
      )}
    </>
  );
}

function MinimalLayout({ primary, accent, textColor, companyName, t, page, marginPx, type, alignment }: LayoutProps) {
  return (
    <div style={{ padding: `${marginPx}px ${marginPx}px 0`, textAlign: alignment }}>
      <div style={{ borderBottom: `2px solid ${primary}`, paddingBottom: 20, marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: type.body + 4, fontWeight: 600, color: textColor }}>{companyName}</div>
          {t.show_quote_number !== false && (
            <div style={{ fontSize: type.small, color: '#9CA3AF' }}>OFF-2026-001</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: type.h1, fontWeight: 700, color: textColor, marginBottom: 8 }}>OFFERTA COMMERCIALE</div>
      <div style={{ fontSize: type.body, color: '#6B7280', marginBottom: 6 }}>Offerta serramenti Villa Rossi</div>
      {t.cover_tagline && (
        <div style={{ fontSize: type.small, color: primary, fontStyle: 'italic', marginBottom: 20 }}>{t.cover_tagline}</div>
      )}
      {page === 'cover' ? (
        <CoverBody primary={primary} textColor={textColor} t={t} marginPx={0} type={type} startY={0} inline />
      ) : (
        <DetailBody primary={primary} accent={accent} textColor={textColor} t={t} marginPx={0} type={type} inline />
      )}
    </div>
  );
}

function BoldLayout({ primary, accent, headerText, textColor, companyName, t, page, marginPx, type, alignment }: LayoutProps) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{
        width: 80, backgroundColor: primary,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: marginPx * 2,
      }}>
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
          <div style={{ fontSize: type.small, color: '#9CA3AF', marginBottom: 30 }}>OFFERTA N. OFF-2026-001</div>
        )}
        <div style={{
          fontSize: type.h1 * 1.4, fontWeight: 800, lineHeight: 1.1,
          color: textColor, marginBottom: 12,
        }}>
          OFFERTA<br />COMMERCIALE
        </div>
        <div style={{ fontSize: type.body, color: '#6B7280', marginBottom: 8 }}>Offerta serramenti Villa Rossi</div>
        {t.cover_tagline && (
          <div style={{ fontSize: type.small, color: primary, fontStyle: 'italic', marginBottom: 20 }}>{t.cover_tagline}</div>
        )}
        {page === 'cover' ? (
          <CoverBody primary={primary} textColor={textColor} t={t} marginPx={0} type={type} startY={0} inline />
        ) : (
          <DetailBody primary={primary} accent={accent} textColor={textColor} t={t} marginPx={0} type={type} inline />
        )}
      </div>
    </div>
  );
}

function CoverBody({
  primary, textColor, t, marginPx, type, startY, inline,
}: {
  primary: string;
  textColor: string;
  t: Partial<QuoteTemplate>;
  marginPx: number;
  type: ReturnType<typeof buildTypographyScale>;
  startY?: number;
  inline?: boolean;
}) {
  const wrapperStyle: React.CSSProperties = inline
    ? {}
    : { padding: `20px ${marginPx}px` };
  return (
    <div style={wrapperStyle}>
      {!inline && (
        <>
          <div style={{ fontSize: type.h2, fontWeight: 700, color: textColor, marginBottom: 4 }}>
            OFFERTA COMMERCIALE
          </div>
          <div style={{ fontSize: type.small, color: '#6B7280', marginBottom: 6 }}>
            Offerta serramenti Villa Rossi
          </div>
          {t.cover_tagline && (
            <div style={{ fontSize: type.small, color: primary, fontStyle: 'italic', marginBottom: 16 }}>
              {t.cover_tagline}
            </div>
          )}
        </>
      )}
      <div style={{ marginTop: inline ? 30 : 20, display: 'flex', gap: 60, textAlign: 'left' }}>
        {t.show_company_details !== false && (
          <div>
            <div style={{ fontSize: type.label - 2, fontWeight: 700, color: '#9CA3AF', marginBottom: 6, letterSpacing: 1 }}>
              EMESSA DA
            </div>
            <div style={{ fontSize: type.body, fontWeight: 600 }}>Azienda Demo Srl</div>
            <div style={{ fontSize: type.small, color: '#6B7280' }}>info@azienda.it</div>
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
    </div>
  );
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
  const rows = [
    { name: 'Finestre doppio vetro 100x140', qty: 3, price: '€ 890,00', total: '€ 2.670,00' },
    { name: 'Porta finestra 90x210', qty: 2, price: '€ 1.200,00', total: '€ 2.400,00' },
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
            <th style={{ padding: `${padding}px 8px`, textAlign: 'center', fontWeight: 600 }}>Qty</th>
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
    </div>
  );
}
