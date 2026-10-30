//! Fase 0 Planimetrie: i crate di cadcraft (geom, doc, io) dietro tre funzioni per il browser.
//!
//! - `scrivi_dxf(json_pianta)`  → testo DXF (R2000, unità cm)
//! - `esporta_svg(json_pianta)` → SVG della stessa pianta, disegnata dal renderer di cadcraft
//! - `leggi_dxf(testo_dxf)`     → JSON con limiti, layer, entità semplici e un SVG di sfondo
//! - `esporta_pdf(json, opz)`   → PDF in scala (solo con la feature `pdf`)
//!
//! Il JSON della pianta è un modello PROVVISORIO, solo per questa prova: il modello vero lo
//! definisce la fase 1. Formato documentato in `tools/planimetrie-wasm/README.md`.

use cadcraft_color::Color;
use cadcraft_doc::{
    Arc, Common, DimKind, DimStyle, Dimension, Drawing, EntityKind, HAlign, Hatch, HatchLoop, Layer, Line,
    LwPolyline, Prim, Space, Text, VAlign,
};
use cadcraft_geom::{PolyVertex, Vec2, Vec3};
use serde::Deserialize;
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------------------------
// Modello d'ingresso (provvisorio)
// ---------------------------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct Pianta {
    #[serde(default)]
    pub titolo: String,
    pub muri: Vec<Muro>,
    #[serde(default)]
    pub aperture: Vec<Apertura>,
    #[serde(default)]
    pub testi: Vec<Testo>,
    #[serde(default)]
    pub quote: Vec<Quota>,
    /// Scala di stampa prevista (50 = 1:50): decide l'altezza delle quote nel disegno.
    #[serde(default = "cinquanta")]
    pub scala: f64,
}

#[derive(Deserialize)]
pub struct Muro {
    pub id: String,
    /// Asse del muro, in cm.
    pub p1: [f64; 2],
    pub p2: [f64; 2],
    pub spessore: f64,
    #[serde(default)]
    pub stato: Stato,
}

#[derive(Deserialize, Default, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Stato {
    #[default]
    Esistente,
    DaDemolire,
    Nuovo,
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TipoApertura {
    Porta,
    Finestra,
    Portafinestra,
}

#[derive(Deserialize, Default, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Lato {
    #[default]
    Sinistra,
    Destra,
}

#[derive(Deserialize)]
pub struct Apertura {
    /// `id` del muro che la ospita.
    pub muro: String,
    pub tipo: TipoApertura,
    /// Distanza lungo l'asse da `p1` del muro all'inizio dell'apertura, in cm.
    pub distanza: f64,
    pub larghezza: f64,
    /// Lato (guardando da p1 verso p2) verso cui si apre l'anta.
    #[serde(default)]
    pub apre_verso: Lato,
    /// Cerniera alla fine dell'apertura (lato p2) invece che all'inizio.
    #[serde(default)]
    pub cerniera_fine: bool,
}

#[derive(Deserialize)]
pub struct Testo {
    pub p: [f64; 2],
    pub testo: String,
    #[serde(default = "venti")]
    pub altezza: f64,
}

#[derive(Deserialize)]
pub struct Quota {
    pub p1: [f64; 2],
    pub p2: [f64; 2],
    /// Distanza della linea di quota dai punti, a sinistra di p1→p2 (negativa: a destra).
    #[serde(default = "cinquanta")]
    pub distanza: f64,
}

fn cinquanta() -> f64 {
    50.0
}
fn venti() -> f64 {
    20.0
}

// ---------------------------------------------------------------------------------------------
// Pianta → Drawing di cadcraft
// ---------------------------------------------------------------------------------------------

const TOL: f64 = 0.5; // cm: estremi di muri più vicini di così sono lo stesso nodo

struct Strati;
impl Strati {
    const MURI: &'static str = "MURI";
    const DEMOLIRE: &'static str = "MURI-DA-DEMOLIRE";
    const NUOVI: &'static str = "MURI-NUOVI";
    const PORTE: &'static str = "PORTE";
    const FINESTRE: &'static str = "FINESTRE";
    const TESTI: &'static str = "TESTI-LOCALI";
    const QUOTE: &'static str = "QUOTE";
}

fn v(p: [f64; 2]) -> Vec2 {
    Vec2::new(p[0], p[1])
}

