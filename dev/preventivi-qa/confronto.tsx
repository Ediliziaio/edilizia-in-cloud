import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import { AnalisiInterventoEditor } from "../../src/components/serramenti/AnalisiInterventoEditor";
import { nuovaAnalisiIntervento, SCENARI_ESISTENTI, type AnalisiIntervento } from "../../src/lib/serramenti/analisiIntervento";
function Prova() {
  const [a, setA] = useState<AnalisiIntervento | null>({ ...nuovaAnalisiIntervento(), esistente: "alluminio_freddo" });
  const scenario = SCENARI_ESISTENTI[a?.esistente ?? "altro"];
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <header className="border-b pb-4"><p className="text-sm text-muted-foreground">Prova locale, senza salvataggio</p><h1 className="text-xl font-semibold">Il confronto, prima e dopo</h1></header>
    {a?.attiva && <section className="space-y-4"><h2 className="text-lg font-semibold">{scenario.titolo}</h2>
      <div className="grid grid-cols-2 gap-4"><figure className="min-w-0">{scenario.immagine && <img className="h-44 w-full object-contain sm:h-60" src={scenario.immagine} alt={scenario.nome} />}<figcaption className="text-sm">{scenario.nome}</figcaption><p className="text-xs text-muted-foreground">Illustrazione generata con AI</p></figure>
        <figure className="min-w-0"><img className="h-44 w-full object-contain sm:h-60" src="/render-references/profiles/Profilo-PVC-2ante-Maniglia-Centrale-Bianco.jpeg" alt="Finestra PVC dimostrativa" /><figcaption className="text-sm">PVC dimostrativo</figcaption></figure></div>
      <p className="text-sm leading-relaxed text-muted-foreground">{scenario.descrizione}</p>
    </section>}
    <AnalisiInterventoEditor value={a} onChange={setA} />
  </main>;
}
if (import.meta.env.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) createRoot(document.getElementById("root")!).render(<Prova />);
