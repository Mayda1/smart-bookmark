import Vision

if #available(macOS 11.0, *) {
    let request = VNRecognizeTextRequest()
    if let supported = try? request.supportedRecognitionLanguages() {
        print("Supported languages: \(supported)")
    }
}
