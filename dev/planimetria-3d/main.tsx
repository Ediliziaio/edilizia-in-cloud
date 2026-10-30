import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import bilocale from "../../shared/planimetrie/esempi/bilocale.json";
import trilocale from "../../shared/planimetrie/esempi/trilocale.json";
import type { Planimetria } from "../../shared/planimetrie/modello.ts";
import { Vista3DPigra, type Fotogramma } from "../../src/components/planimetrie/Vista3DPigra";
import { BILOCALE_DA_RISTRUTTURARE, pianteDaPlanimetria } from "../../src/lib/planimetrie/tred";
import "../../src/index.css";

const ESEMPI: Record<string, { nome: string; pianta: Planimetria }> = {
  ristrutturare: { nome: "Bilocale da ristrutturare", pianta: BILOCALE_DA_RISTRUTTURARE },
  bilocale: { nome: "Bilocale (esempio comune)", pianta: bilocale as Planimetria },
  trilocale: { nome: "Trilocale con proposta A", pianta: trilocale as Planimetria },
};

function Prova() {
  const [scelta, setScelta] = useState(() => new URLSearchParams(location.search).get("esempio") ?? "ristrutturare");
  const esempio = ESEMPI[scelta] ?? ESEMPI.ristrutturare;
  const piante = useMemo(() => pianteDaPlanimetria(esempio.pianta), [esempio]);
  const [foto, setFoto] = useState<{ url: string; f: Fotogramma } | null>(null);
  return (
    <main className="mx-auto min-h-screen max-w-[1200px] space-y-4 bg-background px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Planimetria 3D — prova</h1>
        <select className="rounded border px-2 py-1 text-sm" value={scelta} onChange={(e) => setScelta(e.target.value)} aria-label="Esempio">
          {Object.entries(ESEMPI).map(([k, v]) => (
            <option key={k} value={k}>{v.nome}</option>
          ))}
        </select>
      </div>
      <Vista3DPigra
        key={scelta}
        piante={piante}
        nomeFile={scelta}
        onFotogramma={(f) => setFoto((v) => (v && URL.revokeObjectURL(v.url), { url: URL.createObjectURL(f.png), f }))}
      />
      {foto && (
        <section className="grid gap-4 md:grid-cols-2" data-testid="fotogramma">
          <img src={foto.url} alt="Fotogramma per il render" className="w-full rounded border" />
          <pre className="max-h-[420px] overflow-auto rounded border bg-muted p-3 text-xs">{JSON.stringify(foto.f.metadati, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}

if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<Prova />);
