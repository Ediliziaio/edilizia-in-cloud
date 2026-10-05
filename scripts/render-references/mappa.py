#!/usr/bin/env python3
"""Tabella definitiva: numero foto (ordine dei fogli contatto) -> modulo, dimensione, valore dell'opzione.

Ogni voce: (modulo, dimensione, valore, [numeri foto, la prima e' la principale], classe)
  classe FORMA   = forma/struttura/tipo  -> versione per il motore in bianco e nero (regola di progetto 7a2a49b33)
  classe MATERIA = materiale/finitura/texture/colore -> a colori (il colore E' l'informazione)
La cartella e' quella del modulo che la usa di piu'; altri moduli possono puntare allo stesso file.
"""
CARTELLA = {
    "bagno": "bathroom", "pavimento": "floors", "facciata": "facades", "tetto": "roofs",
    "persiane": "shutters", "pergola": "pergolas", "piscina": "pools",
    "porta_interna": "doors", "porta_blindata": "doors", "esterno": "exterior", "stanza": "facades",
}

M = []  # voci
def v(modulo, dim, valore, foto, classe): M.append((modulo, dim, valore, foto, classe))

# ============================ BAGNO ============================
for val, foto in [("walk_in", [31, 34, 52]), ("nicchia_box", [29, 32]), ("frontale_box", [28, 27]),
                  ("angolare", [26, 25]), ("semicircolare", [30, 33])]:
    v("bagno", "doccia_tipo", val, foto, "FORMA")
for val, foto in [("trasparente", [125, 126]), ("satinato", [304, 303]), ("fume", [127, 302]), ("serigrafato", [301, 300])]:
    v("bagno", "doccia_vetro", val, foto, "MATERIA")
for val, foto in [("cromato", [8, 7, 63]), ("nero_opaco", [11, 6]), ("oro_spazzolato", [10, 51]), ("senza_profilo", [242])]:
    v("bagno", "doccia_profilo", val, foto, "MATERIA")
for val, foto in [("filo_pavimento", [52]), ("rialzato_3cm", [217]), ("rialzato_5cm", [216]), ("pietra", [218])]:
    v("bagno", "doccia_piatto", val, foto, "FORMA")
for val, foto in [("a_parete", [273]), ("pioggia_soffitto", [272]), ("colonna_completa", [37]), ("combinato", [270])]:
    v("bagno", "doccia_soffione", val, foto, "FORMA")
for val, foto in [("freestanding_ovale", [298]), ("freestanding_rettangolare", [296]), ("back_to_wall", [295]),
                  ("incassata", [297]), ("angolare", [294])]:
    v("bagno", "vasca_tipo", val, foto, "FORMA")
for val, foto in [("solid_surface", [281]), ("ghisa_smaltata", [271])]:
    v("bagno", "vasca_materiale", val, foto, "MATERIA")
for val, foto in [("a_parete", [264]), ("a_pavimento", [39]), ("bordo_vasca", [102])]:
    v("bagno", "vasca_rubinetto", val, foto, "FORMA")
for val, foto in [("sospeso_moderno", [115]), ("sospeso_minimal", [116]), ("a_terra_industrial", [114])]:
    v("bagno", "mobile_stile", val, foto, "FORMA")
v("bagno", "mobile_piano", "quarzo", [172, 251], "MATERIA")
for val, foto in [("integrato", [115]), ("appoggio_ovale", [86]), ("appoggio_rettangolare", [87]), ("semincasso", [88])]:
    v("bagno", "lavabo_tipo", val, foto, "FORMA")
for val, foto in [("retroilluminato", [276]), ("specchiera_contenitore", [275]), ("tondo", [277]), ("verticale", [278])]:
    v("bagno", "specchio_tipo", val, foto, "FORMA")
for val, foto in [("sospeso", [308]), ("rimless_sospeso", [307]), ("a_terra", [306])]:
    v("bagno", "wc_tipo", val, foto, "FORMA")
for val, foto in [("bianco", [308]), ("grigio_chiaro", [309]), ("nero_opaco", [310])]:
    v("bagno", "sanitari_colore", val, foto, "MATERIA")
for val, foto in [("sospeso", [18]), ("a_terra", [17])]:
    v("bagno", "bidet_tipo", val, foto, "FORMA")
for val, foto in [("rettangolare_sottile", [233]), ("tonda_soft", [234]), ("vetro_minimal", [235])]:
    v("bagno", "placca_stile", val, foto, "FORMA")
