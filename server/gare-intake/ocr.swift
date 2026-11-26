import Foundation
import AppKit
import PDFKit
import Vision

// One page per invocation: the caller persists each completed page before
// proceeding. Recognition never makes network requests.
guard CommandLine.arguments.count == 3 else { exit(2) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let number = Int(CommandLine.arguments[2]) ?? 1
var image: NSImage?
if let pdf = PDFDocument(url: url) {
    image = pdf.page(at: number - 1)?.thumbnail(of: NSSize(width: 1800, height: 2546), for: .mediaBox)
} else { image = NSImage(contentsOf: url) }
guard let cgImage = image?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(3) }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["it-IT", "en-US"]
request.usesLanguageCorrection = true
try VNImageRequestHandler(cgImage: cgImage).perform([request])
let lines = (request.results ?? []).compactMap { item -> [String: Any]? in
    guard let candidate = item.topCandidates(1).first else { return nil }
    return ["text": candidate.string, "confidence": candidate.confidence]
}
let result: [String: Any] = ["text": lines.compactMap { $0["text"] as? String }.joined(separator: "\n"),
    "confidence": lines.isEmpty ? 0 : lines.compactMap { $0["confidence"] as? Float }.reduce(0, +) / Float(lines.count)]
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result))
