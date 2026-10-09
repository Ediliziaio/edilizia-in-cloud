/**
 * Le estensioni del disegno dei serramenti: ante di larghezza diversa, traversi e inglesine,
 * scorrevoli con le ante che si sovrappongono, controlli sulle misure, persiane e catalogo degli assi.
 */
import { describe, expect, it } from "vitest";
import { disegnaSerramento, larghezzeAnte, type Forma, type SerramentoDisegno } from "@/lib/serramenti/disegnoSerramento";
import { disegnaPersiana, type PersianaDisegno } from "@/lib/serramenti/disegnoPersiana";
import { configDaFamiglia, disegnoDaConfig, disegnoDaFamiglia, haDisegno, misureTipiche } from "@/lib/serramenti/disegnoDaFamiglia";
import { finituraDaEtichetta } from "@/lib/serramenti/finituraSerramento";
import { vetroDaEtichette } from "@/lib/serramenti/vetroSerramento";
import { controllaMisure } from "@/lib/serramenti/limitiSerramento";
import {
  anteDaApertura,
  apertureDellaTipologia,
  ASSI_DISEGNO,
  CONFIGURAZIONI_PERSIANA,
  configurazionePersiana,
  formaDaCodice,
  maggiorazioniDaCompilare,
  persianaDaConfigurazione,
} from "@/lib/serramenti/assiDisegno";
import { TIPOLOGIE_DISEGNO } from "@/lib/serramenti/disegnoSerramento";

type Rett = Extract<Forma, { kind: "rect" }>;
const rett = (forme: Forma[], ruolo: string) => forme.filter((f) => f.kind === "rect" && f.ruolo === ruolo) as Rett[];

describe("ante di larghezza diversa", () => {
  it("senza misure le ante sono uguali", () => {
    expect(larghezzeAnte([{ tipo: "battente" }, { tipo: "battente" }], 1000)).toEqual([500, 500]);
  });

  it("l'anta con una misura la tiene e le altre si dividono il resto", () => {
    const l = larghezzeAnte([{ tipo: "battente", larghezzaMm: 400 }, { tipo: "battente" }, { tipo: "battente" }], 1200);
    expect(l[0]).toBeCloseTo(400);
    expect(l[1]).toBeCloseTo(400);
    expect(l[2]).toBeCloseTo(400);
    const m = larghezzeAnte([{ tipo: "battente", larghezzaMm: 300 }, { tipo: "fisso" }, { tipo: "battente", larghezzaMm: 300 }], 1200);
    expect(m.map(Math.round)).toEqual([300, 600, 300]);
  });

  it("se le misure non entrano si riducono in proporzione e la somma resta il totale", () => {
    const l = larghezzeAnte([{ tipo: "battente", larghezzaMm: 800 }, { tipo: "battente", larghezzaMm: 800 }], 1000);
    expect(l[0] + l[1]).toBeCloseTo(1000);
    expect(l[0]).toBeCloseTo(500);
  });

  it("il disegno ha le ante di misura diversa e le quote una per una sotto il totale", () => {
    const d: SerramentoDisegno = {
      larghezzaMm: 1200, altezzaMm: 1400, ante: [{ tipo: "battente", lato: "sx", larghezzaMm: 450 }, { tipo: "battente", lato: "dx" }],
    };
    const scena = disegnaSerramento(d);
    const [a, b] = rett(scena.forme, "vetro");
    expect(a.w).toBeLessThan(b.w);
    const sotto = scena.quote.filter((q) => q.lato === "sotto");
    expect(sotto).toHaveLength(3);
    expect(sotto.find((q) => q.testo === "1200")?.livello).toBe(1);
    expect(sotto.filter((q) => q.livello === 0).map((q) => q.testo).sort()).toEqual(["450", "658"]);
  });

  it("senza misure esplicite c'è una quota sola come prima", () => {
    const scena = disegnaSerramento({ larghezzaMm: 1200, altezzaMm: 1400, ante: [{ tipo: "battente" }, { tipo: "battente" }] });
    expect(scena.quote.filter((q) => q.lato === "sotto")).toHaveLength(1);
  });
});

describe("traversi e inglesine", () => {
  const base: SerramentoDisegno = { larghezzaMm: 1000, altezzaMm: 1400, ante: [{ tipo: "battente", lato: "dx" }] };

  it("il traverso si misura dal BASSO ed è una barra un po' più larga del profilo dell'anta", () => {
    const barre = (daBassoMm: number, extra: Partial<SerramentoDisegno> = {}) => rett(disegnaSerramento({ ...base, ...extra, traversi: [{ daBassoMm }] }).forme, "anta");
    const senza = rett(disegnaSerramento(base).forme, "anta").length;
    expect(barre(900).length).toBe(senza + 1);
    expect(barre(30).length).toBe(senza); // troppo in basso: fuori dal vetro
    const t = barre(900).at(-1) as Rett;
    expect(t.y + t.h / 2).toBeCloseTo(1400 - 900); // 900 dal basso = 500 dall'alto
    // più largo dello spessore standard dell'anta (41 mm)
    expect(t.h).toBeGreaterThan(41 * 1.2);
  });

  it("il traverso su una porta finestra sta all'altezza dal pavimento, con o senza cassonetto", () => {
    const porta: SerramentoDisegno = { larghezzaMm: 900, altezzaMm: 2200, ante: [{ tipo: "battente", lato: "dx" }], soglia: true, traversi: [{ daBassoMm: 1000 }] };
    const t = rett(disegnaSerramento(porta).forme, "anta").at(-1) as Rett;
    expect(t.y + t.h / 2).toBeCloseTo(1200);
    // con il cassonetto da 200: la finestra è alta 2000 e il traverso resta a 1000 dal basso
    const mono = disegnaSerramento({ ...porta, monoblocco: { cassonettoMm: 200 } });
    const tm = rett(mono.forme, "anta").at(-1) as Rett;
    expect(tm.y + tm.h / 2).toBeCloseTo(1200);
  });

  it("la quota del traverso è dal basso fino al suo centro", () => {
    const scena = disegnaSerramento({ ...base, traversi: [{ daBassoMm: 900 }] });
    const q = scena.quote.find((x) => x.lato === "sx");
    expect(q?.testo).toBe("900");
    expect(q?.da).toBeCloseTo(500);
    expect(q?.a).toBe(1400);
  });

  it("le inglesine dividono ogni vetro: colonne−1 barre verticali e righe−1 orizzontali", () => {
    const n = (c: number, r: number) => rett(disegnaSerramento({ ...base, inglesine: { colonne: c, righe: r } }).forme, "inglesina").length;
    expect(n(1, 1)).toBe(0);
    expect(n(2, 3)).toBe(1 + 2);
    expect(n(3, 1)).toBe(2);
  });

  it("con due ante le inglesine sono su entrambe", () => {
    const due: SerramentoDisegno = { ...base, larghezzaMm: 1400, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "battente", lato: "dx" }], inglesine: { colonne: 2, righe: 2 } };
    expect(rett(disegnaSerramento(due).forme, "inglesina")).toHaveLength(4);
  });
});

describe("scorrevoli", () => {
  const traslante = TIPOLOGIE_DISEGNO.find((t) => t.id === "traslante_4_ante")!;
  const d: SerramentoDisegno = { larghezzaMm: traslante.larghezzaMm, altezzaMm: traslante.altezzaMm, ante: traslante.ante, soglia: true };

  it("le ante si sovrappongono dove si incrociano e corrono su due binari", () => {
    const scena = disegnaSerramento(d);
    expect(rett(scena.forme, "binario")).toHaveLength(2);
    const vetri = rett(scena.forme, "vetro").sort((a, b) => a.x - b.x);
    expect(vetri).toHaveLength(4);
    // ante vicine: i profili si accavallano, quindi i vetri non si toccano ma restano ravvicinati
    for (let i = 1; i < vetri.length; i++) expect(vetri[i].x).toBeLessThan(vetri[i - 1].x + vetri[i - 1].w + 200);
  });

  it("frecce e maniglie solo sulle ante che scorrono", () => {
    const scena = disegnaSerramento(d);
    expect(scena.forme.filter((f) => f.kind === "poly" && f.ruolo === "simbolo")).toHaveLength(4); // 2 ante × (asta + punta)
    expect(rett(scena.forme, "maniglia")).toHaveLength(2);
  });

  it("dall'esterno niente maniglie e simboli tratteggiati", () => {
    const scena = disegnaSerramento({ ...d, vista: "esterna" });
    expect(rett(scena.forme, "maniglia")).toHaveLength(0);
  });
});