for val, foto in [("cromo", [103, 110, 106, 105]), ("nero_opaco", [104, 113]), ("oro_spazzolato", [109, 111]),
                  ("oro_rosa", [107, 108]), ("acciaio_spazzolato", [112, 266])]:
    v("bagno", "rubinetto_finitura", val, foto, "MATERIA")
for val, foto in [("quadro_moderno", [106]), ("tondo_classico", [105]), ("industrial", [265]), ("vintage_crosshead", [267])]:
    v("bagno", "rubinetto_stile", val, foto, "FORMA")
for val, foto in [("marmo_carrara", [207, 208, 181, 213]), ("marmo_calacatta", [206, 35]), ("marmo_sahara_noir", [175, 96]),
                  ("marmo_marquinia", [210, 95]), ("marmo_verde_guatemala", [212, 97]), ("marmo_statuario", [211, 176]),
                  ("marmo_emperador", [209, 174]), ("cemento_grigio", [183, 187, 199]), ("cemento_bianco", [184]),
                  ("cemento_antracite", [177, 198]), ("legno_rovere_chiaro", [185]), ("legno_rovere_scuro", [201, 200]),
                  ("legno_wenge", [186, 205]), ("ardesia", [194, 12]), ("pietra_ardesia", [193]), ("travertino", [182, 293]),
                  ("basalto", [195, 196]), ("mosaico_esagoni", [120]), ("mosaico_penny", [123]), ("zellige", [215]),
                  ("cotto_toscano", [197]), ("resina_spatolata", [101])]:
    v("bagno", "piastrella_effetto", val, foto, "MATERIA")

# ============================ PAVIMENTO ============================
for val, foto in [("spina_di_pesce", [280]), ("spina_ungherese", [190, 179]), ("diagonale_45", [191]), ("sfalsato_33", [189]),
                  ("rettilineo_dritto", [188, 178]), ("modulare", [192]), ("opus_romanum", [142])]:
    v("pavimento", "posa", val, foto, "FORMA")
for val, foto in [("parquet_massello", [136]), ("parquet_prefinito", [134, 133]), ("laminato", [263]), ("vinile_lvt", [236]),
                  ("moquette", [117]), ("resina_continua", [141]), ("cemento_resina", [143]), ("microcemento", [100]),
                  ("terrazzo_veneziano", [289]), ("pietra_naturale", [142]), ("cotto", [214]), ("marmo", [213]),
                  ("gres_porcellanato", [70, 69])]:
    v("pavimento", "tipo", val, foto, "MATERIA")
for val, foto in [("legno", [68, 202]), ("marmo", [70]), ("pietra", [69]), ("cemento", [187]), ("resina", [143]),
                  ("cotto", [203]), ("tessile", [117]), ("terrazzo", [204])]:
    v("pavimento", "effetto", val, foto, "MATERIA")
for val, foto in [("rovere_naturale", [135]), ("rovere_sbiancato", [137]), ("rovere_miele", [133]), ("noce", [132]),
                  ("teak", [53]), ("wenghe", [138]), ("frassino_bianco", [131])]:
    v("pavimento", "essenza", val, foto, "MATERIA")
for val, foto in [("microbisello", [65]), ("bisello_v", [62]), ("bordo_irregolare", [64])]:
    v("pavimento", "bisello", val, foto, "MATERIA")
for val, foto in [("lucido", [173]), ("opaco", [283, 285]), ("satinato", [292]), ("spazzolato", [299]), ("boccardato", [284]),
                  ("anticato", [139]), ("levigato", [219]), ("cerato", [13])]:
    v("pavimento", "finitura", val, foto, "MATERIA")
for val, foto in [("bianco", [14]), ("legno", [16]), ("alluminio", [15])]:
    v("pavimento", "battiscopa", val, foto, "MATERIA")

# ============================ FACCIATA ============================
for val, foto in [("liscio", [78]), ("rasato", [282]), ("graffiato_fine", [77]), ("graffiato_medio", [50]), ("bucciato", [94]),
                  ("strutturato_grosso", [291]), ("rustico", [79]), ("veneziana", [80]), ("bugnato", [49])]:
    v("facciata", "intonaco", val, foto, "MATERIA")
