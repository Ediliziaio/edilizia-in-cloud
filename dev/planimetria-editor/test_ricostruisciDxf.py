import unittest
from math import hypot

import ezdxf
from shapely import LineString, Point, box

from anteprimaDxf import quote_di_controllo
from ricostruisciDxf import (
    Asse, LocaleLetto, abbina_aperture, accorpa_assi_sovrapposti, allinea_pareti, candidato_finestra,
    combina_vani_comunicanti, completa_ingressi_aperti, contorni_facce, contorni_senza_etichette, finestre_tra_stipiti, includi_battuta_portone,
    layer_del_piano, leggi_piano, leggi_quote, portoni_garage, raccordi_muratura, registra_tavola, riconosci_locali, riscontri_chiusure, riscontri_sovrapposizioni,
    scale_da_riscontrare, vani_senza_segno, varchi_tra_stipiti, leggi_testi, leggi_sigle_infissi, misure_da_sigle, unita_dei_locali, altezza_del_piano,
    leggi_legenda_unita, stanze_dai_nomi, completa_unita_con_legenda,
)


class RiconoscimentoTavolaTest(unittest.TestCase):
    def test_doppia_anta_speculare_fra_due_stipiti(self):
        doc = ezdxf.new()
        doc.blocks.new("door-leaf").add_arc((0, 0), 81, -90, 0)
        spazio = doc.modelspace()
        spazio.add_blockref("door-leaf", (105, 10))
        spazio.add_blockref("door-leaf", (267, 10), dxfattribs={"xscale": -1})
        muri = [Asse(0, 20, 0, 100, 40), Asse(0, 20, 272, 420, 40)]
        (_, a, b, tipo, ponte), = abbina_aperture(spazio, muri, box(-10, -150, 430, 130), 1)
        self.assertEqual((a, b, tipo, ponte), (100, 272, "porta_doppia", True))

    def test_recupera_il_rientro_documentato_senza_chiudere_un_passaggio(self):
        muri = [Asse(90, -10, -120, 0, 20), Asse(90, -10, 120, 220, 20)]
        esterna = [(20, -120), (20, 40), (34, 40), (34, 80), (20, 80), (20, 220)]
        tratti = [((0, -120), (0, 220)), *zip(esterna, esterna[1:])]
        fasce = sorted(raccordi_muratura(muri, tratti), key=lambda m: m.inizio)
        self.assertEqual([(f.inizio, f.fine, f.spessore) for f in fasce], [(0, 40, 20), (40, 80, 34), (80, 120, 20)])
        self.assertEqual(raccordi_muratura(muri, [t for t in tratti if t != ((34, 40), (34, 80))]), [])

    def test_riconosce_l_ingresso_aperto_sul_soggiorno_solo_con_il_perimetro_disegnato(self):
        sagoma = [(0, 0), (600, 0), (600, 400), (0, 400), (0, 0)]
        tratti = list(zip(sagoma, sagoma[1:]))
        ingresso = (Point(450, 190), "FOYER", "ingresso")
        soggiorno = LocaleLetto(box(0, 0, 300, 400), [(Point(150, 190), "Living", "soggiorno")], 12)
        (locale,) = completa_ingressi_aperti([soggiorno], [], tratti, [], [ingresso], [], [])
        self.assertTrue(locale.contorno.covers(ingresso[0]))
        self.assertAlmostEqual(locale.contorno.area / 10000, 12, delta=0.01)
        self.assertEqual(completa_ingressi_aperti([soggiorno], [], tratti[:3], [], [ingresso], [], []), [])

    def test_layer_vettoriali_nel_sistema_del_ritaglio(self):
        doc = ezdxf.new()
        for nome in ("Muri", "Archi", "Spento"):
            doc.layers.new(nome)
        doc.layers.get("Spento").off()
        disegno = doc.modelspace()
        disegno.add_line((100, 200), (200, 200), dxfattribs={"layer": "Muri"})
        disegno.add_line((100, 220), (200, 220), dxfattribs={"layer": "Spento"})
        disegno.add_circle((150, 230), 10, dxfattribs={"layer": "Archi"})
        disegno.add_line((900, 900), (910, 900), dxfattribs={"layer": "0"})
        tavola = registra_tavola(doc)
        uguale = layer_del_piano(tavola, (100, 190, 250, 260), .1, (10, 19), 10_000)
        self.assertEqual(uguale["riquadro"], {"x": 0, "y": 0, "larghezza": 15, "altezza": 7})
        self.assertEqual([l["nome"] for l in uguale["layer"]], ["Archi", "Muri"])
        self.assertEqual(uguale["layer"][1]["linee"], "M0 1l10 0")
        self.assertIn("c", uguale["layer"][0]["linee"])
        self.assertIsNone(layer_del_piano(tavola, (100, 190, 250, 260), .1, (10, 19), 2))

    def test_propone_una_chiusura_una_sola_volta_anche_con_i_due_versi(self):
        dopo = LocaleLetto(box(0, 0, 400, 400), [], 16)
        prima = LocaleLetto(dopo.contorno.union(box(400, 80, 420, 160)), [], 16)
        a, b = (400, 108), (400, 109)
        (corretto, riscontro), = riscontri_chiusure([prima], [dopo], [LineString((a, b)), LineString((b, a))])
        self.assertIs(corretto, dopo)
        self.assertIs(riscontro.locale, prima)
        self.assertEqual(len(riscontro.tratti), 1)
        self.assertEqual(riscontro.dopo.area, 160000)

    def test_un_incrocio_puntuale_e_due_fili_distinti_non_sono_sovrapposizioni(self):
        tratti = [((0, 0), (200, 0)), ((40, 0), (150, 0)), ((70, -50), (70, 60)), ((0, 1), (200, 1))]
        (riscontro,) = riscontri_sovrapposizioni(tratti)
        self.assertEqual(riscontro.tipo, "sovrapposizione")
        self.assertEqual(riscontro.tratti[0].length, 110)
        self.assertIsNone(riscontro.locale)

    def test_chiude_un_piccolo_disallineamento_sul_filo_interno_del_muro(self):
        tratti = [
            ((0.16, 0.37), (210.16, 0.37)), ((211.16, 0.37), (211.16, 60.37)),
            ((211.16, 60.37), (400.16, 60.37)), ((400.16, 60.37), (400.16, 360.37)),
            ((400.16, 360.37), (0.16, 360.37)), ((0.16, 360.37), (0.16, 0.37)),
        ]
        (interno,) = contorni_facce(tratti, [])
        self.assertAlmostEqual(interno.area, 400 * 300 + 211 * 60, places=2)

    def test_il_garage_arriva_alla_battuta_dei_portoni_ma_non_al_telaio_della_finestra(self):
        garage = LocaleLetto(box(0, 0, 640, 950), [(Point(320, 450), "GARAGE", "garage")], 72.4)
        varchi = [
            (Asse(90, -668.6, 25, 305), [-677.5, -640]),
            (Asse(90, -668.6, 370, 880), [-677.5, -640]),
            (Asse(0, -9, 100, 400), [-37.5, 0]),
            (Asse(0, -13, 100, 400), [-37.5, 0]),
        ]
        candidati = list(portoni_garage(varchi, [garage]))
        self.assertEqual(len(candidati), 2)
        for locale, asse, stipiti, fronte in candidati:
            includi_battuta_portone(locale, asse, stipiti, fronte, [garage])
        self.assertAlmostEqual(garage.contorno.area / 10000, 60.8 + (280 + 510) * 28.6 / 10000)
        self.assertFalse(garage.contorno.covers(Point(660, 330)))
        self.assertFalse(garage.contorno.covers(Point(200, -5)))

    def test_rispetta_due_superfici_distinte_sulle_due_facce_della_soglia(self):
        tratti = []
        for interno in (box(0, 0, 300, 200), box(0, 212.5, 140, 292.5)):
            vertici = list(interno.exterior.coords)
            tratti.extend(zip(vertici, vertici[1:]))
        aree = [(Point(80, 80), 6), (Point(70, 250), 1.12)]
        letti = riconosci_locali([], tratti, [], [], aree, [])
        self.assertEqual(len(letti), 2)
        self.assertEqual({(l.superficie, l.contorno.area / 10000) for l in letti}, {(6, 6), (1.12, 1.12)})

    def test_la_doccia_chiusa_fa_parte_del_bagno_quando_ha_un_solo_accesso_e_una_sola_quota(self):
        poligoni = [box(0, 0, 141, 212.19), box(15, -112.5, 135, -12.5), box(50, -12.5, 121, 0)]
        porta = (Asse(0, -6.25, 45, 125, 12.5), 55, 116, "porta")
        aree = [(Point(60, 30), 4.28)]
        (bagno,) = combina_vani_comunicanti(poligoni, [porta], [], aree)
        self.assertAlmostEqual(bagno.contorno.area / 10000, (141 * 212.19 + 120 * 100 + 71 * 12.5) / 10000)
        self.assertEqual(list(combina_vani_comunicanti(poligoni, [porta], [], aree + [(Point(55, -40), 1.2)])), [])
        self.assertEqual(list(combina_vani_comunicanti(poligoni, [], [], aree)), [])

    def test_quote_di_controllo_distinguono_misura_geometrica_e_testo_della_tavola(self):
        documento = ezdxf.new()
        md = documento.modelspace()
        md.add_linear_dim(base=(0, -1), p1=(0, 0), p2=(18.18, 0.2), angle=0, text="18.18").render()
        md.add_linear_dim(base=(-1, 0), p1=(0, 0), p2=(0, 14.09), angle=90, text="14090 mm").render()
        md.add_linear_dim(base=(0, -2), p1=(0, 0), p2=(21, 0), angle=0, text=" ").render()
        a, b = quote_di_controllo(documento)
        self.assertEqual([(q["testo"], q["angolo"]) for q in (a, b)], [("18.18", 0), ("14090 mm", 90)])
        self.assertAlmostEqual(a["lunghezza"], 18.18)
        self.assertAlmostEqual(b["lunghezza"], 14.09)

    def test_sovrapposizione_del_ponte_conserva_posizione_e_misura_delle_aperture(self):
        muro = Asse(0, 0, 100, 415, 20)
        finestra = Asse(0, 0, 300, 470, 20)
        porta = Asse(0, 0, 150, 255, 20)
        muro_piu_spesso = Asse(0, 0, 460, 725, 25)
        muro_parallelo = Asse(0, 1, 100, 470, 20)
        muri = [muro, finestra, porta, muro_piu_spesso, muro_parallelo]
        aperture = [(finestra, 310, 445, "finestra"), (porta, 155, 245, "porta")]
        accorpa_assi_sovrapposti(muri, aperture)
        self.assertEqual(muri, [Asse(0, 0, 100, 470, 20), muro_piu_spesso, muro_parallelo])
        self.assertEqual(aperture, [(muro, 310, 445, "finestra"), (muro, 155, 245, "porta")])

    def test_allineamento_con_pareti_coincidenti_e_ritagli_diversi(self):
        def muri(dx, dy):
            return [Asse(0, y + dy, dx, 820 + dx, 20) for y in (-120, 227, 540)] + [
                Asse(90, -x - dx, -120 + dy, 540 + dy, 20) for x in (0, 318, 820)
            ]
        prima = muri(0, 0)
        self.assertEqual(allinea_pareti(prima, muri(1175, -443)), (1175, -443))
        self.assertIsNone(allinea_pareti(prima, muri(1175, -443) + muri(2910, -443)))

    def test_contorno_senza_etichetta_richiede_muratura_chiusa_e_porta(self):
        basso = Asse(0, 0, 0, 400, 20)
        muri = [basso, Asse(0, 340, 0, 400, 20), Asse(90, 0, 0, 340, 20), Asse(90, -400, 0, 340, 20)]
        leggi = lambda tipo: contorni_senza_etichette(muri, [(basso, 100, 190, tipo)])
        self.assertEqual(leggi("finestra"), [])
        (locale,) = leggi("porta")
        self.assertEqual(locale.contorno.area, 380 * 320)
        self.assertEqual(contorni_senza_etichette(muri[:-1], [(basso, 100, 190, "porta")]), [])

    def test_riunisce_le_rampe_affiancate_senza_indovinare_il_verso(self):
        alzate = [((0, y), (115, y)) for y in range(0, 208, 26)]
        seconda = [((128, y), (243, y)) for y in range(0, 208, 26)]
        linee = [(a, b, "Stair") for a, b in alzate + seconda]
        self.assertEqual(len(scale_da_riscontrare(linee, [])), 1)
        self.assertEqual(scale_da_riscontrare(linee, [alzate, seconda]), [])
        self.assertEqual(scale_da_riscontrare([(a, b, "Balcony") for a, b in alzate], []), [])

    def test_layer_muro_numerato_e_assi_non_strutturali(self):
        md = ezdxf.new().modelspace()
        for y in (0, 240, 480):
            for f in (y, y + 20):
                md.add_line((0, f), (360, f), dxfattribs={"layer": "Muro1"})
        for y in (630, 650):
            md.add_line((0, y), (360, y), dxfattribs={"layer": "Eje Muro"})
        modello = leggi_piano(md, {"rettangolo": [-30, -20, 390, 700]}, 1, "")
        self.assertEqual(len(modello.muri), 3)

    def test_quota_ruotata_usa_la_proiezione_e_conserva_il_testo(self):
        md = ezdxf.new().modelspace()
        md.add_linear_dim(
            base=(0, -35), p1=(0, 10), p2=(180, 15), angle=0, text="1,80",
        ).render()
        quote = leggi_quote(md, box(-50, -80, 240, 100), 1)
        self.assertEqual(len(quote), 1)
        a, b, scostamento, testo = quote[0]
        self.assertEqual((a, b), ((0, 10), (180, 10)))
        self.assertAlmostEqual(scostamento, -45)
        self.assertEqual(testo, "1,80")

    def test_porta_esplosa_con_anta_e_arco(self):
        md = ezdxf.new().modelspace()
        md.add_arc((120, 0), 90, 0, 90, dxfattribs={"layer": "Porte"})
        muro = Asse(0, 0, 0, 340, 16)
        zona = box(-100, -100, 500, 300)
        self.assertEqual(abbina_aperture(md, [muro], zona, 1), [])
        md.add_line((120, 0), (120, 90), dxfattribs={"layer": "Porte"})
        risultati = abbina_aperture(md, [muro], zona, 1)
        self.assertEqual(len(risultati), 1)
        self.assertEqual(risultati[0][1:4], (120, 210, "porta"))

    def test_blocco_finestra_ruotato(self):
        doc = ezdxf.new()
        blocco = doc.blocks.new("FINESTRA")
        blocco.add_lwpolyline([(0, 0), (120, 0), (120, 12), (0, 12)], close=True)
        inserto = doc.modelspace().add_blockref(blocco.name, (10, 30), dxfattribs={"rotation": 30})
        (a, b), = candidato_finestra(inserto, 1)
        self.assertAlmostEqual(hypot(b[0] - a[0], b[1] - a[1]), 120)

    def test_porta_esplosa_tra_due_stipiti_corti_disallineati_dal_cardine(self):
        md = ezdxf.new().modelspace()
        md.add_arc((115.5, 0), 85.5, 0, 90, dxfattribs={"layer": "Porte"})
        md.add_line((115.5, 0), (115.5, 85.5), dxfattribs={"layer": "Porte"})
        zona = box(-20, -20, 340, 140)
        muri = [Asse(90, -109, -140, -6, 12)]
        primo = ((111, -6), (111, 6))
        secondo = ((201, -6), (201, 6))
        self.assertEqual(abbina_aperture(md, [], zona, 1, [primo]), [])
        (muro, da, a, tipo, ponte), = abbina_aperture(md, muri, zona, 1, [primo, secondo, primo])
        self.assertEqual((da, a, tipo, ponte), (111, 201, "porta", True))
        self.assertEqual(muro.angolo, 0)
        self.assertEqual((muro.spessore, muro.centro), (12, 0))
        alternativa = [((109.5, 0), (121.5, 0)), ((109.5, 85.5), (121.5, 85.5))]
        self.assertEqual(abbina_aperture(md, [], zona, 1, [primo, secondo, *alternativa]), [])

    def test_finestra_tra_stipiti_richiede_due_tracce(self):
        stipiti = [((0, 0), (0, 24)), ((120, 0), (120, 24))]
        telaio = [((0, 6), (120, 6), "Vetri"), ((0, 18), (120, 18), "Vetri")]
        singola = list(varchi_tra_stipiti(telaio[:1], stipiti, minimo=45))
        self.assertEqual(list(finestre_tra_stipiti(singola)), [])
        doppia = list(varchi_tra_stipiti(telaio, stipiti, minimo=45))
        finestre = list(finestre_tra_stipiti(doppia))
        self.assertEqual(len(finestre), 1)
        self.assertAlmostEqual(finestre[0][0].fine - finestre[0][0].inizio, 120)

    def test_finestra_esplosa_su_layer_esplicito_e_su_muro_interrotto(self):
        md = ezdxf.new().modelspace()
        zona = box(-50, -35, 480, 100)
        muri = [Asse(0, 0, 0, 120, 20), Asse(0, 0, 240, 440, 20)]
        md.add_line((120, -1), (240, -1), dxfattribs={"layer": "VENTANAS"})
        self.assertEqual(abbina_aperture(md, muri, zona, 1), [])
        md.add_line((120, 1), (240, 1), dxfattribs={"layer": "VENTANAS"})
        risultati = abbina_aperture(md, muri, zona, 1)
        self.assertEqual(len(risultati), 1)
        self.assertEqual(risultati[0][1:], (120, 240, "finestra", True))


