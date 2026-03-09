import React from 'react';
import type { QuoteTemplate } from '@/types/quoteTemplate';

interface Props {
  template: Partial<QuoteTemplate>;
  companyName?: string;
  page?: 'cover' | 'detail';
  scale?: number;
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
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          borderRadius: 4,
          color: textColor,
        }}
      >
        {layout === 'classic' && (
          <ClassicLayout primary={primary} accent={accent} headerText={headerText} textColor={textColor} companyName={companyName} t={t} page={page} />
        )}
        {layout === 'modern' && (
          <ModernLayout primary={primary} accent={accent} headerText={headerText} textColor={textColor} companyName={companyName} t={t} page={page} />
        )}
        {layout === 'minimal' && (
          <MinimalLayout primary={primary} accent={accent} headerText={headerText} textColor={textColor} companyName={companyName} t={t} page={page} />
        )}
        {layout === 'bold' && (
          <BoldLayout primary={primary} accent={accent} headerText={headerText} textColor={textColor} companyName={companyName} t={t} page={page} />
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
            position: 'absolute', bottom: 16, left: 50, right: 50,
            fontSize: 8, color: '#9CA3AF', textAlign: 'center',
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
  accent: string;
  headerText: string;
  textColor: string;
  companyName: string;
  t: Partial<QuoteTemplate>;
  page: 'cover' | 'detail';
}

function ClassicLayout({ primary, accent, headerText, textColor, companyName, t, page }: LayoutProps) {
  return (
    <>
      <div style={{ height: 8, backgroundColor: primary }} />
      <div style={{ padding: '30px 50px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: textColor }}>{companyName}</div>
        {t.show_quote_number !== false && (
          <div style={{ fontSize: 10, color: '#6B7280' }}>OFFERTA N. OFF-2026-001</div>
        )}
      </div>
      <div style={{ margin: '12px 50px', height: 1, backgroundColor: '#E5E7EB' }} />
      {page === 'cover' ? (
        <CoverBody primary={primary} textColor={textColor} t={t} />
      ) : (
        <DetailBody primary={primary} accent={accent} textColor={textColor} />
      )}
    </>
  );
}

function ModernLayout({ primary, accent, headerText, textColor, companyName, t, page }: LayoutProps) {
  return (
    <>
      <div style={{ backgroundColor: primary, padding: '40px 50px 35px', color: headerText }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{companyName}</div>
        {t.show_quote_number !== false && (
          <div style={{ fontSize: 9, opacity: 0.8, marginBottom: 16 }}>OFFERTA N. OFF-2026-001</div>
        )}
        <div style={{ fontSize: 22, fontWeight: 700 }}>OFFERTA COMMERCIALE</div>
        <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>Offerta serramenti Villa Rossi</div>
        {t.cover_tagline && (
          <div style={{ fontSize: 10, marginTop: 10, fontStyle: 'italic', opacity: 0.85 }}>{t.cover_tagline}</div>
        )}
      </div>
      {page === 'cover' ? (
        <CoverBody primary={primary} textColor={textColor} t={t} startY={0} />
      ) : (
        <DetailBody primary={primary} accent={accent} textColor={textColor} />
      )}
    </>
  );
}

function MinimalLayout({ primary, accent, headerText, textColor, companyName, t, page }: LayoutProps) {
  return (
    <div style={{ padding: '40px 50px 0' }}>
      <div style={{ borderBottom: `2px solid ${primary}`, paddingBottom: 20, marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: textColor }}>{companyName}</div>
          {t.show_quote_number !== false && (
            <div style={{ fontSize: 9, color: '#9CA3AF' }}>OFF-2026-001</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: textColor, marginBottom: 8 }}>OFFERTA COMMERCIALE</div>
      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>Offerta serramenti Villa Rossi</div>
      {t.cover_tagline && (
        <div style={{ fontSize: 10, color: primary, fontStyle: 'italic', marginBottom: 20 }}>{t.cover_tagline}</div>
      )}
      {page === 'cover' ? (
        <CoverBody primary={primary} textColor={textColor} t={t} startY={0} inline />
      ) : (
        <DetailBody primary={primary} accent={accent} textColor={textColor} />
      )}
    </div>
  );
}

function BoldLayout({ primary, accent, headerText, textColor, companyName, t, page }: LayoutProps) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 80, backgroundColor: primary, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 40 }}>
        <div style={{
          transform: 'rotate(-90deg)', transformOrigin: 'center',
          whiteSpace: 'nowrap', color: headerText,
          fontSize: 11, fontWeight: 600, letterSpacing: 1,
        }}>
          {companyName}
        </div>
      </div>
      <div style={{ flex: 1, padding: '50px 40px 0' }}>
        {t.show_quote_number !== false && (
          <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 30 }}>OFFERTA N. OFF-2026-001</div>
        )}
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: textColor, marginBottom: 12 }}>
          OFFERTA<br />COMMERCIALE
        </div>
        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Offerta serramenti Villa Rossi</div>
        {t.cover_tagline && (
          <div style={{ fontSize: 10, color: primary, fontStyle: 'italic', marginBottom: 20 }}>{t.cover_tagline}</div>
        )}
        {page === 'cover' ? (
          <CoverBody primary={primary} textColor={textColor} t={t} startY={0} inline />
        ) : (
          <DetailBody primary={primary} accent={accent} textColor={textColor} />
        )}
      </div>
    </div>
  );
}

