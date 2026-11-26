import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { CaricaAttestato, type AttestatoDaCaricare } from "@/components/campo/CaricaAttestato";
import { HrDocumentiSection } from "@/components/hr/HrDocumentiSection";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { apriDocumentoDaRichiesta } from "@/lib/campo/apriDocumento";
import "../../src/index.css";

async function pdfDiProva() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pagina = pdf.addPage([420, 595]);
  pagina.drawText("Documento di prova mobile", { x: 32, y: 550, size: 18, font });
  pagina.drawText("PDF generato per la verifica di apertura e scaricamento.", { x: 32, y: 520, size: 11, font });
  return createPdfPreviewUrl(new Blob([await pdf.save()], { type: "application/pdf" }));
}
const client = new QueryClient();
function App() {
  const [files, setFiles] = useState<string[]>([]);
  async function carica(documento: AttestatoDaCaricare) {
    const form = new FormData(); form.append("file", documento.file);
    const risposta = await fetch("/__qa-upload", { method: "POST", body: form });
    if (!risposta.ok) throw new Error("Connessione interrotta. Riprova.");
    setFiles(old => [...old, `${documento.file.name} · ${documento.file.type}`]);
  }
  return <QueryClientProvider client={client}>
    <main className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-xl font-bold">Verifica documenti mobile</h1>
      <section className="space-y-3"><h2 className="font-bold">Area operaio</h2><CaricaAttestato carica={carica} /><ul id="caricamenti">{files.map((f, i) => <li key={i}>{f}</li>)}</ul></section>
      <section className="space-y-3"><h2 className="font-bold">Gestionale · lettura documenti</h2><HrDocumentiSection profiloId="qa-persona" companyId="qa-azienda" /></section>
      <section className="h-[680px] space-y-3"><h2 className="font-bold">Anteprima PDF</h2><PdfBlobLivePreviewPanel renderBlobUrl={pdfDiProva} depsKey="documento-qa" downloadFileName="prova-mobile.pdf" showDownloadOnMobile allowOpenInNewTab /></section>
    </main><Toaster richColors />
  </QueryClientProvider>;
}
if (new URLSearchParams(location.search).has("native")) {
  const root = document.getElementById("root")!;
  root.textContent = "Apertura del PDF nel visualizzatore nativo…";
  void apriDocumentoDaRichiesta(pdfDiProva, "Prova documenti mobile.pdf")
    .then(() => { root.textContent = "Apertura del documento riuscita."; })
    .catch(error => { root.textContent = `Apertura non riuscita: ${String(error)}`; });
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