class TavoleSenzaAnteTest(unittest.TestCase):
    """Callimaco (Urban Vision, 24/11/2026): porte disegnate come muro interrotto, «27.40 mq.»."""

    @staticmethod
    def muro_interrotto(spalla_a, spalla_b, pieno=False):
        # Muro orizzontale spesso 12 fra y=0 e y=12, interrotto fra x=spalla_a e x=spalla_b.
        tratti = [((0, 0), (spalla_a, 0)), ((0, 12), (spalla_a, 12)), ((spalla_a, 0), (spalla_a, 12)),
                  ((spalla_b, 0), (spalla_b, 12)), ((spalla_b, 0), (400, 0)), ((spalla_b, 12), (400, 12))]
        if pieno:
            tratti += [((spalla_a, 0), (spalla_b, 0)), ((spalla_a, 12), (spalla_b, 12))]
        return tratti

    def test_porta_senza_anta_fra_due_spalle(self):
        (asse, facce), = vani_senza_segno(self.muro_interrotto(150, 240))
        self.assertEqual((asse.angolo, asse.inizio, asse.fine), (0, 150, 240))
        self.assertEqual(facce, (0, 12))

    def test_non_e_una_porta_il_muro_pieno_fra_due_finestre(self):
        self.assertEqual(list(vani_senza_segno(self.muro_interrotto(150, 240, pieno=True))), [])

    def test_non_e_una_porta_il_vano_attraversato_da_un_infisso(self):
        telaio = [((150, 6), (240, 6))]
        self.assertEqual(list(vani_senza_segno(self.muro_interrotto(150, 240), infissi=telaio)), [])

    def test_troppo_stretto_o_troppo_largo_per_una_porta(self):
        self.assertEqual(list(vani_senza_segno(self.muro_interrotto(150, 190))), [])
        self.assertEqual(list(vani_senza_segno(self.muro_interrotto(150, 300))), [])

    def test_legge_mq_col_punto_e_i_nomi_abbreviati(self):
        doc = ezdxf.new()
        spazio = doc.modelspace()
        for testo, x in [("sogg/pranzo", 10), ("27.40 mq.", 20), ("letto", 30), ("dis", 40), ("rip.", 50), ("cantina", 60)]:
            spazio.add_mtext(testo, dxfattribs={"insert": (x, 10)})
        nomi, aree = leggi_testi(spazio, box(0, 0, 100, 100), 1)
        self.assertEqual([d for _, _, d in nomi], ["soggiorno", "camera", "disimpegno", "ripostiglio", "cantina"])
        self.assertEqual([m for _, m in aree], [27.4])


