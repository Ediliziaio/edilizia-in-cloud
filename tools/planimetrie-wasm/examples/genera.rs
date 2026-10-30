//! Uso nativo, per controllare l'uscita senza browser:
//! `cargo run --release --features pdf --example genera -- esempi/trilocale.json uscita/trilocale`
//! scrive `<prefisso>.dxf`, `.svg`, `.pdf` (1:100 su A3) e la rilettura del DXF in `.letto.json`.
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (ingresso, prefisso) = (&args[1], &args[2]);
    let json = std::fs::read_to_string(ingresso).expect("pianta");
    let p: planimetrie_wasm::Pianta = serde_json::from_str(&json).expect("json");
    let t = Instant::now();
    let d = planimetrie_wasm::disegno(&p).expect("disegno");
    let dxf = cadcraft_io::write_dxf(&d);
    println!("scrittura DXF: {:?}, {} byte", t.elapsed(), dxf.len());
    std::fs::write(format!("{prefisso}.dxf"), &dxf).expect("dxf");
    std::fs::write(format!("{prefisso}.svg"), cadcraft_io::svg::export(&d, &cadcraft_doc::Space::Model)).expect("svg");
    let o = serde_json::json!({"output": "pdf", "paper": "A3", "landscape": true, "fit": false, "scale": 0.1});
    std::fs::write(format!("{prefisso}.pdf"), cadcraft_io::plot(&d, &cadcraft_doc::Space::Model, &o).expect("pdf")).expect("pdf");
    let t = Instant::now();
    let letto = planimetrie_wasm::leggi(dxf.as_bytes()).expect("lettura");
    println!("lettura DXF: {:?}, {} entità", t.elapsed(), letto["entita"].as_array().map_or(0, Vec::len));
    std::fs::write(format!("{prefisso}.letto.json"), serde_json::to_string_pretty(&letto).expect("json")).expect("letto");
}