for val, foto in [("pietra_serena", [222]), ("travertino", [254]), ("arenaria_beige", [54]), ("luserna", [255]),
                  ("marmo_bianco", [56]), ("porfido", [58]), ("splitface_grigio", [257, 253]), ("pietra_rustica", [124, 256]),
                  ("cotto_rosso", [57]), ("clinker_rosso", [55]), ("clinker_grigio", [99]), ("clinker_beige", [98]),
                  ("cotto_mattone", [130]), ("laterizio_bianco", [129])]:
    v("facciata", "rivestimento", val, foto, "MATERIA")
for val, foto in [("corsi_regolari", [98]), ("opus_incertum", [256]), ("listelli_orizzontali", [257]), ("corsi_sfalsati", [253])]:
    v("facciata", "posa", val, foto, "FORMA")
v("facciata", "pietra_alt", "alt", [258, 259], "MATERIA")  # varianti pietra grigio chiaro (usate come alternative luserna/pietra serena)

# ============================ TETTO ============================
for val, foto in [("rame", [71]), ("zinco_titanio", [72]), ("acciaio_zincato", [74]), ("pvc", [75]), ("alluminio", [73])]:
    v("tetto", "grondaia", val, foto, "MATERIA")
for val, foto in [("piatto", [93]), ("sporgente", [92]), ("abbaino", [1])]:
    v("tetto", "lucernario", val, foto, "FORMA")
v("tetto", "pannelli_solari", "tegola_solare_integrata", [290], "FORMA")
v("tetto", "manto_dettaglio", "tegole_coppi", [286], "MATERIA")

# ============================ PERSIANE ============================
for val, foto in [("veneziana_classica", [169]), ("veneziana_esterna", [164]), ("scuro_pieno", [167]), ("scuro_cornice", [166]),
                  ("gelosia", [163]), ("avvolgibile_esterno", [269, 59]), ("a_libro", [165]), ("griglia_sicurezza", [76]),
                  ("brise_soleil", [60])]:
    v("persiane", "tipo", val, foto, "FORMA")
for val, foto in [("legno_naturale", [168]), ("fibra_vetro", [48]), ("alluminio", [46])]:
    v("persiane", "materiale", val, foto, "MATERIA")
for val, foto in [("rovere_scuro", [81]), ("douglas_fiammato", [82]), ("noce", [83]), ("castagno", [90])]:
    v("persiane", "essenza_legno", val, foto, "MATERIA")   # <- opzione NUOVA (oggi solo colore libero)
for val, foto in [("bronzo_scuro", [36])]:
    v("persiane", "ferramenta", val, foto, "MATERIA")
for val, foto in [("cardini_tradizionali", [171]), ("brackets_architettonici", [170]), ("guide_laterali", [269]), ("su_telaio", [47])]:
    v("persiane", "installazione", val, foto, "FORMA")

# ============================ PERGOLE ============================
for val, foto in [("bioclimatica_addossata", [149]), ("bioclimatica_autoportante", [148]), ("telo_addossata", [144]),
                  ("telo_autoportante", [147]), ("vetro_addossata", [145]), ("vetro_autoportante", [146]),
                  ("legno_addossata", [159]), ("legno_autoportante", [160]), ("addossata", [155]), ("autoportante", [158])]:
    v("pergola", "struttura_tipo", val, foto, "FORMA")
for val, foto in [("alluminio", [9]), ("alluminio_effetto_legno", [250]), ("legno_lamellare", [45]), ("acciaio", [249]), ("misto", [44])]:
    v("pergola", "struttura_materiale", val, foto, "MATERIA")
for val, foto in [("lamelle_orientabili", [84]), ("telo_retraibile", [40]), ("vetro", [162]), ("policarbonato", [43]),
                  ("listelli_legno", [91]), ("copertura_opaca_tecnica", [128])]:
    v("pergola", "copertura", val, foto, "FORMA")
for val, foto in [("vetrata_slide", [152]), ("screen_zip", [287]), ("tenda_tecnica", [288]), ("frangivento", [150]),
                  ("pannelli_fissi", [151]), ("brise_soleil", [161])]:
    v("pergola", "chiusure", val, foto, "FORMA")
for val, foto in [("strip_led_perimetrale", [153]), ("downlight_lineari", [154]), ("spot_integrati", [157, 156])]:
    v("pergola", "illuminazione", val, foto, "MATERIA")

# ============================ PISCINE ============================
for val, foto in [("sfioro_rettangolare", [223]), ("interrata_rettangolare", [232])]:
    v("piscina", "tipo", val, foto, "MATERIA")