class SigleInfissiTest(unittest.TestCase):
    def test_legge_le_sigle_e_le_abbina_al_vano_piu_vicino_di_larghezza_compatibile(self):
        doc = ezdxf.new()
        spazio = doc.modelspace()
        spazio.add_mtext("L 170\\PHf 140\\PHs 94", dxfattribs={"insert": (100, 60)})
        spazio.add_mtext("L 99\\PHp 210", dxfattribs={"insert": (400, 60)})
        spazio.add_mtext("soggiorno", dxfattribs={"insert": (250, 200)})
        sigle = leggi_sigle_infissi(spazio, box(0, 0, 600, 300), 1)
        self.assertEqual([(s["larghezza"], s["hf"], s["hp"], s["hs"]) for s in sigle], [(170, 140, None, 94), (99, None, 210, None)])
        vani = [(Point(400, 0), 100), (Point(100, 0), 168), (Point(250, 0), 60)]
        esito = misure_da_sigle(vani, sigle)
        self.assertEqual(esito[0]["hp"], 210)
        self.assertEqual(esito[1]["hs"], 94)
        self.assertNotIn(2, esito)


class UnitaDaSigleTest(unittest.TestCase):
    def test_stanze_di_una_unita_insieme_il_muro_spesso_separa_la_sigla_va_al_gruppo_vicino(self):
        stanza = lambda x0, x1, nome: LocaleLetto(box(x0, 0, x1, 400), [(Point((x0 + x1) / 2, 200), nome, "altro")])
        # Soggiorno e camera divisi da un tramezzo da 10 cm; muro da 30 cm verso l'altra unità.
        locali = [stanza(0, 400, "soggiorno"), stanza(410, 700, "letto"), stanza(730, 1100, "soggiorno")]
        muri = [Asse(90, -405, 0, 400, 10), Asse(90, -715, 0, 400, 30)]
        sigle = [(Point(200, -50), "Int. 01"), (Point(900, -50), "Int. 02")]
        esito = unita_dei_locali(locali, muri, [], sigle)
        self.assertEqual(esito, {0: "Int. 01", 1: "Int. 01", 2: "Int. 02"})

    def test_i_vani_comuni_non_entrano_in_nessuna_unita(self):
        locali = [LocaleLetto(box(0, 0, 300, 300), [(Point(150, 150), "atrio condominiale", "ingresso")])]
        self.assertEqual(unita_dei_locali(locali, [], [], [(Point(150, 150), "Int. 01")]), {})