fn sul(layer: &str) -> Common {
    Common { layer: layer.into(), ..Common::default() }
}

fn colorato(layer: &str, aci: u8) -> Common {
    Common { layer: layer.into(), color: Color::Index(aci), ..Common::default() }
}

/// Parametri lungo l'asse dove iniziano/finiscono le due facce del muro (giunti a 45° negli
/// angoli fra due muri; testa dritta altrove).
struct Facce {
    sx: (f64, f64),
    dx: (f64, f64),
}

fn giunto(muri: &[Muro], i: usize, inizio: bool) -> (f64, f64) {
    let m = &muri[i];
    let (p, q) = if inizio { (v(m.p1), v(m.p2)) } else { (v(m.p2), v(m.p1)) };
    let altri: Vec<(usize, Vec2)> = muri
        .iter()
        .enumerate()
        .filter(|(j, _)| *j != i)
        .filter_map(|(j, o)| {
            if v(o.p1).near(p, TOL) {
                Some((j, v(o.p2)))
            } else if v(o.p2).near(p, TOL) {
                Some((j, v(o.p1)))
            } else {
                None
            }
        })
        .collect();
    if altri.len() != 1 {
        return (0.0, 0.0);
    }
    let (j, lontano) = altri[0];
    let a = (q - p).normalized(); // verso il corpo del muro
    let e = (lontano - p).normalized(); // verso il corpo dell'altro muro
    let n = a.perp();
    let lato_altro = e.dot(n);
    if lato_altro.abs() < 1e-6 {
        return (0.0, 0.0); // muri in linea
    }
    let h = m.spessore / 2.0;
    let k = muri[j].spessore / 2.0;
    let en = e.perp();
    // t lungo `a` dove la faccia a distanza s·h incontra le due facce dell'altro muro.
    let incontro = |s: f64| -> Vec<f64> {
        [k, -k]
            .iter()
            .filter_map(|&o| {
                cadcraft_geom::line_line_infinite(p + n * (s * h), p + n * (s * h) + a, p + en * o, p + en * o + e)
                    .map(|(x, _, _)| (x - p).dot(a))
            })
            .collect()
    };
    let scegli = |s: f64| -> f64 {
        let ts = incontro(s);
        let interna = (s > 0.0) == (lato_altro > 0.0);
        let t = if interna { ts.iter().cloned().fold(f64::MIN, f64::max) } else { ts.iter().cloned().fold(f64::MAX, f64::min) };
        if t.is_finite() { t } else { 0.0 }
    };
    // Faccia sinistra (s=+1) e destra (s=-1) rispetto ad `a`.
    let (sin, des) = (scegli(1.0), scegli(-1.0));
    if inizio { (sin, des) } else { (des, sin) } // dal lato p2 sinistra e destra si scambiano
}

fn facce(muri: &[Muro], i: usize) -> Facce {
    let len = v(muri[i].p1).dist(v(muri[i].p2));
    let (s0, d0) = giunto(muri, i, true);
    let (s1, d1) = giunto(muri, i, false);
    // Dal lato p2 il parametro cresce verso p1: lo riportiamo all'asse p1→p2.
    Facce { sx: (s0, len - s1), dx: (d0, len - d1) }
}

fn stile_quote(scala: f64) -> DimStyle {
    DimStyle {
        name: "EIC-CM".into(),
        // Quote ISO-25 (2,5 mm sulla carta) in un disegno in cm stampato a 1:scala.
        scale: scala / 10.0,
        decimals: 0,
        decimal_separator: ",".into(),
        ..DimStyle::iso25()
    }
}

fn strato(d: &mut Drawing, nome: &str, aci: u8) {
    d.layers.retain(|l| l.name != nome);
    d.layers.push(Layer { name: nome.into(), color: Color::Index(aci), ..Layer::default() });
}