describe("controllaMisure", () => {
  const base: SerramentoDisegno = { larghezzaMm: 1200, altezzaMm: 1400, ante: [{ tipo: "battente" }, { tipo: "battente" }] };
  const codici = (d: SerramentoDisegno, limiti = {}) => controllaMisure(d, limiti).map((a) => a.codice);

  it("una misura normale è in regola", () => {
    expect(codici(base)).toEqual([]);
  });

  it("misure troppo piccole, cassonetto che mangia la finestra, traverso fuori", () => {
    expect(codici({ ...base, larghezzaMm: 250 })).toContain("misura_minima");
    expect(codici({ ...base, monoblocco: { cassonettoMm: 1200 } })).toContain("cassonetto_alto");
    expect(codici({ ...base, traversi: [{ daBassoMm: 40 }] })).toContain("traverso_fuori");
  });

  it("i limiti del produttore: larghezza, altezza, superficie dell'anta", () => {
    const limiti = { anta: { larghezzaMaxMm: 500, altezzaMaxMm: 1000, superficieMaxM2: 0.4 } };
    const c = codici(base, limiti);
    expect(c).toContain("anta_larga");
    expect(c).toContain("anta_alta");
    expect(c).toContain("anta_pesante");
    expect(codici({ ...base, ante: [{ tipo: "fisso" }, { tipo: "fisso" }] }, limiti)).toEqual([]); // i fissi non contano
  });

  it("la misura di un'anta con larghezza esplicita conta", () => {
    const c = controllaMisure({ ...base, ante: [{ tipo: "battente", larghezzaMm: 300 }, { tipo: "battente" }] }, { anta: { larghezzaMinMm: 400 } });
    expect(c.map((a) => a.testo).join(" ")).toContain("Anta 1");
  });

  it("cassonetto non offerto dal produttore, troppe ante", () => {
    expect(codici({ ...base, monoblocco: { cassonettoMm: 220 } }, { cassonettiMm: [200, 250] })).toContain("cassonetto_non_offerto");
    expect(codici({ ...base, ante: [{ tipo: "battente" }, { tipo: "battente" }, { tipo: "battente" }] }, { anteMax: 2 })).toContain("troppe_ante");
  });

  it("le sagome: arco troppo alto o ribassato, trapezio uguale, un solo campo", () => {
    expect(codici({ ...base, forma: "arco", frecciaMm: 900 })).toContain("freccia_alta");
    expect(codici({ ...base, forma: "arco", frecciaMm: 50 })).toContain("freccia_bassa");
    expect(codici({ ...base, forma: "trapezio", altezzaMinoreMm: 1400 })).toContain("trapezio_lati_uguali");
    expect(codici({ ...base, forma: "arco" })).toContain("sagoma_un_campo");
  });

  it("gli errori hanno gravità «errore», gli altri «avviso»", () => {
    const a = controllaMisure({ ...base, larghezzaMm: 250 });
    expect(a.find((x) => x.codice === "misura_minima")?.gravita).toBe("errore");
    expect(controllaMisure({ ...base, forma: "arco" }).find((x) => x.codice === "sagoma_un_campo")?.gravita).toBe("avviso");
  });
});

describe("persiane", () => {
  const base: PersianaDisegno = { larghezzaMm: 1200, altezzaMm: 1500, ante: 2, tipo: "veneziana", lamelle: "fisse" };
  const conta = (p: PersianaDisegno, ruolo: string) => disegnaPersiana(p).forme.filter((f) => f.ruolo === ruolo).length;

  it("la veneziana ha le lamelle in ogni anta; le orientabili hanno l'asta di comando, le fisse no", () => {
    expect(conta(base, "lamella")).toBeGreaterThan(40);
    expect(conta(base, "asta")).toBe(0);
    expect(conta({ ...base, lamelle: "orientabili" }, "asta")).toBe(2);
  });

  it("le lamelle orientabili aperte sono più sottili di quelle chiuse", () => {
    const alt = (pct: number) => (disegnaPersiana({ ...base, lamelle: "orientabili", aperturaLamellePct: pct }).forme.find((f) => f.kind === "rect" && f.ruolo === "lamella") as Rett).h;
    expect(alt(100)).toBeLessThan(alt(0));
  });

  it("scuro pieno e a cornice non hanno lamelle", () => {
    expect(conta({ ...base, tipo: "scuro_pieno" }, "lamella")).toBe(0);
    expect(conta({ ...base, tipo: "scuro_pieno" }, "pannello")).toBe(2);
    expect(conta({ ...base, tipo: "scuro_cornice" }, "pannelloRilievo")).toBe(2);
  });

  it("il numero di ante e le cerniere: 3 per anta sopra 1800 mm, 2 altrimenti", () => {
    expect(conta({ ...base, ante: 4 }, "cerniera")).toBe(8);
    expect(conta({ ...base, altezzaMm: 2200 }, "cerniera")).toBe(6);
  });

  it("le ante asimmetriche hanno larghezze diverse e le quote una per una", () => {
    const scena = disegnaPersiana({ ...base, proporzioni: [0.42, 0.58] });
    expect(scena.quote.filter((q) => q.lato === "sotto").map((q) => q.testo).sort()).toEqual(["1200", "474", "654"]);
    expect(scena.quote.filter((q) => q.lato === "sotto")).toHaveLength(3);
  });

  it("l'aletta esce dal vano: sporgenza e anello", () => {
    const senza = disegnaPersiana(base);
    const con = disegnaPersiana({ ...base, alettaMm: 40 });
    expect(senza.sporgenza).toBe(0);
    expect(con.sporgenza).toBe(40);
    expect(con.forme.some((f) => f.kind === "sagoma" && f.ruolo === "aletta")).toBe(true);
  });

  it("aperte a 90° le ante stanno di taglio fuori dal vano e si vede la finestra; a 45° sono di scorcio", () => {
    const novanta = disegnaPersiana({ ...base, stato: "aperta_90" });
    expect(novanta.sporgenza).toBeGreaterThan(0);
    expect(novanta.forme.some((f) => f.kind === "rect" && f.ruolo === "vetro")).toBe(true);
    expect(novanta.forme.some((f) => f.ruolo === "lamella")).toBe(false);
    const quarantacinque = disegnaPersiana({ ...base, stato: "aperta_45" });
    expect(quarantacinque.forme.filter((f) => f.kind === "sagoma" && f.ruolo === "anta")).toHaveLength(2);
  });

  it("una sola anta aperta: la prima di taglio, le altre chiuse", () => {
    const scena = disegnaPersiana({ ...base, ante: 3, stato: "anta_singola_aperta" });
    const lamelleChiuse = scena.forme.filter((f) => f.ruolo === "lamella").length;
    expect(lamelleChiuse).toBeGreaterThan(0);
    expect(scena.sporgenza).toBeGreaterThan(0);
  });

  it("le forme restano dentro il riquadro quando le ante sono chiuse (parete e davanzale stanno attorno)", () => {
    const scena = disegnaPersiana(base);
    for (const f of scena.forme.filter((x) => x.ruolo !== "parete" && x.ruolo !== "davanzale" && x.ruolo !== "cappello")) {
      const punti = f.kind === "rect" ? [[f.x, f.y], [f.x + f.w, f.y + f.h]] : f.punti;
      for (const [x, y] of punti) {
        expect(x).toBeGreaterThanOrEqual(-0.001);
        expect(x).toBeLessThanOrEqual(1200.001);
        expect(y).toBeGreaterThanOrEqual(-0.001);
        expect(y).toBeLessThanOrEqual(1500.001);
      }
    }
  });
});

