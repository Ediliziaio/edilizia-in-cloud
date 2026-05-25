import { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { SyndromeResult } from '../lib/syndromes';

// Helper function to load logo as base64
const loadLogoAsBase64 = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL('image/png')); }
      else reject(new Error('Cannot get canvas context'));
    };
    img.onerror = reject;
    img.src = '/talentprofile_logo_v3.png';
  });
};

// Function to add watermark to each page
const addWatermarkToPage = (pdf: jsPDF, logoData: string, pdfWidth: number, pdfHeight: number) => {
  const logoWidth = 35;
  const logoHeight = 12;
  const margin = 10;
  pdf.addImage(logoData, 'PNG', pdfWidth - logoWidth - margin, pdfHeight - logoHeight - margin, logoWidth, logoHeight);
};

// ================================================================
// InterviewSheetPDFButton - Genera PDF Scheda Colloquio A4
// ================================================================

import { InterviewSheetPDF } from './InterviewSheetPDF';
import { SYNDROMES_V5_DATA } from '../lib/syndromesV5Data';
import { RoleMatchResultV5 } from '../lib/roleMatchingV5';
import { TraitCode, ProfiloTipoV5, ReliabilityIndex, TRAIT_LABELS } from '../types';
import { ClipboardList } from 'lucide-react';

interface InterviewSheetPDFButtonProps {
  candidato: {
    nome: string;
    cognome: string;
    sesso?: string | null;
    ruolo_attuale?: string | null;
    data_test?: string | null;
    funzione?: string | null;
  };
  traits: Record<TraitCode, number>;
  macroAreas: {
    essere: number;
    fare: number;
    avere: number;
  };
  profiloTipo: ProfiloTipoV5;
  reliabilityIndex: ReliabilityIndex;
  syndromes: SyndromeResult[];
  roleMatch?: RoleMatchResultV5;
  className?: string;
}

function generateInterviewQuestionsV5(
  syndromes: SyndromeResult[],
  traits: Record<TraitCode, number>
): string[] {
  const questions: string[] = [];
  
  questions.push("Cosa la motiva a candidarsi per questa posizione?");
  
  const activeSyndromes = [...syndromes]
    .filter(s => s.isActive)
    .sort((a, b) => {
      const order: Record<string, number> = { RED: 1, ORANGE: 2, YELLOW: 3 };
      return (order[a.severity] || 4) - (order[b.severity] || 4);
    });
  
  for (const syndrome of activeSyndromes) {
    const data = SYNDROMES_V5_DATA[syndrome.code];
    if (data?.interviewQuestions) {
      questions.push(...data.interviewQuestions.slice(0, 2));
    }
    if (questions.length >= 8) break;
  }
  
  const criticalTraits = Object.entries(traits)
    .filter(([key, value]) => key !== 'CTRL' && value < 10)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3);
  
  for (const [trait] of criticalTraits) {
    const traitLabel = TRAIT_LABELS[trait as TraitCode];
    if (traitLabel && questions.length < 9) {
      questions.push(`Come gestisce situazioni che richiedono ${traitLabel}?`);
    }
  }
  
  const uniqueQuestions = [...new Set(questions)];
  uniqueQuestions.push("C'è qualcosa che vuole aggiungere o chiedermi?");
  
  return uniqueQuestions.slice(0, 10);
}

export function InterviewSheetPDFButton({
  candidato,
  traits,
  macroAreas,
  profiloTipo,
  reliabilityIndex,
  syndromes,
  roleMatch,
  className
}: InterviewSheetPDFButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const interviewQuestions = generateInterviewQuestionsV5(syndromes, traits);
      
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '210mm';
      document.body.appendChild(container);
      
      const root = createRoot(container);
      
      await new Promise<void>((resolve) => {
        root.render(
          <InterviewSheetPDF
            candidato={candidato}
            traits={traits}
            macroAreas={macroAreas}
            profiloTipo={profiloTipo}
            reliabilityIndex={reliabilityIndex}
            syndromes={syndromes}
            roleMatch={roleMatch}
            interviewQuestions={interviewQuestions}
          />
        );
        setTimeout(resolve, 500);
      });
      
      const logoData = await loadLogoAsBase64();
      
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: container.scrollWidth,
        height: container.scrollHeight,
      });
      
      root.unmount();
      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const margin = 5;
      const contentWidth = pdfWidth - (margin * 2);
      const ratio = contentWidth / canvas.width;
      const scaledHeight = canvas.height * ratio;
      
      pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, scaledHeight);
      addWatermarkToPage(pdf, logoData, pdfWidth, pdfHeight);

      const date = new Date().toISOString().split('T')[0];
      const safeFileName = `${candidato.cognome}_${candidato.nome}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`Scheda_Colloquio_${safeFileName}_${date}.pdf`);

      toast({
        title: 'Scheda Colloquio Generata',
        description: 'Il PDF è pronto per la stampa',
      });
    } catch (error) {
      console.error('Interview Sheet PDF error:', error);
      toast({
        title: 'Errore',
        description: 'Errore nella generazione della Scheda Colloquio',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleExport} 
      disabled={isExporting}
      className={className}
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Generando...
        </>
      ) : (
        <>
          <ClipboardList className="h-4 w-4 mr-2" />
          Scheda Colloquio
        </>
      )}
    </Button>
  );
}