pub fn disegno(p: &Pianta) -> Result<Drawing, String> {
    let mut d = Drawing::new_metric();
    d.header.set_i64("INSUNITS", 5); // centimetri
    d.header.set_f64("DIMSCALE", p.scala / 10.0);
    d.dim_styles.push(stile_quote(p.scala));
    d.header.set_str("DIMSTYLE", "EIC-CM");
    for (n, c) in [
        (Strati::MURI, 7),
        (Strati::DEMOLIRE, 2),
        (Strati::NUOVI, 1),
        (Strati::PORTE, 3),
        (Strati::FINESTRE, 4),
        (Strati::TESTI, 7),
        (Strati::QUOTE, 8),
    ] {
        strato(&mut d, n, c);
    }
    let sp = Space::Model;
    let add = |d: &mut Drawing, c: Common, k: EntityKind| d.add(&sp, c, k).map(|_| ()).map_err(|e| e.to_string());

    for (i, m) in p.muri.iter().enumerate() {
        let (a, b) = (v(m.p1), v(m.p2));
        let len = a.dist(b);
        if len < TOL || m.spessore <= 0.0 {
            return Err(format!("muro {}: lunghezza o spessore non validi", m.id));
        }
        let dir = (b - a).normalized();
        let n = dir.perp();
        let h = m.spessore / 2.0;
        let f = facce(&p.muri, i);
        // Tratti pieni fra le aperture.
        let mut buchi: Vec<(f64, f64)> = p
            .aperture
            .iter()
            .filter(|o| o.muro == m.id)
            .map(|o| (o.distanza.max(0.0), (o.distanza + o.larghezza).min(len)))
            .collect();
        buchi.sort_by(|x, y| x.0.total_cmp(&y.0));
        let mut tratti = Vec::new();
        let mut da = None; // None = testa del muro (usa i giunti)
        for &(x0, x1) in &buchi {
            tratti.push((da, Some(x0)));
            da = Some(x1);
        }
        tratti.push((da, None));
        let (layer, aci) = match m.stato {
            Stato::Esistente => (Strati::MURI, 8),
            Stato::DaDemolire => (Strati::DEMOLIRE, 2),
            Stato::Nuovo => (Strati::NUOVI, 1),
        };
        for (t0, t1) in tratti {
            let (s0, d0) = t0.map_or((f.sx.0, f.dx.0), |t| (t, t));
            let (s1, d1) = t1.map_or((f.sx.1, f.dx.1), |t| (t, t));
            if s1 - s0 < 1e-6 && d1 - d0 < 1e-6 {
                continue;
            }
            let poligono = [a + dir * s0 + n * h, a + dir * s1 + n * h, a + dir * d1 - n * h, a + dir * d0 - n * h];
            let vertici: Vec<PolyVertex> =
                poligono.iter().map(|&p| PolyVertex { p, bulge: 0.0, start_width: 0.0, end_width: 0.0 }).collect();
            add(
                &mut d,
                colorato(layer, aci),
                EntityKind::Hatch(Hatch {
                    pattern: "SOLID".into(),
                    solid: true,
                    loops: vec![HatchLoop { vertices: vertici.clone(), outer: true, sources: Vec::new() }],
                    scale: 1.0,
                    angle: 0.0,
                    associative: false,
                    style: 0,
                    elevation: 0.0,
                    gradient: None,
                    origin: Vec2::ZERO,
                    background: None,
                    pattern_lines: Vec::new(),
                }),
            )?;
            add(
                &mut d,
                sul(layer),
                EntityKind::LwPolyline(LwPolyline { vertices: vertici, closed: true, const_width: 0.0, elevation: 0.0, plinegen: false }),
            )?;
        }
    }

    for o in &p.aperture {
        let m = p.muri.iter().find(|m| m.id == o.muro).ok_or_else(|| format!("apertura sul muro «{}» che non esiste", o.muro))?;
        let (a, b) = (v(m.p1), v(m.p2));
        let dir = (b - a).normalized();
        let n = dir.perp();
        let h = m.spessore / 2.0;
        let (x0, x1) = (o.distanza, o.distanza + o.larghezza);
        let line = |p: Vec2, q: Vec2| EntityKind::Line(Line { a: p.to3(0.0), b: q.to3(0.0) });
        if o.tipo != TipoApertura::Porta {
            // Vetro: due linee parallele all'asse dentro lo spessore.
            for s in [-h / 3.0, h / 3.0] {
                add(&mut d, sul(Strati::FINESTRE), line(a + dir * x0 + n * s, a + dir * x1 + n * s))?;
            }
            for x in [x0, x1] {
                add(&mut d, sul(Strati::FINESTRE), line(a + dir * x + n * h, a + dir * x - n * h))?;
            }
        }
        if o.tipo != TipoApertura::Finestra {
            let lato = if o.apre_verso == Lato::Sinistra { 1.0 } else { -1.0 };
            let (xc, xa) = if o.cerniera_fine { (x1, x0) } else { (x0, x1) };
            let cerniera = a + dir * xc + n * (lato * h);
            let anta = cerniera + n * (lato * o.larghezza);
            add(&mut d, sul(Strati::PORTE), line(cerniera, anta))?;
            let chiusa = (a + dir * xa + n * (lato * h)) - cerniera;
            let (ang_anta, ang_chiusa) = ((anta - cerniera).angle(), chiusa.angle());
            let giro = (ang_chiusa - ang_anta).rem_euclid(std::f64::consts::TAU);
            let (start, end) = if giro < std::f64::consts::PI { (ang_anta, ang_chiusa) } else { (ang_chiusa, ang_anta) };
            add(&mut d, sul(Strati::PORTE), EntityKind::Arc(Arc { center: cerniera.to3(0.0), radius: o.larghezza, start, end }))?;
        }
    }

    for t in &p.testi {
        add(
            &mut d,
            sul(Strati::TESTI),
            EntityKind::Text(Text {
                insert: v(t.p).to3(0.0),
                align_pt: Some(v(t.p).to3(0.0)),
                height: t.altezza,
                value: t.testo.clone(),
                rotation: 0.0,
                width_factor: 1.0,
                oblique: 0.0,
                style: "Standard".into(),
                halign: HAlign::Center,
                valign: VAlign::Middle,
            }),
        )?;
    }

    for q in &p.quote {
        let (a, b) = (v(q.p1), v(q.p2));
        let n = (b - a).normalized().perp();
        add(
            &mut d,
            sul(Strati::QUOTE),
            EntityKind::Dimension(Dimension {
                kind: DimKind::Aligned,
                defpt: (b + n * q.distanza).to3(0.0),
                text_mid: Vec3::ZERO,
                p13: a.to3(0.0),
                p14: b.to3(0.0),
                p15: Vec3::ZERO,
                p16: Vec3::ZERO,
                text: String::new(),
                style: "EIC-CM".into(),
                measurement: a.dist(b),
                text_rotation: 0.0,
                user_text_pos: false,
                block: None,
                overrides: Default::default(),
                assoc: Vec::new(),
                marks: Default::default(),
            }),
        )?;
    }
    Ok(d)
}