class AltezzaDelPianoTest(unittest.TestCase):
    def test_dall_interpiano_meno_il_solaio_altrimenti_quella_chiesta(self):
        quote = [-300, 0, 349, 698]
        self.assertEqual(altezza_del_piano(0, quote, 300), 319)
        self.assertEqual(altezza_del_piano(698, quote, 300), 319)
        self.assertEqual(altezza_del_piano(-300, quote, 300), 270)
        self.assertEqual(altezza_del_piano(0, [0], 280), 280)
        self.assertEqual(altezza_del_piano(0, [0, 1000], 280), 280)


class LegendaEStanzeDaiNomiTest(unittest.TestCase):
    def test_legge_la_legenda_degli_alloggi_come_dati(self):
        doc = ezdxf.new()
        spazio = doc.modelspace()
        spazio.add_text("INT. 04  - SUL MQ. 55.20 - BILOCALE (S.U.44.00)  +balcone+ terrazzo coperto")
        spazio.add_text("INT. 03  - SUL MQ. 85,45 - TRILOCALE (S.U. 64,70) +giardino")
        spazio.add_text("int. 04")
        legenda = leggi_legenda_unita(list(spazio))
        self.assertEqual(legenda, [
            {"nome": "Int. 03", "sulMq": 85.45, "suMq": 64.7, "tipo": "Trilocale", "pertinenze": ["giardino"]},
            {"nome": "Int. 04", "sulMq": 55.2, "suMq": 44.0, "tipo": "Bilocale", "pertinenze": ["balcone", "terrazzo coperto"]},
        ])

    def test_la_riga_di_legenda_non_e_il_nome_di_una_stanza(self):
        doc = ezdxf.new()
        spazio = doc.modelspace()
        spazio.add_text("INT. 07 - SUL MQ. 60.00 - BILOCALE (S.U.44.40) + terrazzo", dxfattribs={"insert": (5, 5)})
        spazio.add_text("terrazzo", dxfattribs={"insert": (6, 6)})
        nomi, _ = leggi_testi(list(spazio), box(0, 0, 1000, 1000), 1)
        self.assertEqual([n for _, n, _ in nomi], ["terrazzo"])

    def test_chiude_la_stanza_dal_nome_e_dalla_superficie_scritti(self):
        # Ripostiglio 300 × 200 con la porta senza segno sul lato basso: la sagoma la chiude.
        muri = [Asse(0, 0, -5, 120, 10), Asse(0, 0, 200, 305, 10), Asse(0, 200, -5, 305, 10),
                Asse(90, 0, 0, 200, 10), Asse(90, -300, 0, 200, 10)]
        nomi = [(Point(150, 100), "rip.", "ripostiglio")]
        aree = [(Point(150, 80), 5.7)]
        (stanza,) = stanze_dai_nomi(muri, [], [], nomi, aree, box(-500, -500, 800, 700))
        self.assertAlmostEqual(stanza.contorno.area / 10_000, 5.7, delta=0.3)
        self.assertEqual(stanza.superficie, 5.7)
        # Se la superficie scritta non torna, la stanza non si inventa.
        self.assertEqual(stanze_dai_nomi(muri, [], [], nomi, [(Point(150, 80), 12.0)], box(-500, -500, 800, 700)), [])

    def test_la_legenda_rifiuta_la_stanza_all_unita_gia_piena(self):
        a = LocaleLetto(box(0, 0, 500, 400), [(Point(1, 1), "sogg", "soggiorno")])   # 20 m², int. 06
        b = LocaleLetto(box(510, 0, 810, 400), [(Point(600, 1), "letto", "camera")])  # 12 m², senza unità
        c = LocaleLetto(box(820, 0, 1320, 400), [(Point(900, 1), "sogg", "soggiorno")])  # 20 m², int. 04
        legenda = [{"nome": "Int. 06", "suMq": 20.5}, {"nome": "Int. 04", "suMq": 32.0}]
        esito = completa_unita_con_legenda([a, b, c], {0: "Int. 06", 2: "Int. 04"}, legenda)
        self.assertEqual(esito[1], "Int. 04")


