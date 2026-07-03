/**
 * PremiumReportPDFButton — Pulsante per generare il report PDF premium
 * 
 * Renderizza PremiumReportPDF off-screen, cattura sezione per sezione
 * con html2canvas, assembla con jsPDF con header/footer per ogni pagina.
 */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// 2026-05-27 (perf fix P0): jspdf (~426KB) + html2canvas (~200KB) importati
// dinamicamente al primo click, così non pesano sul chunk di TabSelezioni.
import { PremiumReportPDF, PremiumReportPDFProps } from './PremiumReportPDF';
import { TraitCode, TRAIT_LABELS } from '../types';
import type { ProfiloTipoV5, ReliabilityIndex } from '../types';
import { SyndromeResult } from '../lib/syndromes';
import { calculateAllRolesCompatibilityV5, mapFunzioneToRuoloV5 } from '../lib/roleMatchingV5';
import { calculateRoleMatchingV5Cached } from '../lib/roleMatchingV5Cache';
import { calculateMappaInteriore } from '../lib/mappaInteriore';
import { getPersonalizedManagementTips, getPersonalizedClosingText } from '../lib/managementTipsV5';

export interface PremiumReportPDFButtonProps {
  candidato: {
    nome: string;
    cognome: string;
    sesso?: string | null;
    ruolo_attuale?: string | null;
    data_test?: string | null;
    funzione?: string | null;
    eta?: number | null;
    azienda?: string | null;
  };
  traits: Record<TraitCode, number>;
  macroAreas: { essere: number; fare: number; avere: number };
  profiloTipo?: ProfiloTipoV5;
  reliabilityIndex?: ReliabilityIndex;
  syndromes: SyndromeResult[];
  className?: string;
}

// Load logo
const loadLogoBase64 = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      if (ctx) { ctx.drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); }
      else reject(new Error('No canvas ctx'));
    };
    img.onerror = reject;
    img.src = '/talentprofile_logo_v3.png';
  });
};