fn pianta(json: &str) -> Result<Pianta, String> {
    serde_json::from_str(json).map_err(|e| format!("pianta non valida: {e}"))
}

// ---------------------------------------------------------------------------------------------
// DXF → entità semplici (sfondo da ricalcare)
// ---------------------------------------------------------------------------------------------

fn punti(v: &[Vec2]) -> Value {
    Value::Array(v.iter().map(|p| json!([(p.x * 100.0).round() / 100.0, (p.y * 100.0).round() / 100.0])).collect())
}

pub fn leggi(bytes: &[u8]) -> Result<Value, String> {
    let d = cadcraft_io::read_dxf(bytes).map_err(|e| format!("DXF non leggibile: {e}"))?;
    let mut entita = Vec::new();
    let mut conteggi = std::collections::BTreeMap::<String, usize>::new();
    for e in d.model.iter() {
        *conteggi.entry(e.kind.type_name().to_string()).or_default() += 1;
        let layer = e.common.layer.clone();
        match &e.kind {
            EntityKind::Text(t) => entita.push(json!({"tipo": "testo", "layer": layer, "p": punti(&[t.insert.xy()])[0], "testo": t.value, "altezza": t.height})),
            EntityKind::MText(t) => entita.push(json!({"tipo": "testo", "layer": layer, "p": punti(&[t.insert.xy()])[0], "testo": t.contents, "altezza": t.height})),
            EntityKind::Insert(_) | EntityKind::Dimension(_) | EntityKind::Hatch(_) => {} // nello SVG
            k => {
                for prim in k.prims() {
                    let mut pts = Vec::new();
                    match prim {
                        Prim::Seg(s) => s.tessellate(1.0, &mut pts),
                        Prim::Circle(c) => c.tessellate(1.0, &mut pts),
                        Prim::Ellipse(el) => el.tessellate(1.0, &mut pts),
                        Prim::Spline(sp) => pts = sp.tessellate(1.0),
                        Prim::Fill(f) => pts = f,
                        Prim::Point(_) | Prim::Infinite { .. } => {}
                    }
                    if pts.len() >= 2 {
                        entita.push(json!({"tipo": "linea", "layer": layer, "punti": punti(&pts)}));
                    }
                }
            }
        }
    }
    let b = d.extents(&Space::Model);
    Ok(json!({
        "unita": d.header.i64("INSUNITS", 0),
        "limiti": if b.is_empty() { Value::Null } else { json!({"min": [b.min.x, b.min.y], "max": [b.max.x, b.max.y]}) },
        "layer": d.layers.iter().map(|l| l.name.clone()).collect::<Vec<_>>(),
        "conteggi": conteggi,
        "entita": entita,
        "svg": cadcraft_io::svg::export(&d, &Space::Model),
    }))
}