class AllineamentoDeiPianiTest(unittest.TestCase):
    def test_ritrova_lo_spostamento_fra_due_piante_della_stessa_sagoma(self):
        from ricostruisciDxf import spostamento_per_correlazione
        def sagoma(x0, y0):
            return [Asse(0, y0, x0, x0 + 1200, 30), Asse(0, y0 + 900, x0, x0 + 1200, 30), Asse(0, y0 + 500, x0, x0 + 700, 30),
                    Asse(90, -x0, y0, y0 + 900, 30), Asse(90, -(x0 + 1200), y0, y0 + 900, 30), Asse(90, -(x0 + 700), y0 + 500, y0 + 900, 30)]
        # La seconda pianta sta 40 m più a destra sulla tavola e 50 cm più in basso.
        dx, dy, quota = spostamento_per_correlazione(sagoma(0, 0), sagoma(4000, -50), "y")
        self.assertAlmostEqual(dx, -4000, delta=10)
        self.assertAlmostEqual(dy, 50, delta=10)
        self.assertGreater(quota, .8)


class AltezzeDeiLocaliTest(unittest.TestCase):
    def test_legge_h_nelle_stanze_e_scarta_porte_e_sigle(self):
        from ricostruisciDxf import leggi_altezze_locali
        doc = ezdxf.new()
        spazio = doc.modelspace()
        for testo, x in (("H 313", 1), ("h = 2,70", 2), ("H 210", 3), ("L 99 H 241 Hs 92", 4), ("H 318*", 5)):
            spazio.add_text(testo, dxfattribs={"insert": (x, 1)})
        altezze = leggi_altezze_locali(list(spazio), box(0, 0, 1000, 1000), 100)
        self.assertEqual([h for _, h in altezze], [313, 270, 318])