for val, foto in [("mosaico_bianco", [119]), ("mosaico_azzurro", [118]), ("mosaico_grigio", [122]), ("mosaico_antracite", [121]),
                  ("gres_effetto_pietra", [221]), ("gres_effetto_sabbia", [180]), ("liner_chiaro", [262]), ("liner_scuro", [261]),
                  ("resina_premium", [260]), ("pietra_naturale_pool_finish", [221])]:
    v("piscina", "rivestimento", val, foto, "MATERIA")
for val, foto in [("pietra_chiara", [21]), ("pietra_grigia", [24]), ("gres_2cm", [140]), ("travertino", [22]), ("legno_wpc", [42]),
                  ("cemento_spazzolato", [20]), ("bordo_sottile_moderno", [23]), ("bordo_massivo_classico", [19])]:
    v("piscina", "coping", val, foto, "MATERIA")
for val, foto in [("scala_inox", [268]), ("gradini_angolo", [66]), ("gradini_frontali", [67]), ("gradoni_lounge", [224]),
                  ("spiaggetta", [279]), ("beach_entry", [279])]:
    v("piscina", "accesso", val, foto, "FORMA")
for val, foto in [("illuminazione_subacquea", [227]), ("lama_dacqua", [229]), ("cascata", [228]), ("idromassaggio_integrato", [225]),
                  ("copertura_isotermica", [226]), ("copertura_rigida", [231]), ("doccia_esterna", [38]), ("zona_prendisole", [89])]:
    v("piscina", "accessori", val, foto, "MATERIA")
for val, foto in [("deck_wpc", [41]), ("solarium_gres", [274]), ("pietra_naturale", [220]), ("prato_raccordato", [248]), ("ghiaia_drenante", [61])]:
    v("piscina", "area_perimetrale", val, foto, "MATERIA")
for val, foto in [("cristallina_chiara", [3]), ("azzurra_classica", [2]), ("turchese", [5]), ("grigio_verde_naturale", [4]),
                  ("blu_profondo", [230]), ("sabbia_chiara", [252])]:
    v("piscina", "colore_acqua", val, foto, "MATERIA")

# ============================ PORTE ============================
for val, foto in [("battente_liscia", [243]), ("vetrata", [244]), ("scorrevole_interno_muro", [246]),
                  ("scorrevole_esterno_muro", [247]), ("rasomuro", [245])]:
    v("porta_interna", "tipo", val, foto, "FORMA")
for val, foto in [("moderna_liscia", [240]), ("classica_pantografata", [237]), ("rasomuro", [241]),
                  ("con_fiancoluce", [238]), ("solo_finitura", [239])]:
    v("porta_blindata", "tipo", val, foto, "FORMA")

# ============================ ESTERNI (pavimenti esterni, giardino) ============================
v("esterno", "pavimentazione", "masselli_autobloccanti", [305], "MATERIA")
v("esterno", "pavimentazione", "gres_outdoor", [85], "MATERIA")
v("esterno", "pavimentazione", "lastre_grande_formato", [85], "MATERIA")
v("esterno", "pavimentazione", "ghiaia_stabilizzata", [61], "MATERIA")
v("esterno", "pavimentazione", "deck_wpc", [41, 42], "MATERIA")

# ============================ STANZA (rivestimenti pareti) ============================
for val, foto in [("mattone_vista", [130]), ("pietra_naturale", [124]), ("intonaco_spatolato", [79]), ("stucco_veneziano", [80])]:
    v("stanza", "rivestimento_pareti", val, foto, "MATERIA")

if __name__ == "__main__":
    import collections
    nomi = [l.rstrip("\n") for l in open("nomi-ordinati.txt", encoding="utf-8")]
    usate = collections.defaultdict(list)
    for modulo, dim, val, foto, cl in M:
        for n in foto:
            assert 1 <= n <= len(nomi), (modulo, dim, val, n)
            usate[n].append(f"{modulo}.{dim}={val}")
    print("voci:", len(M), "| foto usate:", len(usate), "/", len(nomi))
    mancanti = [n for n in range(1, len(nomi) + 1) if n not in usate]
    print("\nFOTO NON ASSEGNATE:", len(mancanti))
    for n in mancanti: print(f"  {n:3d} {nomi[n-1]}")
    multi = {n: u for n, u in usate.items() if len(set(x.split('=')[0] for x in u)) > 1}
    print("\nFoto usate da PIU' dimensioni diverse (ok se volute):", len(multi))
    for n, u in list(multi.items())[:60]: print(f"  {n:3d} {nomi[n-1][:42]:42s} -> {', '.join(u[:3])}")