function CoverBody({ primary, textColor, t, startY, inline }: { primary: string; textColor: string; t: Partial<QuoteTemplate>; startY?: number; inline?: boolean }) {
  const Wrapper = inline ? React.Fragment : ({ children }: { children: React.ReactNode }) => (
    <div style={{ padding: '20px 50px' }}>{children}</div>
  );
  return (
    <Wrapper>
      {!inline && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: textColor, marginBottom: 4 }}>OFFERTA COMMERCIALE</div>
          <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 6 }}>Offerta serramenti Villa Rossi</div>
          {t.cover_tagline && (
            <div style={{ fontSize: 10, color: primary, fontStyle: 'italic', marginBottom: 16 }}>{t.cover_tagline}</div>
          )}
        </>
      )}
      <div style={{ marginTop: inline ? 30 : 20, display: 'flex', gap: 60 }}>
        {t.show_company_details !== false && (
          <div>
            <div style={{ fontSize: 8, fontWeight: 700, color: '#9CA3AF', marginBottom: 6, letterSpacing: 1 }}>EMESSA DA</div>
            <div style={{ fontSize: 10, fontWeight: 600 }}>Azienda Demo Srl</div>
            <div style={{ fontSize: 9, color: '#6B7280' }}>info@azienda.it</div>
            <div style={{ fontSize: 9, color: '#6B7280' }}>Via Roma 1, Milano</div>
          </div>
        )}
        {t.show_client_details !== false && (
          <div>
            <div style={{ fontSize: 8, fontWeight: 700, color: '#9CA3AF', marginBottom: 6, letterSpacing: 1 }}>DESTINATARIO</div>
            <div style={{ fontSize: 10, fontWeight: 600 }}>Mario Rossi</div>
            <div style={{ fontSize: 9, color: '#6B7280' }}>mario.rossi@email.it</div>
            <div style={{ fontSize: 9, color: '#6B7280' }}>Via Garibaldi 10, Roma</div>
          </div>
        )}
      </div>
      {t.show_validity_date !== false && (
        <div style={{ marginTop: 24, fontSize: 9, color: '#6B7280' }}>
          Data: 09/03/2026 — Valida fino al: 08/04/2026
        </div>
      )}
    </Wrapper>
  );
}

function DetailBody({ primary, accent, textColor }: { primary: string; accent: string; textColor: string }) {
  const rows = [
    { name: 'Finestre doppio vetro 100x140', qty: 3, price: '€ 890,00', total: '€ 2.670,00' },
    { name: 'Porta finestra 90x210', qty: 2, price: '€ 1.200,00', total: '€ 2.400,00' },
    { name: 'Installazione e posa', qty: 1, price: '€ 800,00', total: '€ 800,00' },
  ];
  return (
    <div style={{ padding: '20px 50px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
        <thead>
          <tr style={{ backgroundColor: primary, color: '#FFFFFF' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Descrizione</th>
            <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>Qty</th>
            <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>Prezzo</th>
            <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>Totale</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? accent : 'transparent' }}>
              <td style={{ padding: '5px 8px', color: textColor }}>{r.name}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center', color: textColor }}>{r.qty}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: textColor }}>{r.price}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: textColor }}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 20, textAlign: 'right', fontSize: 9 }}>
        <div style={{ marginBottom: 4, color: '#6B7280' }}>Subtotale: € 5.870,00</div>
        <div style={{ marginBottom: 4, color: '#6B7280' }}>IVA 22%: € 1.291,40</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: primary, marginTop: 8 }}>TOTALE: € 7.161,40</div>
      </div>
    </div>
  );
}