class SistemazioniDelLottoTest(unittest.TestCase):
    def test_ritrova_l_edificio_nella_planimetria_e_porta_il_lotto_nella_pianta(self):
        from ricostruisciDxf import leggi_sistemazioni
        doc = ezdxf.new()
        doc.layers.new("MRT")
        blocco = doc.blocks.new("EDIFICIO")
        # L'edificio come nella pianta: 12 × 10 m, muri da 30 cm, fatti di tanti tratti.
        def bordo(spazio, x0, y0, x1, y1):
            for (ax, ay), (bx, by) in [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]:
                for i in range(10):
                    spazio.add_line((ax + (bx - ax) * i / 10, ay + (by - ay) * i / 10), (ax + (bx - ax) * (i + 1) / 10, ay + (by - ay) * (i + 1) / 10), dxfattribs={"layer": "MRT"})
        bordo(blocco, 0, 0, 12, 10)
        bordo(blocco, .3, .3, 11.7, 9.7)
        spazio = doc.modelspace()
        spazio.add_blockref("EDIFICIO", (500, 300))  # la planimetria generale sta altrove nel foglio
        spazio.add_lwpolyline([(495, 295), (520, 295), (520, 299), (495, 299)], close=True, dxfattribs={"layer": "Verde Privato"})
        spazio.add_lwpolyline([(505, 290), (513, 290), (513, 295), (505, 295)], close=True, dxfattribs={"layer": "sist_est"})
        spazio.add_text("PISCINA", dxfattribs={"insert": (507, 292)})
        spazio.add_circle((498, 297), .25, dxfattribs={"layer": "ALBERI"})
        # Le pareti del piano terra, nella pianta: lo stesso edificio a (0, 0).
        muri = [Asse(0, 15, 0, 1200, 30), Asse(0, 985, 0, 1200, 30), Asse(90, -15, 0, 1000, 30), Asse(90, -1185, 0, 1000, 30)]  # assi a metà muro
        esito = leggi_sistemazioni(list(spazio), muri, "MRT", 100)
        self.assertIsNotNone(esito)
        self.assertGreaterEqual(esito["allineamento"], .7)
        (verde,) = esito["verdi"]
        self.assertAlmostEqual(verde.bounds[0], -500, delta=5)  # 495 m → 5 m a sinistra dell'edificio
        (vasca,) = esito["piscine"]
        self.assertAlmostEqual(vasca.area / 10_000, 40, delta=.5)
        (albero,) = esito["alberi"]
        self.assertAlmostEqual(albero[0].x, -200, delta=5)
        self.assertTrue(esito["lottoStimato"])


