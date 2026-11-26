import AVFoundation
import Capacitor
import UIKit
import Vision
import VisionKit

final class CampoBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CampoDocumentScannerPlugin())
    }
}

@objc(CampoDocumentScannerPlugin)
final class CampoDocumentScannerPlugin: CAPPlugin, CAPBridgedPlugin, VNDocumentCameraViewControllerDelegate {
    let identifier = "CampoDocumentScannerPlugin"
    let jsName = "CampoDocumentScanner"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognizePage", returnType: CAPPluginReturnPromise)
    ]

    private let lavoro = DispatchQueue(label: "com.ediliziaincloud.ddt.scanner", qos: .userInitiated)
    private let maxPagine = 12
    private let maxByte = 18 * 1024 * 1024
    private var scansioneInCorso: CAPPluginCall?

    private var deposito: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("scanner-ddt", isDirectory: true)
    }

    @objc func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard VNDocumentCameraViewController.isSupported else {
                call.reject("Scanner documenti non disponibile su questo dispositivo.", "UNAVAILABLE")
                return
            }
            guard self.scansioneInCorso == nil,
                  let controller = self.bridge?.viewController, controller.presentedViewController == nil else {
                call.reject("Chiudi la schermata aperta e riprova.", "BUSY")
                return
            }
            let autorizzazione = AVCaptureDevice.authorizationStatus(for: .video)
            guard autorizzazione != .denied && autorizzazione != .restricted else {
                call.reject("Consenti l’uso della fotocamera nelle impostazioni del telefono.", "CAMERA_DENIED")
                return
            }
            let scanner = VNDocumentCameraViewController()
            scanner.modalPresentationStyle = .fullScreen
            scanner.delegate = self
            self.scansioneInCorso = call
            controller.present(scanner, animated: true)
        }
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        let call = scansioneInCorso
        scansioneInCorso = nil
        controller.dismiss(animated: true) { call?.resolve(["cancelled": true]) }
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        let call = scansioneInCorso
        scansioneInCorso = nil
        controller.dismiss(animated: true) { call?.reject("Impossibile completare la scansione.", "SCAN_FAILED") }
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        guard let call = scansioneInCorso else {
            controller.dismiss(animated: true)
            return
        }
        let limite = min(maxPagine, max(1, call.getInt("pageLimit", maxPagine)))
        let spazio = min(maxByte, max(1, call.getInt("byteBudget", maxByte)))
        controller.dismiss(animated: true) {
            if scan.pageCount == 0 {
                self.scansioneInCorso = nil
                call.resolve(["cancelled": true])
                return
            }
            guard scan.pageCount <= limite else {
                self.scansioneInCorso = nil
                call.reject("Puoi aggiungere ancora \(limite) pagine a questo DDT.", "PAGE_LIMIT")
                return
            }
            self.lavoro.async {
                let id = UUID().uuidString.lowercased()
                let cartella = self.deposito.appendingPathComponent(id, isDirectory: true)
                do {
                    self.rimuoviScansioniScadute()
                    try FileManager.default.createDirectory(at: cartella, withIntermediateDirectories: true)
                    var rimasti = spazio
                    for indice in 0..<scan.pageCount {
                        let budget = rimasti / (scan.pageCount - indice)
                        let dati = try autoreleasepool {
                            try self.jpeg(scan.imageOfPage(at: indice), entro: budget)
                        }
                        try dati.write(to: cartella.appendingPathComponent("pagina-\(indice + 1).jpg"), options: .atomic)
                        rimasti -= dati.count
                    }
                    DispatchQueue.main.async {
                        self.scansioneInCorso = nil
                        call.resolve(["scanId": id, "pageCount": scan.pageCount])
                    }
                } catch {
                    try? FileManager.default.removeItem(at: cartella)
                    DispatchQueue.main.async {
                        self.scansioneInCorso = nil
                        if error is ScansioneTroppoGrande {
                            call.reject("Le pagine superano lo spazio disponibile per questa bolla.", "BYTE_LIMIT")
                        } else {
                            call.reject("Impossibile salvare la scansione sul telefono.", "SCAN_FAILED")
                        }
                    }
                }
            }
        }
    }

    @objc func recognizePage(_ call: CAPPluginCall) {
        guard let id = call.getString("scanId"), UUID(uuidString: id)?.uuidString.lowercased() == id,
              let indice = call.getInt("page"), (1...maxPagine).contains(indice) else {
            call.reject("Pagina della scansione non disponibile.", "INVALID_PAGE")
            return
        }
        lavoro.async {
            let pagina = self.deposito.appendingPathComponent(id).appendingPathComponent("pagina-\(indice).jpg")
            do {
                let richiesta = VNRecognizeTextRequest()
                richiesta.recognitionLevel = .accurate
                richiesta.recognitionLanguages = ["it-IT", "en-US"]
                try VNImageRequestHandler(url: pagina, options: [:]).perform([richiesta])
                let testo = (richiesta.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
                call.resolve(["text": String(testo.prefix(8000))])
            } catch {
                call.reject("Testo della pagina non disponibile.", "OCR_FAILED")
            }
        }
    }

    private struct ScansioneTroppoGrande: Error {}

    private func jpeg(_ immagine: UIImage, entro budget: Int) throws -> Data {
        let scala = min(1, 2600 / max(immagine.size.width, immagine.size.height))
        let size = CGSize(width: max(1, (immagine.size.width * scala).rounded()),
                          height: max(1, (immagine.size.height * scala).rounded()))
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        formato.opaque = true
        let pagina = UIGraphicsImageRenderer(size: size, format: formato).image { _ in
            immagine.draw(in: CGRect(origin: .zero, size: size))
        }
        for qualita: CGFloat in [0.87, 0.74, 0.60] {
            if let dati = pagina.jpegData(compressionQuality: qualita), dati.count <= budget {
                return dati
            }
        }
        throw ScansioneTroppoGrande()
    }

    private func rimuoviScansioniScadute() {
        let fm = FileManager.default
        let scadenza = Date().addingTimeInterval(-86_400)
        guard let cartelle = try? fm.contentsOfDirectory(at: deposito, includingPropertiesForKeys: [.creationDateKey]) else { return }
        for cartella in cartelle where UUID(uuidString: cartella.lastPathComponent) != nil {
            if let creata = try? cartella.resourceValues(forKeys: [.creationDateKey]).creationDate, creata < scadenza {
                try? fm.removeItem(at: cartella)
            }
        }
    }
}