// ---------------------------------------------------------------------------------------------
// Interfaccia per il browser
// ---------------------------------------------------------------------------------------------

#[wasm_bindgen]
pub fn scrivi_dxf(json_pianta: &str) -> Result<String, JsError> {
    let d = disegno(&pianta(json_pianta).map_err(|e| JsError::new(&e))?).map_err(|e| JsError::new(&e))?;
    Ok(cadcraft_io::write_dxf(&d))
}

#[wasm_bindgen]
pub fn esporta_svg(json_pianta: &str) -> Result<String, JsError> {
    let d = disegno(&pianta(json_pianta).map_err(|e| JsError::new(&e))?).map_err(|e| JsError::new(&e))?;
    Ok(cadcraft_io::svg::export(&d, &Space::Model))
}

#[wasm_bindgen]
pub fn leggi_dxf(testo_dxf: &str) -> Result<String, JsError> {
    leggi(testo_dxf.as_bytes()).map(|v| v.to_string()).map_err(|e| JsError::new(&e))
}

/// PDF in scala. `opzioni`: JSON di `cadcraft_io::plot`, es. `{"paper":"A3","landscape":true,"fit":false,"scale":0.1}`
/// (scala = mm di carta per unità di disegno: in cm a 1:100 è 0,1).
#[cfg(feature = "pdf")]
#[wasm_bindgen]
pub fn esporta_pdf(json_pianta: &str, opzioni: &str) -> Result<Vec<u8>, JsError> {
    let d = disegno(&pianta(json_pianta).map_err(|e| JsError::new(&e))?).map_err(|e| JsError::new(&e))?;
    let mut o: Value = serde_json::from_str(opzioni).map_err(|e| JsError::new(&e.to_string()))?;
    o["output"] = json!("pdf");
    cadcraft_io::plot(&d, &Space::Model, &o).map_err(|e| JsError::new(&e.to_string()))
}

// ---------------------------------------------------------------------------------------------
// Fase 6: un disegno già fatto di entità (le esportazioni lo preparano in TypeScript)
// ---------------------------------------------------------------------------------------------
//
// Le esportazioni 2D (`src/lib/planimetrie/esporta`) costruiscono la pianta come una scena di
// linee, polilinee, archi, scritte e pieni, ognuno sul suo layer (muri, aperture, quote, testi,
// arredi, demolizioni, nuovo). `scrivi_entita` la passa così com'è a `cadcraft_io::write_dxf`:
// la geometria la decide la scena (uguale per PDF, SVG, PNG e DXF), il formato lo scrive cadcraft.
// Coordinate già nell'unità del file, y verso l'alto, angoli in gradi antiorari.

#[derive(Deserialize)]
pub struct DisegnoEntita {
    /// Codice $INSUNITS: 5 cm, 6 m, 4 mm.
    #[serde(default = "cinque")]
    pub unita: i64,
    pub layer: Vec<LayerEntita>,
    pub entita: Vec<Entita>,
}

#[derive(Deserialize)]
pub struct LayerEntita {
    pub nome: String,
    pub colore: u8,
}