describe("persiane: tipi nuovi, sagome e contesto", () => {
  const base: PersianaDisegno = { larghezzaMm: 1200, altezzaMm: 1500, ante: 2, tipo: "veneziana", lamelle: "fisse" };
  const conta = (p: PersianaDisegno, ruolo: string) => disegnaPersiana(p).forme.filter((f) => f.ruolo === ruolo).length;
  const sag = (p: PersianaDisegno, ruolo: string) => disegnaPersiana(p).forme.filter((f) => f.kind === "sagoma" && f.ruolo === ruolo);

  it("nello stile realistico c'è la parete attorno e il davanzale sotto; si possono togliere; nelle schede no", () => {
    const real: PersianaDisegno = { ...base, stile: "realistico" };
    const scena = disegnaPersiana(real);
    expect(conta(real, "parete")).toBe(1);
    expect(conta(real, "davanzale")).toBe(1);
    expect(scena.sfondo).toBeGreaterThan(100);
    expect(scena.sporgenza).toBe(0); // le quote non si allontanano per colpa della parete
    expect(conta({ ...real, contesto: false }, "parete")).toBe(0);
    expect(disegnaPersiana({ ...real, contesto: false }).sfondo).toBe(0);
    expect(conta(base, "parete")).toBe(0); // la scheda è su fondo bianco
    expect(conta({ ...base, contesto: true }, "parete")).toBe(1);
  });

  it("avvolgibile: cassonetto, due guide, stecche che scendono fin dove le abbassi", () => {
    const av = (pct?: number): PersianaDisegno => ({ ...base, tipo: "avvolgibile", abbassataPct: pct });
    expect(conta(av(), "cassonetto")).toBe(1);
    expect(conta(av(), "binario")).toBe(2);
    expect(conta(av(), "vetro")).toBe(1);
    const cb = (disegnaPersiana(av()).forme.find((f) => f.kind === "rect" && f.ruolo === "cassonetto") as Rett).h;
    const tap = (pct: number) => disegnaPersiana(av(pct)).forme.find((f) => f.kind === "rect" && f.ruolo === "tapparella") as Rett | undefined;
    expect(tap(0)).toBeUndefined();
    expect(tap(100)!.h).toBeCloseTo(1500 - cb);
    expect(tap(50)!.h).toBeCloseTo((1500 - cb) / 2);
    expect(conta(av(50), "sbarra")).toBe(1); // il profilo finale
    // le quote del cassonetto e della parte sotto
    expect(disegnaPersiana(av()).quote.filter((q) => q.lato === "sx")).toHaveLength(2);
  });

  it("a libro: le cerniere fra le ante della coppia e il pacchetto ripiegato a lato", () => {
    const libro = (stato: "chiusa" | "aperta_90", ante = 4): PersianaDisegno => ({ ...base, tipo: "a_libro", ante, stato });
    // 4 ante chiuse: 2 cerniere ai due estremi e 2 dove si incontrano le coppie (4 gruppi da 2)
    expect(conta(libro("chiusa"), "cerniera")).toBe(8);
    const aperta = disegnaPersiana(libro("aperta_90"));
    expect(aperta.forme.filter((f) => f.kind === "rect" && f.ruolo === "anta")).toHaveLength(4); // 2 pacchetti da 2 strisce
    expect(aperta.sporgenza).toBeGreaterThanOrEqual(92);
    expect(aperta.forme.some((f) => f.kind === "rect" && f.ruolo === "vetro")).toBe(true);
    // con 2 ante un pacchetto solo
    expect(disegnaPersiana(libro("aperta_90", 2)).forme.filter((f) => f.kind === "rect" && f.ruolo === "anta")).toHaveLength(2);
  });

  it("griglia di sicurezza: sbarre e traversi sopra la finestra", () => {
    // 1128 mm di vano: 10 intervalli = 9 sbarre verticali, più 2 traversi
    expect(conta({ ...base, tipo: "griglia" }, "sbarra")).toBe(9 + 2);
    expect(conta({ ...base, tipo: "griglia" }, "vetro")).toBe(1);
    expect(conta({ ...base, tipo: "griglia" }, "lamella")).toBe(0);
  });

  it("brise-soleil: lamelle larghe e fisse, la finestra dietro", () => {
    expect(conta({ ...base, tipo: "brise_soleil" }, "lamella")).toBe(11);
    expect(conta({ ...base, tipo: "brise_soleil" }, "vetro")).toBe(1);
    const lam = disegnaPersiana({ ...base, tipo: "brise_soleil" }).forme.find((f) => f.kind === "rect" && f.ruolo === "lamella") as Rett;
    const veneziana = disegnaPersiana(base).forme.find((f) => f.kind === "rect" && f.ruolo === "lamella") as Rett;
    expect(lam.h).toBeGreaterThan(60);
    expect(veneziana.h).toBeLessThan(lam.h);
  });

  it("persiana ad arco: telaio ad anello, due ante tagliate sulla curva, lamelle che seguono l'arco", () => {
    const arco: PersianaDisegno = { ...base, forma: "arco" };
    expect(sag(arco, "telaio")).toHaveLength(1);
    expect(sag(arco, "anta")).toHaveLength(2);
    expect(sag(arco, "lamella").length).toBeGreaterThan(30);
    expect(disegnaPersiana(arco).quote.find((q) => q.lato === "sx")?.testo).toBe("f 600");
    // le lamelle in alto sono più strette di quelle in basso
    const larghezze = sag(arco, "lamella").map((f) => {
      if (f.kind !== "sagoma") return 0;
      const xs = f.punti.map((p) => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    });
    expect(Math.min(...larghezze)).toBeLessThan(Math.max(...larghezze) * 0.6);
    for (const f of disegnaPersiana(arco).forme.filter((x) => x.ruolo !== "parete" && x.ruolo !== "davanzale" && x.ruolo !== "cappello")) {
      const punti = f.kind === "rect" ? [[f.x, f.y], [f.x + f.w, f.y + f.h]] : f.punti;
      for (const [x, y] of punti) {
        expect(x).toBeGreaterThanOrEqual(-0.5);
        expect(x).toBeLessThanOrEqual(1200.5);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeLessThanOrEqual(1500.5);
      }
    }
  });

  it("persiana a trapezio, scuri sagomati e orientabili sull'arco", () => {
    const trap: PersianaDisegno = { ...base, forma: "trapezio", altezzaMinoreMm: 900, latoMinore: "dx" };
    expect(sag(trap, "lamella").length).toBeGreaterThan(20);
    expect(disegnaPersiana(trap).quote.filter((q) => q.lato !== "sotto").map((q) => q.testo).sort()).toEqual(["1500", "900"]);
    expect(sag({ ...base, forma: "arco", tipo: "scuro_pieno" }, "pannello")).toHaveLength(2);
    expect(sag({ ...base, forma: "arco", tipo: "scuro_cornice" }, "pannelloRilievo")).toHaveLength(2);
    expect(conta({ ...base, forma: "arco", lamelle: "orientabili" }, "asta")).toBe(2);
  });

  it("le forme non si applicano a avvolgibile, a libro, griglia e brise-soleil", () => {
    const rett = (tipo: PersianaDisegno["tipo"]) => disegnaPersiana({ ...base, tipo, forma: "arco" }).forme.some((f) => f.kind === "sagoma" && f.ruolo === "telaio");
    expect(rett("avvolgibile")).toBe(false);
    expect(rett("griglia")).toBe(false);
    expect(rett("brise_soleil")).toBe(false);
    expect(rett("a_libro")).toBe(false);
  });

  it("le sagomate hanno al massimo due ante", () => {
    expect(sag({ ...base, forma: "arco", ante: 4 }, "anta")).toHaveLength(2);
    expect(sag({ ...base, forma: "arco", ante: 1 }, "anta")).toHaveLength(1);
  });
});

describe("persiane: stile scheda, configurazioni e sagome", () => {
  const base: PersianaDisegno = { larghezzaMm: 1200, altezzaMm: 1500, ante: 2, tipo: "veneziana", lamelle: "fisse" };
  const conta = (p: PersianaDisegno, ruolo: string) => disegnaPersiana(p).forme.filter((f) => f.ruolo === ruolo).length;
  const simboli = (p: PersianaDisegno) => disegnaPersiana(p).forme.filter((f) => f.kind === "poly" && f.ruolo === "simbolo");

  it("lo stile di serie è la scheda: fondo bianco, cappa in alto, campo chiaro per ogni anta, simboli rossi", () => {
    const scena = disegnaPersiana(base);
    expect(scena.stile).toBe("scheda");
    expect(conta(base, "cappello")).toBe(1);
    expect(conta(base, "campo")).toBe(2);
    expect(simboli(base)).toHaveLength(2); // un triangolo per anta
    expect(disegnaPersiana({ ...base, stile: "realistico" }).stile).toBeUndefined();
    expect(conta({ ...base, stile: "realistico" }, "cappello")).toBe(0);
  });

  it("i simboli: la punta del triangolo sta dal lato dove le ante si incontrano", () => {
    const [sx, dx] = simboli(base) as Array<Extract<Forma, { kind: "poly" }>>;
    expect(sx.punti[1][0]).toBeGreaterThan(sx.punti[0][0]); // anta di sinistra, cerniere a sinistra: punta a destra
    expect(dx.punti[1][0]).toBeLessThan(dx.punti[0][0]);
  });

  it("senza cappa su avvolgibile e ad angolo; la cappa copre il vano e un po' di più", () => {
    expect(conta({ ...base, tipo: "avvolgibile" }, "cappello")).toBe(0);
    expect(conta({ ...base, tipo: "angolo", ante: 2 }, "cappello")).toBe(0);
    const c = disegnaPersiana(base).forme.find((f) => f.ruolo === "cappello") as Rett;
    expect(c.x).toBeLessThan(0);
    expect(c.x + c.w).toBeGreaterThan(1200);
  });

  it("la fessura delle lamelle fisse: più è larga, più la lamella è sottile; chiuse = quasi piene", () => {
    const h = (fessura: 0 | 10 | 16) => (disegnaPersiana({ ...base, fessuraMm: fessura }).forme.find((f) => f.kind === "rect" && f.ruolo === "lamella") as Rett).h;
    expect(h(16)).toBeLessThan(h(10));
    expect(h(10)).toBeLessThan(h(0));
  });

  it("ogni configurazione di apertura del catalogo produce un disegno valido", () => {
    expect(CONFIGURAZIONI_PERSIANA.length).toBe(27);
    expect(new Set(CONFIGURAZIONI_PERSIANA.map((c) => c.codice)).size).toBe(CONFIGURAZIONI_PERSIANA.length);
    for (const c of CONFIGURAZIONI_PERSIANA) {
      const p: PersianaDisegno = { ...base, ...persianaDaConfigurazione(c.codice, 1500, 1500) };
      const scena = disegnaPersiana(p);
      expect(scena.forme.length, c.codice).toBeGreaterThan(5);
      for (const f of scena.forme.filter((x) => x.ruolo !== "cappello")) {
        const punti = f.kind === "rect" ? [[f.x, f.y], [f.x + f.w, f.y + f.h]] : f.punti;
        for (const [x, y] of punti) {
          expect(Number.isFinite(x) && Number.isFinite(y), c.codice).toBe(true);
          expect(x, c.codice).toBeGreaterThanOrEqual(-0.5);
          expect(x, c.codice).toBeLessThanOrEqual(1500.5);
          expect(y, c.codice).toBeGreaterThanOrEqual(-0.5);
          expect(y, c.codice).toBeLessThanOrEqual(1500.5);
        }
      }
    }
    expect(persianaDaConfigurazione("boh", 1000, 1000)).toEqual({});
    expect(configurazionePersiana("2_ante")?.gruppo).toBe("A battente");
  });

  it("a battente: le ante asimmetriche, 1+2, 2+1 e 2+2 hanno le cerniere dal lato giusto", () => {
    const p = (codice: string): PersianaDisegno => ({ ...base, ...persianaDaConfigurazione(codice, 1200, 1500) });
    const asimm = disegnaPersiana(p("2_ante_asimm_principale_dx")).quote.filter((q) => q.lato === "sotto" && q.livello === 0).map((q) => Number(q.testo)).sort((a, b) => a - b);
    expect(asimm[0]).toBeLessThan(asimm[1]);
    // 1+2 a destra: i triangoli delle ante 2 e 3 guardano a sinistra, quello della 1 a destra
    const punte = (codice: string) => (simboli(p(codice)) as Array<Extract<Forma, { kind: "poly" }>>).map((s) => (s.punti[1][0] > s.punti[0][0] ? "→" : "←"));
    expect(punte("3_ante_1_2_dx")).toEqual(["→", "←", "←"]);
    expect(punte("3_ante_2_1_sx")).toEqual(["→", "→", "←"]);
    expect(punte("4_ante_2_2")).toEqual(["→", "→", "←", "←"]);
    expect(punte("4_ante")).toEqual(["→", "←", "→", "←"]);
    expect(disegnaPersiana(p("1_anta_dx")).forme.filter((f) => f.kind === "poly" && f.ruolo === "simbolo")).toHaveLength(1);
  });

  it("a libro: simboli per anta; a pacchetto: strisce ripiegate e anta grande con la freccia", () => {
    const libro = persianaDaConfigurazione("libro_4_ante", 1500, 1500);
    expect(conta({ ...base, ...libro }, "campo")).toBe(4);
    const pacchetto: PersianaDisegno = { ...base, ...persianaDaConfigurazione("pacchetto_4_ante_dx", 1500, 1500) };
    const scena = disegnaPersiana(pacchetto);
    // 3 strisce ripiegate + 1 anta grande (4 rettangoli 'anta' stretti? le strisce sono rect, l'anta grande è una cornice a poligoni)
    expect(scena.forme.filter((f) => f.kind === "rect" && f.ruolo === "anta")).toHaveLength(3);
    expect(simboli(pacchetto)).toHaveLength(2); // asta e punta della freccia
    // dx: il pacchetto sta a sinistra, la freccia punta a destra
    const strisce = scena.forme.filter((f) => f.kind === "rect" && f.ruolo === "anta") as Rett[];
    expect(Math.max(...strisce.map((r) => r.x + r.w))).toBeLessThan(400);
    const asta = (simboli(pacchetto)[0] as Extract<Forma, { kind: "poly" }>).punti;
    expect(asta[1][0]).toBeGreaterThan(asta[0][0]);
    const sx = disegnaPersiana({ ...pacchetto, direzione: "sx" }).forme.filter((f) => f.kind === "rect" && f.ruolo === "anta") as Rett[];
    expect(Math.min(...sx.map((r) => r.x))).toBeGreaterThan(1000);
  });

  it("scorrevole: 1 anta con la freccia, 2 ante, 2 sovrapposte (si accavallano)", () => {
    const sc = (codice: string): PersianaDisegno => ({ ...base, ...persianaDaConfigurazione(codice, 1500, 1500) });
    expect(conta(sc("scorrevole_1_anta_dx"), "campo")).toBe(1);
    expect(conta(sc("scorrevole_2_ante"), "campo")).toBe(2);
    expect(conta(sc("scorrevole_2_ante"), "binario")).toBe(2);
    const campi = (p: PersianaDisegno) => disegnaPersiana(p).forme.filter((f) => f.kind === "rect" && f.ruolo === "campo") as Rett[];
    const [a, b] = campi(sc("scorrevole_2_ante"));
    const [c, e] = campi(sc("scorrevole_2_ante_sovrapposte"));
    expect(c.x + c.w - e.x).toBeGreaterThan(a.x + a.w - b.x); // le sovrapposte si accavallano di più
    expect(simboli(sc("scorrevole_1_anta_sx"))).toHaveLength(2);
  });

  it("ad angolo: ante in prospettiva (poligoni più bassi verso lo spigolo) e montante con vetro", () => {
    const ang = disegnaPersiana({ ...base, tipo: "angolo", ante: 2 });
    const antePoligoni = ang.forme.filter((f) => f.kind === "sagoma" && f.ruolo === "anta") as Array<Extract<Forma, { kind: "sagoma" }>>;
    expect(antePoligoni).toHaveLength(2);
    const alt = (f: Extract<Forma, { kind: "sagoma" }>) => Math.max(...f.punti.map((p) => p[1])) - Math.min(...f.punti.map((p) => p[1]));
    const [l, r] = antePoligoni;
    expect(alt(l)).toBeLessThanOrEqual(1500);
    expect(Math.min(...l.punti.map((p) => p[1]))).toBeLessThan(Math.max(...l.punti.map((p) => p[1])) - 1000);
    expect(l.punti.some((p) => p[1] > 0) && r.punti.some((p) => p[1] > 0)).toBe(true);
    expect(ang.forme.filter((f) => f.kind === "rect" && f.ruolo === "vetro")).toHaveLength(1);
    expect(disegnaPersiana({ ...base, tipo: "angolo", ante: 3 }).forme.filter((f) => f.kind === "sagoma" && f.ruolo === "anta")).toHaveLength(3);
  });

  it("con sopraluce e pannello fisso: il vetro sta sopra o a lato e le ante occupano il resto", () => {
    const so = disegnaPersiana({ ...base, sopraluceMm: 400 });
    const vetri = so.forme.filter((f) => f.kind === "rect" && f.ruolo === "vetro") as Rett[];
    expect(vetri).toHaveLength(1);
    const campo = (so.forme.find((f) => f.kind === "rect" && f.ruolo === "campo") as Rett);
    expect(campo.y).toBeGreaterThan(vetri[0].y + vetri[0].h);
    const lat = disegnaPersiana({ ...base, ante: 1, pannelloFisso: { lato: "dx", larghezzaMm: 400 } });
    const v = lat.forme.find((f) => f.kind === "rect" && f.ruolo === "vetro") as Rett;
    const c = lat.forme.find((f) => f.kind === "rect" && f.ruolo === "campo") as Rett;
    expect(v.x).toBeGreaterThan(c.x + c.w);
    const latSx = disegnaPersiana({ ...base, ante: 1, pannelloFisso: { lato: "sx", larghezzaMm: 400 } });
    const vs = latSx.forme.find((f) => f.kind === "rect" && f.ruolo === "vetro") as Rett;
    const cs = latSx.forme.find((f) => f.kind === "rect" && f.ruolo === "campo") as Rett;
    expect(vs.x + vs.w).toBeLessThan(cs.x);
  });

  it("tutte le sagome: lunetta, tonda, triangolo e ogiva danno telaio ad anello, ante tagliate e lamelle dentro il riquadro", () => {
    for (const forma of ["lunetta", "tonda", "triangolo", "ogiva", "arco", "trapezio"] as const) {
      const p: PersianaDisegno = { ...base, forma, altezzaMm: forma === "lunetta" ? 700 : 1500, altezzaMinoreMm: 900 };
      const scena = disegnaPersiana(p);
      const telaio = scena.forme.filter((f) => f.kind === "sagoma" && f.ruolo === "telaio");
      expect(telaio, forma).toHaveLength(1);
      expect(scena.forme.filter((f) => f.kind === "sagoma" && f.ruolo === "anta").length, forma).toBeGreaterThanOrEqual(1);
      expect(scena.forme.filter((f) => f.ruolo === "lamella").length, forma).toBeGreaterThan(5);
      const H = p.altezzaMm;
      for (const f of scena.forme.filter((x) => x.ruolo !== "cappello")) {
        const punti = f.kind === "rect" ? [[f.x, f.y], [f.x + f.w, f.y + f.h]] : f.punti;
        for (const [x, y] of punti) {
          expect(Number.isFinite(x) && Number.isFinite(y), forma).toBe(true);
          expect(x, forma).toBeGreaterThanOrEqual(-0.5);
          expect(x, forma).toBeLessThanOrEqual(1200.5);
          expect(y, forma).toBeGreaterThanOrEqual(-0.5);
          expect(y, forma).toBeLessThanOrEqual(H + 0.5);
        }
      }
    }
  });

  it("le sagome diverse dal rettangolo sono tonde o a punta: il triangolo ha un vertice in cima, la tonda tocca i quattro lati", () => {
    const tri = disegnaPersiana({ ...base, forma: "triangolo", ante: 1 }).forme.find((f) => f.kind === "sagoma" && f.ruolo === "telaio") as Extract<Forma, { kind: "sagoma" }>;
    const cimaTri = tri.punti.filter((p) => p[1] < 5);
    expect(cimaTri).toHaveLength(1);
    expect(cimaTri[0][0]).toBeCloseTo(600, 0);
    const tonda = disegnaPersiana({ ...base, forma: "tonda", ante: 1 }).forme.find((f) => f.kind === "sagoma" && f.ruolo === "telaio") as Extract<Forma, { kind: "sagoma" }>;
    expect(Math.min(...tonda.punti.map((p) => p[0]))).toBeCloseTo(0, 0);
    expect(Math.max(...tonda.punti.map((p) => p[0]))).toBeCloseTo(1200, 0);
    expect(Math.min(...tonda.punti.map((p) => p[1]))).toBeCloseTo(0, 0);
    expect(Math.max(...tonda.punti.map((p) => p[1]))).toBeCloseTo(1500, 0);
  });

  it("sui serramenti le sagome nuove si disegnano come fissi, senza maniglia", () => {
    for (const forma of ["lunetta", "tonda", "triangolo", "ogiva"] as const) {
      const scena = disegnaSerramento({ larghezzaMm: 1000, altezzaMm: forma === "lunetta" ? 500 : 1400, ante: [{ tipo: "anta_ribalta", lato: "dx" }], forma });
      expect(scena.forme.some((f) => f.ruolo === "maniglia"), forma).toBe(false);
      expect(scena.forme.some((f) => f.ruolo === "simbolo"), forma).toBe(false);
      expect(scena.forme.some((f) => f.kind === "sagoma" && f.ruolo === "vetro"), forma).toBe(true);
    }
    expect(controllaMisure({ larghezzaMm: 1000, altezzaMm: 1400, ante: [{ tipo: "battente" }], forma: "tonda" }).map((a) => a.codice)).toContain("sagoma_fissa");
  });
});

describe("assi del disegno", () => {
  it("le aperture di una tipologia diventano le ante giuste", () => {
    expect(apertureDellaTipologia("finestra_1_anta").map((a) => a.codice)).toEqual(["battente_dx", "battente_sx", "anta_ribalta_dx", "anta_ribalta_sx"]);
    expect(anteDaApertura("finestra_1_anta", "anta_ribalta_sx")).toEqual([{ tipo: "anta_ribalta", lato: "sx" }]);
    expect(anteDaApertura("finestra_2_ante", "ribalta_su_anta_dx")).toEqual([{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }]);
    expect(anteDaApertura("finestra_3_ante", "ribalta_laterali")?.map((a) => a.tipo)).toEqual(["anta_ribalta", "battente", "anta_ribalta"]);
  });

  it("gli scorrevoli hanno solo il verso, e i fissi restano fissi", () => {
    const dx = anteDaApertura("traslante_4_ante", "scorre_dx")!;
    const sx = anteDaApertura("traslante_4_ante", "scorre_sx")!;
    expect(dx.filter((a) => a.tipo === "scorrevole").map((a) => a.lato)).toEqual(["sx", "dx"]);
    expect(sx.filter((a) => a.tipo === "scorrevole").map((a) => a.lato)).toEqual(["sx", "dx"]);
    expect(dx.map((a) => a.tipo)).toEqual(sx.map((a) => a.tipo));
  });

  it("codici sconosciuti danno null, e il disegno non si rompe", () => {
    expect(anteDaApertura("finestra_1_anta", "boh")).toBeNull();
    expect(anteDaApertura("non_esiste", "battente_dx")).toBeNull();
    expect(anteDaApertura("finestra_1_anta", null)).toBeNull();
  });

  it("ogni apertura del listino ha almeno una maniglia (se c'è un'anta apribile) e mai più di una per anta", () => {
    for (const t of TIPOLOGIE_DISEGNO) {
      for (const ap of apertureDellaTipologia(t.id)) {
        const scena = disegnaSerramento({ larghezzaMm: t.larghezzaMm, altezzaMm: t.altezzaMm, ante: ap.ante, soglia: t.soglia });
        const apribili = ap.ante.filter((a) => a.tipo !== "fisso" && a.tipo !== "vasistas").length;
        const n = rett(scena.forme, "maniglia").length;
        expect(n, `${t.id}/${ap.codice}`).toBeGreaterThanOrEqual(apribili > 0 ? 1 : 0);
        expect(n, `${t.id}/${ap.codice}`).toBeLessThanOrEqual(apribili);
      }
    }
  });

  it("le aperture a 2 ante a battente hanno una maniglia sola, dalla parte dell'anta principale", () => {
    const man = (tip: string, cod: string) => {
      const ante = anteDaApertura(tip, cod)!;
      return rett(disegnaSerramento({ larghezzaMm: 1200, altezzaMm: 1400, ante }).forme, "maniglia");
    };
    const dx = man("finestra_2_ante", "battente_principale_dx");
    const sx = man("finestra_2_ante", "battente_principale_sx");
    expect(dx).toHaveLength(1);
    expect(sx).toHaveLength(1);
    expect(dx[0].x).toBeGreaterThan(sx[0].x);
    expect(man("finestra_2_ante", "ribalta_su_anta_dx")).toHaveLength(1);
    expect(man("finestra_2_ante", "ribalta_su_entrambe")).toHaveLength(2);
    expect(man("finestra_3_ante", "ribalta_tutte")).toHaveLength(3);
    expect(man("portoncino_2_ante", "principale_sx")).toHaveLength(1);
  });

  it("il catalogo degli assi: tutti a zero e da compilare finché l'azienda non decide i prezzi", () => {
    expect(ASSI_DISEGNO.length).toBeGreaterThanOrEqual(8);
    for (const a of ASSI_DISEGNO) for (const v of a.valori) expect(v.maggiorazione).toMatchObject({ tipo: "none", valore: 0, daCompilare: true });
    expect(maggiorazioniDaCompilare()).toBeGreaterThan(20);
    expect(ASSI_DISEGNO.find((a) => a.codice === "forma")?.valori.map((v) => v.codice)).toEqual([
      "rettangolare", "arco", "trapezio", "lunetta", "tonda", "triangolo", "ogiva",
    ]);
    expect(formaDaCodice("arco")).toBe("arco");
    expect(formaDaCodice("boh")).toBe("rettangolare");
    expect(formaDaCodice(null)).toBe("rettangolare");
  });
});

describe("persiane: apertura e vista da dentro", () => {
  const base: PersianaDisegno = { larghezzaMm: 1000, altezzaMm: 1400, ante: 1, tipo: "veneziana", lamelle: "fisse" };
  const maniglie = (d: PersianaDisegno) => disegnaPersiana(d).forme.filter((f) => f.ruolo === "maniglia");
  const centroX = (f: Forma) => (f.kind === "rect" ? f.x + f.w / 2 : NaN);
  const simboliTratteggiati = (d: PersianaDisegno) => disegnaPersiana(d).forme.filter((f) => f.ruolo === "simbolo" && f.kind === "poly" && f.tratteggio);

  it("da fuori non c'è la maniglia e i simboli sono continui", () => {
    expect(maniglie({ ...base, apertura: "dx" })).toHaveLength(0);
    expect(simboliTratteggiati({ ...base, apertura: "dx" })).toHaveLength(0);
  });
  it("da dentro la persiana si spinge: simboli tratteggiati, una maniglia", () => {
    const d: PersianaDisegno = { ...base, apertura: "dx", vista: "interna" };
    expect(maniglie(d)).toHaveLength(1);
    expect(simboliTratteggiati(d).length).toBeGreaterThan(0);
  });
  it("un'anta: apertura a destra = cerniere a destra, maniglia a sinistra (da dentro)", () => {
    expect(centroX(maniglie({ ...base, apertura: "dx", vista: "interna" })[0])).toBeLessThan(500);
    expect(centroX(maniglie({ ...base, apertura: "sx", vista: "interna" })[0])).toBeGreaterThan(500);
  });
  it("due ante: una sola maniglia, sull'anta del lato scelto", () => {
    const due: PersianaDisegno = { ...base, ante: 2, vista: "interna" };
    const dx = maniglie({ ...due, apertura: "dx" });
    const sx = maniglie({ ...due, apertura: "sx" });
    expect(dx).toHaveLength(1);
    expect(sx).toHaveLength(1);
    expect(centroX(dx[0])).toBeGreaterThan(centroX(sx[0]));
  });
});

describe("disegno congelato nella riga", () => {
  const val = (id: string, label: string) => ({ id, label, is_default: false, attivo: true });
  const famiglia = (colore: string, apertura: string) =>
    ({
      id: "f",
      disegno_tipologia: "finestra_2_ante",
      axes: [
        { codice: "colore", values: [val("c", colore)] },
        { codice: "apertura", values: [val("a", apertura)] },
        { codice: "telaio", values: [val("t", "Telaio a Z 35")] },
        { codice: "tipologia_vetro", values: [val("v", "Satinato")] },
      ],
    }) as unknown as Parameters<typeof configDaFamiglia>[0];
  const scelte = { colore: "c", apertura: "a", telaio: "t", tipologia_vetro: "v" };

  it("salva tipologia e scelte come etichette", () => {
    const c = configDaFamiglia(famiglia("RAL 7016", "Apertura a sinistra"), scelte);
    expect(c).toEqual({ v: 1, tipologia: "finestra_2_ante", apertura: "sx", ante: [{ tipo: "anta_ribalta", lato: "sx", maniglia: true }, { tipo: "battente", lato: "dx" }], colore: "RAL 7016", telaio: "Telaio a Z 35", tipologiaVetro: "Satinato" });
  });
  it("dalla configurazione il disegno è lo stesso di quello dal listino", () => {
    const f = famiglia("RAL 7016", "Apertura a sinistra");
    const c = configDaFamiglia(f, scelte)!;
    expect(JSON.stringify(disegnoDaConfig(c, 1200, 1400))).toBe(JSON.stringify(disegnoDaFamiglia(f, scelte, 1200, 1400)));
  });
  it("se il listino cambia, la configurazione congelata dà ancora il disegno di prima", () => {
    const c = configDaFamiglia(famiglia("RAL 7016", "Apertura a sinistra"), scelte)!;
    const congelato = JSON.stringify(disegnoDaConfig(c, 1200, 1400));
    const oggi = JSON.stringify(disegnoDaFamiglia(famiglia("Rovere", "Apertura a destra"), scelte, 1200, 1400));
    expect(oggi).not.toBe(congelato);
    expect(JSON.stringify(disegnoDaConfig(JSON.parse(JSON.stringify(c)), 1200, 1400))).toBe(congelato);
  });
  it("senza disegno nell'articolo non c'è configurazione", () => {
    expect(configDaFamiglia({ id: "f", disegno_tipologia: null, axes: [] } as unknown as Parameters<typeof configDaFamiglia>[0], {})).toBeNull();
  });
});

describe("tipi di vetro", () => {
  it("riconosce i tipi del listino", () => {
    const t = (e: string) => vetroDaEtichette(e).tipo;
    expect(t("Vetro Satinato")).toBe("satinato");
    expect(t("Vetro Fumé")).toBe("fume");
    expect(t("Vetro Bronzo")).toBe("bronzo");
    expect(t("Vetro Opaco (bianco latte)")).toBe("opaco");
    expect(t("Vetro Selettivo (controllo solare)")).toBe("riflettente");
    expect(t("Vetro Riflettente")).toBe("riflettente");
    expect(t("Vetro Cattedrale (decorativo)")).toBe("serigrafato");
    expect(t("Vetro Mastercarré (decorativo)")).toBe("serigrafato");
    expect(t("Vetro Stratificato di sicurezza")).toBe("antisfondamento");
    expect(t("Vetro Antisonoro")).toBe("acustico");
    expect(t("Vetro Standard")).toBe("standard");
    expect(t("Vetro Autopulente")).toBe("standard");
  });
  it("conta le lastre dalla composizione", () => {
    expect(vetroDaEtichette("Vetro Standard", "Triplo vetro basso emissivo").lastre).toBe(3);
    expect(vetroDaEtichette("Vetro Standard", "Doppio vetro basso emissivo").lastre).toBe(2);
  });
});

describe("colori del listino nel disegno", () => {
  it("riconosce i colori Salamander con nome tedesco e descrizione", () => {
    const hex = (e: string) => {
      const f = finituraDaEtichetta(e);
      return f ? (f.tipo === "tinta" ? f.hex : `${f.chiaro}/${f.scuro}`) : null;
    };
    for (const e of [
      "71 - Schwarzbraun (marrone scuro)", "97 - mattGrey_cleanCOOL (grigio opaco)", "95 - mattBronze_cleanCOOL (bronzo opaco)",
      "77 - mattAnthracite_cleanCOOL (antracite opaco)", "79 - mattWhite_cleanCOOL (bianco opaco)", "91 - mattGMalt_COOLWood",
      "30 - mattWalnut_COOLWood (noce opaco)", "51 - Golden Oak (rovere dorato)", "21 - Nussbaum (noce)", "55 - Anthrazitgrau (grigio antracite)",
      "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)", "18 - Jet black matt - Premium (nero intenso opaco)", "74 - Basaltgrau (grigio basalto)",
      "69 - Metbrush Alu - Premium (alluminio spazzolato)", "39 - Weiß Antik (bianco antico)",
    ]) expect(hex(e), e).not.toBeNull();
    expect(hex("71 - Schwarzbraun (marrone scuro)")).not.toBe(hex("79 - mattWhite_cleanCOOL (bianco opaco)"));
    expect(hex("74 - Basaltgrau (grigio basalto)")).not.toBe(hex("73 - Lichtgrau (grigio luce)"));
  });
});

describe("sagome: misure extra nella configurazione", () => {
  const scena = (c: Parameters<typeof disegnoDaConfig>[0], l: number, h: number) => {
    const d = disegnoDaConfig(c, l, h);
    if (!d || d.tipo !== "serramento") throw new Error("serramento atteso");
    return disegnaSerramento(d.viste[0].disegno);
  };
  const testi = (c: Parameters<typeof disegnoDaConfig>[0], l: number, h: number) => scena(c, l, h).quote.map((q) => q.testo);

  it("l'altezza dell'arco scritta nella riga è la freccia del disegno", () => {
    expect(testi({ v: 1, tipologia: "finestra_arco", frecciaMm: 300 }, 1000, 1800)).toContain("f 300");
    expect(testi({ v: 1, tipologia: "finestra_arco" }, 1000, 1800)).toContain("f 500");
  });
  it("il trapezio prende le altezze scritte e il lato", () => {
    const t = testi({ v: 1, tipologia: "finestra_trapezio", altezzaMinoreMm: 600, latoMinore: "sx" }, 1200, 1400);
    expect(t).toContain("600");
    expect(t).toContain("1400");
  });
  it("il lato basso di serie non regge una finestra più bassa: si usa il 70% dell'altezza", () => {
    expect(testi({ v: 1, tipologia: "finestra_trapezio" }, 1200, 700)).toContain("490");
  });
  it("lunetta, tonda, triangolo e ogiva si disegnano da larghezza e altezza", () => {
    for (const tipologia of ["finestra_lunetta", "finestra_tonda", "finestra_triangolo", "finestra_ogiva"]) {
      const forme = scena({ v: 1, tipologia }, 1000, 1000).forme;
      expect(forme.length, tipologia).toBeGreaterThan(2);
    }
  });
});

describe("aperture del catalogo nel disegno", () => {
  const val = (id: string, valore: string, label: string) => ({ id, valore, label, is_default: false, attivo: true });
  const famiglia = (tipologia: string, codice: string, nome: string) =>
    ({ id: "f", disegno_tipologia: tipologia, axes: [{ codice: "apertura", values: [val("a", codice, nome)] }] }) as unknown as Parameters<typeof configDaFamiglia>[0];
  const ante = (tipologia: string, codice: string, nome: string) => {
    const d = disegnoDaFamiglia(famiglia(tipologia, codice, nome), { apertura: "a" }, 1800, 1400);
    if (!d || d.tipo !== "serramento") throw new Error("serramento atteso");
    return d.viste[0].disegno.ante;
  };

  it("3 ante: ogni apertura del catalogo dà le sue ante", () => {
    expect(ante("finestra_3_ante", "battente_tutte", "Tutte a battente").map((a) => a.tipo)).toEqual(["battente", "battente", "battente"]);
    expect(ante("finestra_3_ante", "ribalta_centrale", "Centrale anta-ribalta, laterali battente").map((a) => a.tipo)).toEqual(["battente", "anta_ribalta", "battente"]);
    expect(ante("finestra_3_ante", "ribalta_tutte", "Tutte anta-ribalta").map((a) => a.tipo)).toEqual(["anta_ribalta", "anta_ribalta", "anta_ribalta"]);
  });
  it("2 ante: la ribalta sull'anta di sinistra", () => {
    const a = ante("finestra_2_ante", "ribalta_su_anta_sx", "Anta-ribalta sull'anta SX (DX battente)");
    expect(a.map((x) => x.tipo)).toEqual(["anta_ribalta", "battente"]);
  });
  it("scorrevole: il verso sposta le ante scorrevoli", () => {
    const dx = ante("traslante_4_ante", "scorre_dx", "Scorre verso DX").filter((a) => a.tipo === "scorrevole").map((a) => a.lato);
    const sx = ante("traslante_4_ante", "scorre_sx", "Scorre verso SX").filter((a) => a.tipo === "scorrevole").map((a) => a.lato);
    expect(new Set(dx)).toEqual(new Set(["sx", "dx"]));
    expect(new Set(sx)).toEqual(new Set(["sx", "dx"]));
  });
  it("si riconosce anche dal solo nome (righe lette dalle etichette)", () => {
    const f = { id: "f", disegno_tipologia: "finestra_1_anta", axes: [{ codice: "apertura", values: [{ id: "a", label: "Battente SX", is_default: false, attivo: true }] }] } as unknown as Parameters<typeof configDaFamiglia>[0];
    expect(configDaFamiglia(f, { apertura: "a" })?.aperturaCodice).toBe("battente_sx");
  });
  it("le due voci vecchie «Apertura a destra/sinistra» specchiano ancora", () => {
    const f = { id: "f", disegno_tipologia: "finestra_1_anta", axes: [{ codice: "apertura", values: [{ id: "a", valore: "apertura_sx", label: "Apertura a sinistra", is_default: false, attivo: false }] }] } as unknown as Parameters<typeof configDaFamiglia>[0];
    const c = configDaFamiglia(f, { apertura: "a" });
    expect(c?.apertura).toBe("sx");
    expect(c?.aperturaCodice).toBeUndefined();
  });
});

describe("tipologie scorrevoli nuove e disegno personalizzato", () => {
  const scena = (c: Parameters<typeof disegnoDaConfig>[0], l = 2400, h = 2200) => {
    const d = disegnoDaConfig(c, l, h);
    if (!d || d.tipo !== "serramento") throw new Error("serramento atteso");
    return disegnaSerramento(d.viste[0].disegno);
  };
  const ruoli = (c: Parameters<typeof disegnoDaConfig>[0]) => scena(c).forme.map((f) => f.ruolo);

  it("ogni tipologia nuova si disegna", () => {
    for (const id of ["alzante_scomparsa", "traslante_fisso_telaio", "traslante_fisso_anta", "traslante_su_parete", "slide", "slide_plus", "smart_slide", "portoncino_1_anta", "alzante_fa_as_as_fa"]) {
      expect(scena({ v: 1, tipologia: id }).forme.length, id).toBeGreaterThan(8);
    }
  });
  it("a scomparsa e su parete c'è il muro accanto al vano e l'anta tratteggiata", () => {
    for (const id of ["alzante_scomparsa", "traslante_su_parete"]) {
      const forme = scena({ v: 1, tipologia: id }).forme;
      expect(forme.some((f) => f.ruolo === "parete"), id).toBe(true);
      expect(forme.some((f) => f.kind === "poly" && f.ruolo === "simbolo" && f.tratteggio), id).toBe(true);
    }
    expect(ruoli({ v: 1, tipologia: "slide" })).not.toContain("parete");
  });
  it("su parete c'è anche il binario davanti al muro", () => {
    const bin = (id: string) => scena({ v: 1, tipologia: id }).forme.filter((f) => f.ruolo === "binario").length;
    expect(bin("traslante_su_parete")).toBeGreaterThan(bin("alzante_scomparsa"));
  });
  it("il muro sta dalla parte in cui scorre", () => {
    const x = (apertura: string) => {
      const f = { id: "f", disegno_tipologia: "alzante_scomparsa", axes: [{ codice: "apertura", values: [{ id: "a", valore: apertura, label: apertura === "scorre_dx" ? "Scorre verso DX" : "Scorre verso SX", is_default: false, attivo: true }] }] } as unknown as Parameters<typeof configDaFamiglia>[0];
      const c = configDaFamiglia(f, { apertura: "a" })!;
      return (scena(c).forme.find((s) => s.ruolo === "parete") as { x: number }).x;
    };
    expect(x("scorre_dx")).toBeGreaterThan(0);
    expect(x("scorre_sx")).toBeLessThan(0);
  });
  it("fisso nel telaio: niente profilo d'anta sul fisso", () => {
    const anta = (id: string) => scena({ v: 1, tipologia: id }).forme.filter((f) => f.ruolo === "anta").length;
    expect(anta("traslante_fisso_telaio")).toBeLessThan(anta("traslante_fisso_anta"));
  });
  it("in linea: le ante non si accavallano", () => {
    const xs = (id: string) => scena({ v: 1, tipologia: id }).forme.filter((f) => f.ruolo === "vetro").map((f) => (f as { x: number; w: number }).x + (f as { w: number }).w);
    // senza accavallamento il vetro di un'anta finisce prima dell'inizio dell'anta dopo
    expect(Math.max(...xs("smart_slide"))).toBeLessThanOrEqual(Math.max(...xs("slide")) + 1);
  });
  it("il disegno personalizzato porta le sue ante, si congela e si disegna", () => {
    const definizione = { larghezzaMm: 3000, altezzaMm: 2200, soglia: true, ante: [{ tipo: "scorrevole" as const, lato: "dx" as const }, { tipo: "fisso" as const, nelTelaio: true }] };
    const f = { id: "f", disegno_tipologia: "personalizzata", disegno_definizione: definizione, axes: [] } as unknown as Parameters<typeof configDaFamiglia>[0];
    expect(haDisegno(f)).toBe(true);
    expect(misureTipiche(f)).toEqual({ larghezzaMm: 3000, altezzaMm: 2200 });
    const c = configDaFamiglia(f, {})!;
    expect(c.definizione).toEqual(definizione);
    // dopo, anche se l'articolo cambia, la configurazione congelata dà lo stesso disegno
    expect(JSON.stringify(disegnoDaConfig(JSON.parse(JSON.stringify(c)), 3000, 2200))).toBe(JSON.stringify(disegnoDaFamiglia(f, {}, 3000, 2200)));
  });
  it("senza ante la personalizzata non ha disegno", () => {
    expect(haDisegno({ disegno_tipologia: "personalizzata", disegno_definizione: { ante: [] } })).toBe(false);
    expect(haDisegno({ disegno_tipologia: "personalizzata", disegno_definizione: null })).toBe(false);
  });
});

describe("sopraluce, sottoluce, a libro, scorri-ribalta e scuri", () => {
  const scena = (c: Parameters<typeof disegnoDaConfig>[0], l: number, h: number) => {
    const d = disegnoDaConfig(c, l, h);
    if (!d || d.tipo !== "serramento") throw new Error("serramento atteso");
    return disegnaSerramento(d.viste[0].disegno);
  };
  const vetri = (c: Parameters<typeof disegnoDaConfig>[0], l: number, h: number) => scena(c, l, h).forme.filter((f) => f.ruolo === "vetro");
  const testi = (c: Parameters<typeof disegnoDaConfig>[0], l: number, h: number) => scena(c, l, h).quote.map((q) => q.testo);

  it("ogni tipologia nuova si disegna", () => {
    for (const id of ["finestra_1_anta_sopraluce", "finestra_2_ante_sopraluce", "finestra_2_ante_sopraluce_2_sezioni", "finestra_3_ante_sopraluce", "porta_finestra_2_ante_sopraluce", "finestra_1_anta_sottoluce", "finestra_2_ante_sottoluce", "porta_finestra_libro_3_ante", "porta_finestra_libro_4_ante", "scorri_ribalta_patio", "finestra_scorrevole_2_ante"]) {
      expect(scena({ v: 1, tipologia: id }, 1500, 2000).forme.length, id).toBeGreaterThan(8);
    }
  });
  it("il sopraluce aggiunge un vetro in alto e la sua quota; a due sezioni i vetri sono uno in più", () => {
    const base = vetri({ v: 1, tipologia: "finestra_2_ante" }, 1200, 1800).length;
    const con = vetri({ v: 1, tipologia: "finestra_2_ante_sopraluce" }, 1200, 1800).length;
    const due = vetri({ v: 1, tipologia: "finestra_2_ante_sopraluce_2_sezioni" }, 1200, 1800).length;
    expect(con).toBeGreaterThan(base);
    expect(due).toBe(con + 1);
    expect(testi({ v: 1, tipologia: "finestra_2_ante_sopraluce" }, 1200, 1800)).toContain("450"); // un quarto di 1800
  });
  it("l'altezza scritta nella riga vince su quella di partenza", () => {
    expect(testi({ v: 1, tipologia: "finestra_2_ante_sopraluce", sopraluceMm: 600 }, 1200, 1800)).toContain("600");
    expect(testi({ v: 1, tipologia: "finestra_2_ante_sottoluce", sottoluceMm: 500 }, 1200, 1800)).toContain("500");
  });
  it("il sottoluce sta in basso: un vetro in più sotto le ante", () => {
    const base = vetri({ v: 1, tipologia: "finestra_2_ante" }, 1200, 1800).length;
    const con = vetri({ v: 1, tipologia: "finestra_2_ante_sottoluce" }, 1200, 1800);
    expect(con.length).toBeGreaterThan(base);
    const piuBasso = con.reduce((m, f) => Math.max(m, (f as { y: number }).y), 0);
    expect(piuBasso).toBeGreaterThan(1800 * 0.6);
  });
  it("a libro: ante con i simboli di apertura, alternate", () => {
    const simboli = scena({ v: 1, tipologia: "porta_finestra_libro_3_ante" }, 3000, 2200).forme.filter((f) => f.ruolo === "simbolo");
    expect(simboli.length).toBeGreaterThanOrEqual(3);
  });
  it("scorri-ribalta: lo scorrevole ha anche il simbolo della ribalta", () => {
    const n = (id: string) => scena({ v: 1, tipologia: id }, 2400, 2200).forme.filter((f) => f.ruolo === "simbolo").length;
    expect(n("scorri_ribalta_patio")).toBeGreaterThan(n("slide"));
  });
  it("le persiane possono essere scuri o gelosie", () => {
    const ruoliDi = (variante: string) => {
      const d = disegnoDaConfig({ v: 1, tipologia: `persiana:2_ante${variante ? ":" + variante : ""}` }, 1200, 1400);
      if (!d || d.tipo !== "persiana") throw new Error("persiana attesa");
      return new Set(d.viste[0].scena.forme.map((f) => f.ruolo));
    };
    expect(ruoliDi("").has("lamella")).toBe(true);
    expect(ruoliDi("scuro").has("pannello")).toBe(true);
    expect(ruoliDi("scuro").has("lamella")).toBe(false);
    expect(ruoliDi("scuro_cornice").has("pannelloRilievo")).toBe(true);
  });
  it("una tipologia personalizzata con sopraluce e sottoluce", () => {
    const definizione = { larghezzaMm: 1200, altezzaMm: 2000, ante: [{ tipo: "battente" as const, lato: "dx" as const }], sopraluce: { altezzaMm: 400 }, sottoluce: { altezzaMm: 300 } };
    const f = { id: "f", disegno_tipologia: "personalizzata", disegno_definizione: definizione, axes: [] } as unknown as Parameters<typeof configDaFamiglia>[0];
    const t = testi(configDaFamiglia(f, {})!, 1200, 2000);
    expect(t).toContain("400");
    expect(t).toContain("300");
  });
});

describe("riga congelata senza disegno (preventivi già consegnati)", () => {
  it("la configurazione «nessuno» non produce disegno, anche se l'articolo ha un tipo", () => {
    expect(disegnoDaConfig({ v: 1, tipologia: "finestra_2_ante", nessuno: true }, 1200, 1400)).toBeNull();
    expect(disegnoDaConfig({ v: 1, tipologia: "finestra_2_ante" }, 1200, 1400)).not.toBeNull();
  });
});

describe("monoblocco come scelta di ogni tipologia", () => {
  const forme = (tip: string, monoblocco: boolean) => {
    const d = disegnoDaConfig({ v: 1, tipologia: tip, monoblocco }, 1200, 1500);
    const scena = d && d.tipo !== "persiana" ? disegnaSerramento((d.viste[0] as { disegno: SerramentoDisegno }).disegno) : null;
    return scena?.forme ?? [];
  };
  it("«Con monoblocco» mette il cassonetto sopra a finestre, porte finestra e scorrevoli", () => {
    for (const tip of ["finestra_2_ante", "porta_finestra_1_anta", "finestra_2_ante_sopraluce", "traslante_4_ante"]) {
      expect(rett(forme(tip, true), "cassonetto"), tip).toHaveLength(1);
      expect(rett(forme(tip, false), "cassonetto"), tip).toHaveLength(0);
    }
  });
  it("non si mette sulle sagome né sul fisso", () => {
    for (const tip of ["finestra_arco", "finestra_tonda", "fisso"]) {
      expect(rett(forme(tip, true), "cassonetto"), tip).toHaveLength(0);
    }
  });
});