export function PremiumReportPDFButton({
  candidato, traits, macroAreas, profiloTipo, reliabilityIndex, syndromes, className
}: PremiumReportPDFButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);

    try {
      // Calculate all data
      setProgress(5);
      const ruolo = mapFunzioneToRuoloV5(candidato.funzione || 'Venditore/Commerciale');
      const roleMatch = calculateRoleMatchingV5Cached(ruolo, traits as any, candidato.eta ?? undefined);
      const allRoles = calculateAllRolesCompatibilityV5(ruolo, traits as any, candidato.eta ?? undefined);
      const mappaInteriore = calculateMappaInteriore(traits as Record<TraitCode, number>, candidato.nome, candidato.sesso || null, syndromes, candidato.eta ?? undefined);

      // Management tips
      const tips = getPersonalizedManagementTips(traits, candidato.nome, candidato.sesso || null, syndromes.map(s => s.code));
      const managementTips = tips.map(t => ({ testo: t.testo, isPriorityOne: t.tip.isPriorityOne }));
      const managementClosingText = getPersonalizedClosingText(candidato.nome, candidato.sesso || null);

      // Colloquio areas (reuse the same logic as ColloquioTabV3)
      const colloquioAreas = generateColloquioAreas(traits, candidato.nome, candidato.sesso || null);

      // Action plan (simplified - extract from same logic)
      const actionPlan = generateActionPlan(traits, syndromes, candidato.nome, candidato.sesso || null);

      // Growth plan
      const growthPlan = generateGrowthPlan(traits, candidato.nome, candidato.sesso || null, macroAreas, candidato.eta ?? undefined);

      setProgress(15);

      // Create off-screen container
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '210mm';
      document.body.appendChild(container);

      const root = createRoot(container);
      const pdfProps: PremiumReportPDFProps = {
        candidato, traits, macroAreas, profiloTipo, reliabilityIndex,
        syndromes, roleMatch, allRolesCompatibility: allRoles,
        mappaInteriore, colloquioAreas, actionPlan, growthPlan,
        managementTips, managementClosingText,
      };

      await new Promise<void>(resolve => {
        root.render(<PremiumReportPDF {...pdfProps} />);
        setTimeout(resolve, 800);
      });

      setProgress(25);

      // Load logo
      let logoData: string | null = null;
      try { logoData = await loadLogoBase64(); } catch { /* ok */ }

      // 2026-05-27 (perf): dynamic import al primo uso. ~500ms-1s ritardo
      // alla prima esportazione, istantaneo dopo (modulo cached).
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      // Capture sections
      const sections = container.querySelectorAll('[data-section]');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const margin = 5;
      const contentW = pdfW - margin * 2;
      const headerH = 12;
      const footerH = 10;
      const usableH = pdfH - headerH - footerH;

      let currentPage = 1;
      const fullName = `${candidato.cognome} ${candidato.nome}`;
      const today = new Date().toLocaleDateString('it-IT');

      // Capture all canvases once (reused for counting + rendering)
      const canvases: { canvas: HTMLCanvasElement; isCover: boolean; sectionId: string }[] = [];
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i] as HTMLElement;
        const sectionId = section.getAttribute('data-section') || '';
        const canvas = await html2canvas(section, {
          scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
          width: section.scrollWidth, height: section.scrollHeight,
        });
        canvases.push({ canvas, isCover: sectionId === 'cover', sectionId });
        setProgress(25 + Math.round(((i + 1) / sections.length) * 35));
      }

      // Count total pages
      let totalPages = 0;
      for (const { canvas, isCover } of canvases) {
        const ratio = contentW / canvas.width;
        const scaledH = canvas.height * ratio;
        const maxContentH = isCover ? pdfH : usableH;
        if (scaledH <= maxContentH) {
          totalPages += 1;
        } else {
          const pxPerPage = maxContentH / ratio;
          let pages = Math.ceil(canvas.height / pxPerPage);
          const lastSliceH = canvas.height - (pages - 1) * pxPerPage;
          if (pages > 1 && lastSliceH < pxPerPage * 0.08) {
            pages -= 1;
          }
          totalPages += pages;
        }
      }

      const addHeaderFooter = (pageNum: number, isCover: boolean) => {
        if (isCover) return;
        pdf.setFontSize(9);
        pdf.setTextColor(30, 58, 95);
        pdf.text('EdiliziaInCloud', margin, 8);
        pdf.setFontSize(8);
        pdf.setTextColor(136, 136, 136);
        pdf.text(`Talent Assessment — ${fullName}`, pdfW - margin, 8, { align: 'right' });

        pdf.setDrawColor(221, 221, 221);
        pdf.line(margin, pdfH - footerH, pdfW - margin, pdfH - footerH);
        pdf.setFontSize(8);
        pdf.setTextColor(136, 136, 136);
        pdf.text(`Pagina ${pageNum} di ${totalPages}`, pdfW / 2, pdfH - 5, { align: 'center' });
        pdf.text(today, pdfW - margin, pdfH - 5, { align: 'right' });
      };

      // Render pages from cached canvases
      for (let i = 0; i < canvases.length; i++) {
        const { canvas, isCover } = canvases[i];

        try {
          const ratio = contentW / canvas.width;
          const scaledH = canvas.height * ratio;
          const maxContentH = isCover ? pdfH : usableH;
          const pxPerPage = maxContentH / ratio;

          if (scaledH <= maxContentH) {
            if (i > 0) { pdf.addPage(); currentPage++; }
            const yOffset = isCover ? 0 : headerH;
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            pdf.addImage(imgData, 'JPEG', margin, yOffset, contentW, scaledH);
            addHeaderFooter(currentPage, isCover);
          } else {
            let srcY = 0;
            let isFirstSlice = true;

            while (srcY < canvas.height) {
              const remainingH = canvas.height - srcY;
              const sliceH = Math.min(pxPerPage, remainingH);

              // Skip last slice if too small (< 8% of page = just padding/overflow)
              if (remainingH < pxPerPage * 0.08 && srcY > 0) {
                break;
              }

              const sliceCanvas = document.createElement('canvas');
              sliceCanvas.width = canvas.width;
              sliceCanvas.height = sliceH;
              const ctx = sliceCanvas.getContext('2d')!;
              ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

              const sliceImg = sliceCanvas.toDataURL('image/jpeg', 0.92);
              const sliceScaledH = sliceH * ratio;

              if (!isFirstSlice || i > 0) {
                pdf.addPage();
                currentPage++;
              }

              const yOffset = isCover && isFirstSlice ? 0 : headerH;
              pdf.addImage(sliceImg, 'JPEG', margin, yOffset, contentW, sliceScaledH);
              addHeaderFooter(currentPage, isCover && isFirstSlice);

              srcY += sliceH;
              isFirstSlice = false;
            }
          }
        } catch (err) {
          console.warn(`PDF section ${canvases[i].sectionId} failed:`, err);
        }

        setProgress(60 + Math.round(((i + 1) / canvases.length) * 35));
      }

      // Cleanup
      root.unmount();
      document.body.removeChild(container);

      // Save
      setProgress(98);
      const safeFileName = `${candidato.cognome}_${candidato.nome}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const date = new Date().toISOString().split('T')[0];
      pdf.save(`EdiliziaInCloud_Talent_${safeFileName}_${date}.pdf`);

      setProgress(100);
      toast({ title: 'Report PDF Premium generato', description: 'Il report è stato scaricato con successo' });
    } catch (error) {
      console.error('Premium PDF export error:', error);
      toast({ title: 'Errore', description: 'Errore durante la generazione del report PDF', variant: 'destructive' });
    } finally {
      setIsExporting(false);
      setProgress(0);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting} className={className}>
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {progress > 0 ? `${progress}%` : 'Generando...'}
        </>
      ) : (
        <>
          <Download className="h-4 w-4 mr-2" />
          Scarica PDF
        </>
      )}
    </Button>
  );
}

// ─── Helpers: generate data for PDF ─────────────────

function generateColloquioAreas(traits: Record<string, number>, nome: string, sesso: string | null) {
  const areas: { id: string; area: string; priorita: 'ALTA' | 'MEDIA'; motivazione: string; domande: string[] }[] = [];
  const pronome = sesso === 'F' ? 'la' : 'lo';

  if (traits.GP < 21) {
    areas.push({ id: 'pressioni', area: 'Pressioni e benessere', priorita: 'ALTA',
      motivazione: `${nome} mostra segni di forte pressione relazionale.`,
      domande: ['Come stai davvero in questo periodo?', "C'è qualcuno nel tuo ambiente che ti causa preoccupazione?", 'Come reagisci quando qualcosa non va secondo i piani?'] });
  }
  if (traits.ORG < 30) {
    areas.push({ id: 'org', area: 'Organizzazione e metodo', priorita: 'ALTA',
      motivazione: `${nome} sembra avere difficoltà a pianificare e stabilire priorità.`,
      domande: ['Come organizzi una settimana tipo di lavoro?', 'Quando arrivano 3 urgenze contemporaneamente, come decidi quale affrontare?'] });
  }
  if (traits.PRO < 10) {
    areas.push({ id: 'critiche', area: 'Gestione delle critiche', priorita: 'ALTA',
      motivazione: `${nome} sembra prendere le critiche molto sul personale.`,
      domande: ["L'ultima volta che qualcuno ti ha criticato: cosa hai provato?", 'Quando qualcosa va storto nel tuo lavoro, qual è la tua prima reazione?'] });
  }
  if (traits.RC > 45 || traits.RC < -14) {
    areas.push({ id: 'cambiamento', area: 'Apertura al cambiamento', priorita: 'ALTA',
      motivazione: traits.RC > 45 ? `${nome} tende ad essere molto resistente ai cambiamenti.` : `${nome} cambia idea e direzione molto spesso.`,
      domande: ['Come reagisci quando i piani cambiano all\'improvviso?', 'Preferisci ambienti stabili o dinamici? Perché?'] });
  }
  if (traits.DET < 25) {
    areas.push({ id: 'comunicazione', area: 'Comunicazione diretta', priorita: 'MEDIA',
      motivazione: `${nome} tende ad evitare il confronto diretto.`,
      domande: ["Raccontami l'ultima volta che hai detto qualcosa di scomodo a un superiore.", 'Come gestisci un collaboratore che non fa il suo lavoro?'] });
  }
  if (traits.COM < 0) {
    areas.push({ id: 'relazioni', area: 'Relazioni con gli altri', priorita: 'MEDIA',
      motivazione: `${nome} sembra avere un approccio selettivo nelle relazioni.`,
      domande: ['Come costruisci relazioni professionali con persone nuove?', 'Hai lavorato con qualcuno molto diverso da te? Come è andata?'] });
  }
  if (traits.AUT < 25) {
    areas.push({ id: 'motivazione', area: 'Motivazione e obiettivi', priorita: 'MEDIA',
      motivazione: `La motivazione interna di ${nome} è debole.`,
      domande: ['Cosa ti appassiona nel tuo lavoro?', 'Quali sono i tuoi obiettivi professionali nei prossimi 3 anni?'] });
  }

  areas.sort((a, b) => (a.priorita === 'ALTA' ? -1 : 1) - (b.priorita === 'ALTA' ? -1 : 1));
  return areas;
}

function generateActionPlan(traits: Record<string, number>, syndromes: SyndromeResult[], nome: string, sesso: string | null) {
  const actions: { priority: string; area: string; action: string; timeline: string; responsible: string; trigger?: string }[] = [];

  if (traits.GP < 21) {
    actions.push({ priority: 'P1', area: 'Gestione Pressioni', action: `Identificare la fonte di pressione. Colloquio riservato con HR.`, timeline: '0-3 mesi', responsible: 'HR', trigger: `GP = ${traits.GP}` });
  }
  if (traits.ORG < 25) {
    actions.push({ priority: 'P2', area: 'Organizzazione', action: `Affiancare ${nome} con buddy organizzato. Fornire strumenti di time management.`, timeline: '0-3 mesi', responsible: 'Manager', trigger: `ORG = ${traits.ORG}` });
  }
  if (traits.AUT < 20) {
    actions.push({ priority: 'P2', area: 'Automotivazione', action: `Celebrare ogni piccolo successo. Feedback positivo regolare.`, timeline: '0-3 mesi', responsible: 'Manager', trigger: `AUT = ${traits.AUT}` });
  }
  if (traits.ADS < 20) {
    actions.push({ priority: 'P3', area: 'Autodisciplina', action: `Strutturare il lavoro con checklist e scadenze chiare.`, timeline: '3-6 mesi', responsible: 'Manager', trigger: `ADS = ${traits.ADS}` });
  }
  if (traits.DET < 20) {
    actions.push({ priority: 'P3', area: 'Determinazione', action: `Creare ambiente sicuro per esprimersi. Chiedere esplicitamente opinioni.`, timeline: '3-6 mesi', responsible: 'Manager', trigger: `DET = ${traits.DET}` });
  }
  if (traits.COM < 0) {
    actions.push({ priority: 'P4', area: 'Comprensione', action: `Non forzare collaborazioni con persone molto diverse. Introdurre gradualmente la diversità.`, timeline: '6-12 mesi', responsible: 'HR', trigger: `COM = ${traits.COM}` });
  }

  return actions;
}

function generateGrowthPlan(traits: Record<string, number>, nome: string, sesso: string | null, macro: { essere: number; fare: number; avere: number }, eta?: number) {
  const MAIN_TRAITS: TraitCode[] = ['ORG','AUT','GP','ADS','DET','VEN','HRM','LDR','PRO','COM','ESP'];
  
  let lowest: { code: TraitCode; value: number } = { code: 'ORG', value: Infinity };
  let highest: { code: TraitCode; value: number } = { code: 'ORG', value: -Infinity };
  for (const t of MAIN_TRAITS) {
    if ((traits[t] ?? 0) < lowest.value) lowest = { code: t, value: traits[t] ?? 0 };
    if ((traits[t] ?? 0) > highest.value) highest = { code: t, value: traits[t] ?? 0 };
  }

  const lowLabel = TRAIT_LABELS[lowest.code];
  const highLabel = TRAIT_LABELS[highest.code];

  const rootCause = `L'area più critica per ${nome} è ${lowLabel} (${lowest.value}). Lavorare su questo tratto avrà un effetto a cascata su tutti gli altri aspetti del profilo.`;
  const hiddenResource = `La risorsa più forte è ${highLabel} (${highest.value}). Questa può essere usata come leva per compensare la debolezza in ${lowLabel}.`;

  const viciouscircles: string[] = [];
  if (traits.GP < 21 && traits.AUT > 30) {
    viciouscircles.push(`Pressione alta + Ambizione = rischio burnout o reazione esplosiva`);
  }
  if (traits.AUT > 40 && traits.ADS < 20) {
    viciouscircles.push(`Grande ambizione + Poca disciplina = frustrazione cronica da mancati risultati`);
  }
  if (traits.DET < 20 && traits.PRO > 30) {
    viciouscircles.push(`Collaborativo ma incapace di dire no = sovraccarico e risentimento`);
  }

  const phases = [
    { name: 'Stabilizzazione (0-3 mesi)', description: `Affrontare le criticità immediate. Focus su ${lowLabel}. Check-in settimanali.` },
    { name: 'Sviluppo (3-6 mesi)', description: `Costruire nuove abitudini. Sfruttare ${highLabel} come leva. Obiettivi intermedi.` },
    { name: 'Consolidamento (6-12 mesi)', description: `Rafforzare i progressi. Aumentare gradualmente autonomia e responsabilità.` },
    { name: 'Maturità (12-24 mesi)', description: `Verifica risultati. Ricompilazione test per misurare evoluzione. Piano di crescita fase 2.` },
  ];

  return { rootCause, hiddenResource, viciouscircles, phases };
}
