import type { PhotoTable } from "./referencePicker.ts";

/** Le stesse foto per l’interfaccia e le tavole inviate al render. */
export const ROOM_VISUAL_PHOTOS: Record<string, PhotoTable> = {
  "paint": {
    "opaco": {
      "folder": "room-catalog-v1",
      "filename": "paint-opaco.webp",
      "text": "Pittura opaca",
      "bn": false
    },
    "satinato": {
      "folder": "room-catalog-v1",
      "filename": "paint-satinato.webp",
      "text": "Pittura satinata",
      "bn": false
    },
    "lucido": {
      "folder": "room-catalog-v1",
      "filename": "paint-lucido.webp",
      "text": "Pittura lucida",
      "bn": false
    }
  },
  "furniture": {
    "legno_chiaro": {
      "folder": "room-catalog-v1",
      "filename": "furniture-legno_chiaro.webp",
      "text": "Arredi in legno chiaro",
      "bn": false
    },
    "legno_scuro": {
      "folder": "room-catalog-v1",
      "filename": "furniture-legno_scuro.webp",
      "text": "Arredi in legno scuro",
      "bn": false
    },
    "metallo": {
      "folder": "room-catalog-v1",
      "filename": "furniture-metallo.webp",
      "text": "Arredi in metallo",
      "bn": false
    },
    "vetro": {
      "folder": "room-catalog-v1",
      "filename": "furniture-vetro.webp",
      "text": "Arredi in vetro",
      "bn": false
    },
    "tessuto": {
      "folder": "room-catalog-v1",
      "filename": "furniture-tessuto.webp",
      "text": "Arredi in tessuto",
      "bn": false
    },
    "pelle": {
      "folder": "room-catalog-v1",
      "filename": "furniture-pelle.webp",
      "text": "Arredi in pelle",
      "bn": false
    }
  },
  "ceiling": {
    "piano": {
      "folder": "room-catalog-v1",
      "filename": "ceiling-piano-BN.webp",
      "text": "Soffitto piano",
      "bn": true
    },
    "controsoffitto_cartongesso": {
      "folder": "room-catalog-v1",
      "filename": "ceiling-controsoffitto_cartongesso-BN.webp",
      "text": "Controsoffitto in cartongesso",
      "bn": true
    },
    "travi_legno": {
      "folder": "room-catalog-v1",
      "filename": "ceiling-travi_legno-BN.webp",
      "text": "Travi in legno",
      "bn": true
    },
    "boiserie_soffitto": {
      "folder": "room-catalog-v1",
      "filename": "ceiling-boiserie_soffitto-BN.webp",
      "text": "Boiserie a soffitto",
      "bn": true
    }
  },
  "lighting": {
    "faretti_incassati": {
      "folder": "room-catalog-v1",
      "filename": "lighting-faretti_incassati-BN.webp",
      "text": "Faretti incassati",
      "bn": true
    },
    "lampadario_centrale": {
      "folder": "room-catalog-v1",
      "filename": "lighting-lampadario_centrale-BN.webp",
      "text": "Lampadario centrale",
      "bn": true
    },
    "led_strip_perimetrale": {
      "folder": "room-catalog-v1",
      "filename": "lighting-led_strip_perimetrale-BN.webp",
      "text": "LED perimetrale",
      "bn": true
    },
    "lampade_sospensione": {
      "folder": "room-catalog-v1",
      "filename": "lighting-lampade_sospensione-BN.webp",
      "text": "Lampade a sospensione",
      "bn": true
    },
    "applique_parete": {
      "folder": "room-catalog-v1",
      "filename": "lighting-applique_parete-BN.webp",
      "text": "Applique a parete",
      "bn": true
    },
    "misto": {
      "folder": "room-catalog-v1",
      "filename": "lighting-misto-BN.webp",
      "text": "Illuminazione mista",
      "bn": true
    }
  },
  "wallpaper": {
    "geometrico": {
      "folder": "room-catalog-v1",
      "filename": "wallpaper-geometrico.webp",
      "text": "Carta geometrica",
      "bn": false
    },
    "floreale": {
      "folder": "room-catalog-v1",
      "filename": "wallpaper-floreale.webp",
      "text": "Carta floreale",
      "bn": false
    },
    "tropicale": {
      "folder": "room-catalog-v1",
      "filename": "wallpaper-tropicale.webp",
      "text": "Carta tropicale",
      "bn": false
    },
    "astratto": {
      "folder": "room-catalog-v1",
      "filename": "wallpaper-astratto.webp",
      "text": "Carta astratta",
      "bn": false
    },
    "righe": {
      "folder": "room-catalog-v1",
      "filename": "wallpaper-righe.webp",
      "text": "Carta a righe",
      "bn": false
    },
    "damasco": {
      "folder": "room-catalog-v1",
      "filename": "wallpaper-damasco.webp",
      "text": "Carta damascata",
      "bn": false
    },
    "toile_de_jouy": {
      "folder": "room-catalog-v1",
      "filename": "wallpaper-toile_de_jouy.webp",
      "text": "Carta Toile de Jouy",
      "bn": false
    },
    "botanico": {
      "folder": "room-catalog-v1",
      "filename": "wallpaper-botanico.webp",
      "text": "Carta botanica",
      "bn": false
    },
    "minimal": {
      "folder": "room-catalog-v1",
      "filename": "wallpaper-minimal.webp",
      "text": "Carta minimal",
      "bn": false
    }
  },
  "cladding": {
    "boiserie_legno": {
      "folder": "room-catalog-v1",
      "filename": "cladding-boiserie_legno.webp",
      "text": "Boiserie in legno",
      "bn": false
    },
    "pannelli_3d": {
      "folder": "room-catalog-v1",
      "filename": "cladding-pannelli_3d.webp",
      "text": "Pannelli 3D",
      "bn": false
    }
  },
  "curtains": {
    "tende_a_pannello": {
      "folder": "room-catalog-v1",
      "filename": "curtains-tende_a_pannello-BN.webp",
      "text": "Tende a pannello",
      "bn": true
    },
    "tende_classiche": {
      "folder": "room-catalog-v1",
      "filename": "curtains-tende_classiche-BN.webp",
      "text": "Tende classiche",
      "bn": true
    },
    "veneziane": {
      "folder": "room-catalog-v1",
      "filename": "curtains-veneziane-BN.webp",
      "text": "Veneziane",
      "bn": true
    },
    "rullo": {
      "folder": "room-catalog-v1",
      "filename": "curtains-rullo-BN.webp",
      "text": "Tenda a rullo",
      "bn": true
    },
    "tende_lino": {
      "folder": "room-catalog-v1",
      "filename": "curtains-tende_lino-BN.webp",
      "text": "Tende in lino",
      "bn": true
    },
    "tende_velluto": {
      "folder": "room-catalog-v1",
      "filename": "curtains-tende_velluto-BN.webp",
      "text": "Tende in velluto",
      "bn": true
    }
  },
  "kitchen-front": {
    "laccato": {
      "folder": "room-catalog-v1",
      "filename": "kitchen-front-laccato.webp",
      "text": "Frontali laccati",
      "bn": false
    },
    "legno": {
      "folder": "room-catalog-v1",
      "filename": "kitchen-front-legno.webp",
      "text": "Frontali in legno",
      "bn": false
    },
    "effetto_legno": {
      "folder": "room-catalog-v1",
      "filename": "kitchen-front-effetto_legno.webp",
      "text": "Frontali effetto legno",
      "bn": false
    },
    "vetro": {
      "folder": "room-catalog-v1",
      "filename": "kitchen-front-vetro.webp",
      "text": "Frontali in vetro",
      "bn": false
    },
    "metallo": {
      "folder": "room-catalog-v1",
      "filename": "kitchen-front-metallo.webp",
      "text": "Frontali in metallo",
      "bn": false
    }
  },
  "worktop": {
    "granito": {
      "folder": "room-catalog-v1",
      "filename": "worktop-granito.webp",
      "text": "Piano in granito",
      "bn": false
    },
    "quarzo": {
      "folder": "room-catalog-v1",
      "filename": "worktop-quarzo.webp",
      "text": "Piano in quarzo",
      "bn": false
    },
    "laminato": {
      "folder": "room-catalog-v1",
      "filename": "worktop-laminato.webp",
      "text": "Piano in laminato",
      "bn": false
    },
    "legno": {
      "folder": "room-catalog-v1",
      "filename": "worktop-legno.webp",
      "text": "Piano in legno",
      "bn": false
    }
  },
  "kitchen-handle": {
    "metallo_nero": {
      "folder": "room-catalog-v1",
      "filename": "kitchen-handle-metallo_nero.webp",
      "text": "Maniglia nera",
      "bn": false
    },
    "metallo_oro": {
      "folder": "room-catalog-v1",
      "filename": "kitchen-handle-metallo_oro.webp",
      "text": "Maniglia oro",
      "bn": false
    },
    "legno": {
      "folder": "room-catalog-v1",
      "filename": "kitchen-handle-legno.webp",
      "text": "Maniglia in legno",
      "bn": false
    },
    "cromato": {
      "folder": "room-catalog-v1",
      "filename": "kitchen-handle-cromato.webp",
      "text": "Maniglia cromata",
      "bn": false
    }
  },
  "style": {
    "moderno": {
      "folder": "room-catalog-v1",
      "filename": "style-moderno.webp",
      "text": "Moderno",
      "bn": false
    },
    "scandinavo": {
      "folder": "room-catalog-v1",
      "filename": "style-scandinavo.webp",
      "text": "Scandinavo",
      "bn": false
    },
    "industriale": {
      "folder": "room-catalog-v1",
      "filename": "style-industriale.webp",
      "text": "Industriale",
      "bn": false
    },
    "classico": {
      "folder": "room-catalog-v1",
      "filename": "style-classico.webp",
      "text": "Classico",
      "bn": false
    },
    "rustico": {
      "folder": "room-catalog-v1",
      "filename": "style-rustico.webp",
      "text": "Rustico",
      "bn": false
    },
    "minimalista": {
      "folder": "room-catalog-v1",
      "filename": "style-minimalista.webp",
      "text": "Minimalista",
      "bn": false
    },
    "mediterraneo": {
      "folder": "room-catalog-v1",
      "filename": "style-mediterraneo.webp",
      "text": "Mediterraneo",
      "bn": false
    },
    "art_deco": {
      "folder": "room-catalog-v1",
      "filename": "style-art_deco.webp",
      "text": "Art Deco",
      "bn": false
    },
    "giapponese": {
      "folder": "room-catalog-v1",
      "filename": "style-giapponese.webp",
      "text": "Giapponese",
      "bn": false
    },
    "provenzale": {
      "folder": "room-catalog-v1",
      "filename": "style-provenzale.webp",
      "text": "Provenzale",
      "bn": false
    },
    "eclettico": {
      "folder": "room-catalog-v1",
      "filename": "style-eclettico.webp",
      "text": "Eclettico",
      "bn": false
    },
    "luxe_contemporaneo": {
      "folder": "room-catalog-v1",
      "filename": "style-luxe_contemporaneo.webp",
      "text": "Luxe contemporaneo",
      "bn": false
    }
  },
  "floor-layout": {
    "cassero_regolare": {
      "folder": "room-catalog-v1",
      "filename": "floor-layout-cassero_regolare-BN.webp",
      "text": "Cassero regolare",
      "bn": true
    },
    "cassero_irregolare": {
      "folder": "room-catalog-v1",
      "filename": "floor-layout-cassero_irregolare-BN.webp",
      "text": "Cassero irregolare",
      "bn": true
    },
    "esagonale": {
      "folder": "room-catalog-v1",
      "filename": "floor-layout-esagonale-BN.webp",
      "text": "Posa esagonale",
      "bn": true
    }
  }
};