#[derive(Deserialize)]
#[serde(tag = "tipo", rename_all = "snake_case")]
pub enum Entita {
    Linea { layer: String, a: [f64; 2], b: [f64; 2] },
    Polilinea { layer: String, punti: Vec<[f64; 2]>, chiusa: bool },
    Arco { layer: String, centro: [f64; 2], raggio: f64, inizio: f64, fine: f64 },
    Cerchio { layer: String, centro: [f64; 2], raggio: f64 },
    Testo {
        layer: String,
        p: [f64; 2],
        testo: String,
        altezza: f64,
        #[serde(default)]
        rotazione: f64,
        #[serde(default)]
        orizzontale: String,
        #[serde(default)]
        verticale: String,
    },
    Pieno { layer: String, punti: Vec<[f64; 2]> },
}

fn cinque() -> i64 {
    5
}

fn vertici(punti: &[[f64; 2]]) -> Vec<PolyVertex> {
    punti.iter().map(|&p| PolyVertex { p: v(p), bulge: 0.0, start_width: 0.0, end_width: 0.0 }).collect()
}

pub fn disegno_entita(e: &DisegnoEntita) -> Result<Drawing, String> {
    let mut d = Drawing::new_metric();
    d.header.set_i64("INSUNITS", e.unita);
    for l in &e.layer {
        strato(&mut d, &l.nome, l.colore);
    }
    let sp = Space::Model;
    let add = |d: &mut Drawing, c: Common, k: EntityKind| d.add(&sp, c, k).map(|_| ()).map_err(|e| e.to_string());
    for x in &e.entita {
        match x {
            Entita::Linea { layer, a, b } => add(&mut d, sul(layer), EntityKind::Line(Line { a: v(*a).to3(0.0), b: v(*b).to3(0.0) }))?,
            Entita::Polilinea { layer, punti, chiusa } => add(
                &mut d,
                sul(layer),
                EntityKind::LwPolyline(LwPolyline { vertices: vertici(punti), closed: *chiusa, const_width: 0.0, elevation: 0.0, plinegen: false }),
            )?,
            Entita::Arco { layer, centro, raggio, inizio, fine } => add(
                &mut d,
                sul(layer),
                EntityKind::Arc(Arc { center: v(*centro).to3(0.0), radius: *raggio, start: inizio.to_radians(), end: fine.to_radians() }),
            )?,
            Entita::Cerchio { layer, centro, raggio } => {
                add(&mut d, sul(layer), EntityKind::Circle(cadcraft_doc::Circle { center: v(*centro).to3(0.0), radius: *raggio }))?
            }
            Entita::Testo { layer, p, testo, altezza, rotazione, orizzontale, verticale } => {
                let halign = match orizzontale.as_str() {
                    "centro" => HAlign::Center,
                    "destra" => HAlign::Right,
                    _ => HAlign::Left,
                };
                let valign = match verticale.as_str() {
                    "centro" => VAlign::Middle,
                    "alto" => VAlign::Top,
                    _ => VAlign::Baseline,
                };
                let allineato = halign != HAlign::Left || valign != VAlign::Baseline;
                add(
                    &mut d,
                    sul(layer),
                    EntityKind::Text(Text {
                        insert: v(*p).to3(0.0),
                        align_pt: if allineato { Some(v(*p).to3(0.0)) } else { None },
                        height: *altezza,
                        value: testo.clone(),
                        rotation: rotazione.to_radians(),
                        width_factor: 1.0,
                        oblique: 0.0,
                        style: "Standard".into(),
                        halign,
                        valign,
                    }),
                )?
            }
            Entita::Pieno { layer, punti } => add(
                &mut d,
                sul(layer),
                EntityKind::Hatch(Hatch {
                    pattern: "SOLID".into(),
                    solid: true,
                    loops: vec![HatchLoop { vertices: vertici(punti), outer: true, sources: Vec::new() }],
                    scale: 1.0,
                    angle: 0.0,
                    associative: false,
                    style: 0,
                    elevation: 0.0,
                    gradient: None,
                    origin: Vec2::ZERO,
                    background: None,
                    pattern_lines: Vec::new(),
                }),
            )?,
        }
    }
    Ok(d)
}

#[wasm_bindgen]
pub fn scrivi_entita(json_disegno: &str) -> Result<String, JsError> {
    let e: DisegnoEntita = serde_json::from_str(json_disegno).map_err(|e| JsError::new(&format!("disegno non valido: {e}")))?;
    let d = disegno_entita(&e).map_err(|e| JsError::new(&e))?;
    Ok(cadcraft_io::write_dxf(&d))
}
