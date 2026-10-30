import { eicSiAdatta, eicWhatsapp } from "@/lib/marketing/eicPuntiFermi";

/** WhatsApp e «si adatta all'azienda»: la stessa coppia di blocchi in ogni pagina di confronto. */
export default function EicPuntiFermi({ className = "" }: { className?: string }) {
  return <section aria-labelledby="eic-punti-fermi" className={`grid md:grid-cols-2 gap-5 ${className}`}>
    <h2 id="eic-punti-fermi" className="sr-only">Due cose che Edilizia in Cloud fa in modo diverso</h2>
    {[eicWhatsapp, eicSiAdatta].map((p) => <article key={p.heading} className="rounded-2xl border border-orange-200 bg-orange-50/60 p-6">
      <h3 className="text-xl font-bold text-[#111111]">{p.heading}</h3>
      {p.body.split("\n\n").map((par) => <p key={par.slice(0, 24)} className="mt-3 text-[15px] leading-relaxed text-gray-700">{par}</p>)}
    </article>)}
  </section>;
}
