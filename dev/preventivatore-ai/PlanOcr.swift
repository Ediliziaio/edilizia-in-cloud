import Foundation
import Vision
import PDFKit
import AppKit
import ImageIO

struct TextLine: Codable {
    let text: String
    let confidence: Float
    let bbox: [Double] // normalized top-left origin, independent of thumbnail resolution
}
struct Output: Codable {
    let version: Int
    let engine: String
    let page: Int
    let pages: Int
    let width: Int
    let height: Int
    let lines: [TextLine]
}
enum Failure: Error { case invalidInput, unreadable, tooLarge, pageMissing }
do {
    guard CommandLine.arguments.count == 3, let pageNumber = Int(CommandLine.arguments[2]), pageNumber >= 1, pageNumber <= 20 else { throw Failure.invalidInput }
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size > 0 && size <= 12 * 1024 * 1024 else { throw Failure.tooLarge }
    var pages = 1
    var image: CGImage
    if url.pathExtension.lowercased() == "pdf" {
        guard let document = PDFDocument(url: url), !document.isLocked else { throw Failure.unreadable }
        pages = document.pageCount
        guard pages > 0, pages <= 20, let page = document.page(at: pageNumber - 1) else { throw Failure.pageMissing }
        let bounds = page.bounds(for: .mediaBox)
        guard bounds.width.isFinite, bounds.height.isFinite, bounds.width > 0, bounds.height > 0 else { throw Failure.unreadable }
        let scale = min(2400 / bounds.width, 2400 / bounds.height)
        let thumbnail = page.thumbnail(of: NSSize(width: bounds.width * scale, height: bounds.height * scale), for: .mediaBox)
        var rect = CGRect(origin: .zero, size: thumbnail.size)
        guard let cg = thumbnail.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { throw Failure.unreadable }
        image = cg
    } else {
        guard pageNumber == 1, let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let w = props[kCGImagePropertyPixelWidth] as? Int, let h = props[kCGImagePropertyPixelHeight] as? Int,
              w > 0, h > 0, Double(w) * Double(h) <= 40_000_000 else { throw Failure.tooLarge }
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: 2400, kCGImageSourceCreateThumbnailWithTransform: true]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { throw Failure.unreadable }
        image = cg
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["it-IT", "en-US"]
    request.usesLanguageCorrection = false // Do not silently rewrite drawing labels or decimal dimensions.
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let lines = (request.results ?? []).prefix(500).compactMap { observation -> TextLine? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return TextLine(text: String(candidate.string.prefix(500)), confidence: candidate.confidence,
            bbox: [Double(box.minX), Double(1 - box.maxY), Double(box.width), Double(box.height)])
    }
    let output = Output(version: 1, engine: "Apple Vision locale", page: pageNumber, pages: pages, width: image.width, height: image.height, lines: lines)
    let data = try JSONEncoder().encode(output)
    FileHandle.standardOutput.write(data)
} catch {
    // Never echo file paths, document contents or arbitrary OS error messages.
    FileHandle.standardError.write(Data("PLAN_UNREADABLE_OR_UNSUPPORTED".utf8))
    exit(2)
}