class PianiPropostiTest(unittest.TestCase):
    def test_trova_le_piante_con_i_nomi_e_scarta_il_prospetto(self):
        from anteprimaDxf import proponi_piani
        doc = ezdxf.new()
        doc.units = 4  # dichiara i millimetri, ma è disegnato in metri
        spazio = doc.modelspace()

        def rettangolo(x0, y0, x1, y1, passo=0.5):
            for (ax, ay), (bx, by) in [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]:
                n = max(1, int(hypot(bx - ax, by - ay) / passo))
                for i in range(n):
                    spazio.add_line((ax + (bx - ax) * i / n, ay + (by - ay) * i / n), (ax + (bx - ax) * (i + 1) / n, ay + (by - ay) * (i + 1) / n), dxfattribs={"layer": "MRT"})
        for x in (0, 30, 60):  # terra, primo, prospetto
            rettangolo(x, 0, x + 12, 10)
            rettangolo(x + 0.3, 0.3, x + 11.7, 9.7)
        spazio.add_text("soggiorno", dxfattribs={"insert": (4, 5)})
        spazio.add_text("bagno", dxfattribs={"insert": (9, 5)})
        spazio.add_text("letto", dxfattribs={"insert": (34, 5)})
        spazio.add_text("+3.20", dxfattribs={"insert": (36, 2)})
        esito = proponi_piani(doc)
        self.assertEqual(esito["unita"], 6)
        self.assertEqual(esito["layerMuri"], "MRT")
        self.assertEqual([(p["nome"], p["quota"]) for p in esito["piani"]], [("Piano terra", 0), ("Piano primo", 320)])
        self.assertLess(esito["piani"][0]["rettangolo"][2], 30)


if __name__ == "__main__":
    unittest.main()
