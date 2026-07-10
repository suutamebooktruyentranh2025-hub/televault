import Cocoa
import FlutterMacOS

private enum SaveAsBookmarkHandler {
  static func register(messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(
      name: "com.televault.televault/save_as",
      binaryMessenger: messenger
    )
    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "createBookmark":
        guard let args = call.arguments as? [String: Any],
              let path = args["path"] as? String else {
          result(FlutterError(code: "bad_args", message: "path required", details: nil))
          return
        }
        result(createBookmark(path: path))
      case "exportWithBookmark":
        guard let args = call.arguments as? [String: Any],
              let bookmark = args["bookmark"] as? String,
              let sourcePath = args["sourcePath"] as? String,
              let relativePath = args["relativePath"] as? String else {
          result(FlutterError(code: "bad_args", message: "missing args", details: nil))
          return
        }
        do {
          result(try exportWithBookmark(
            bookmarkBase64: bookmark,
            sourcePath: sourcePath,
            relativePath: relativePath
          ))
        } catch {
          result(FlutterError(code: "export_failed", message: error.localizedDescription, details: nil))
        }
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  static func createBookmark(path: String) -> String? {
    let url = URL(fileURLWithPath: path)
    let accessed = url.startAccessingSecurityScopedResource()
    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
    do {
      let data = try url.bookmarkData(
        options: .withSecurityScope,
        includingResourceValuesForKeys: nil,
        relativeTo: nil
      )
      return data.base64EncodedString()
    } catch {
      return nil
    }
  }

  static func exportWithBookmark(
    bookmarkBase64: String,
    sourcePath: String,
    relativePath: String
  ) throws -> String {
    guard let data = Data(base64Encoded: bookmarkBase64) else {
      throw NSError(
        domain: "SaveAs",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Bookmark không hợp lệ — chọn lại thư mục Save as"]
      )
    }
    var stale = false
    let dirUrl = try URL(
      resolvingBookmarkData: data,
      options: .withSecurityScope,
      relativeTo: nil,
      bookmarkDataIsStale: &stale
    )
    if stale {
      throw NSError(
        domain: "SaveAs",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Quyền thư mục hết hạn — mở Cài đặt chọn lại Save as"]
      )
    }
    guard dirUrl.startAccessingSecurityScopedResource() else {
      throw NSError(
        domain: "SaveAs",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Không truy cập được thư mục Save as"]
      )
    }
    defer { dirUrl.stopAccessingSecurityScopedResource() }

    let src = URL(fileURLWithPath: sourcePath)
    let destUrl = uniqueDestUrl(in: dirUrl, relativePath: relativePath)
    let parent = destUrl.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
    if FileManager.default.fileExists(atPath: destUrl.path) {
      try FileManager.default.removeItem(at: destUrl)
    }
    try FileManager.default.copyItem(at: src, to: destUrl)
    return destUrl.path
  }

  static func uniqueDestUrl(in dir: URL, relativePath: String) -> URL {
    var dest = dir.appendingPathComponent(relativePath)
    if !FileManager.default.fileExists(atPath: dest.path) { return dest }
    let fileName = dest.lastPathComponent
    let parent = dest.deletingLastPathComponent()
    let nsName = fileName as NSString
    let stem = nsName.deletingPathExtension
    let ext = nsName.pathExtension
    for i in 1..<1000 {
      let candidate = ext.isEmpty ? "\(stem) (\(i))" : "\(stem) (\(i)).\(ext)"
      dest = parent.appendingPathComponent(candidate)
      if !FileManager.default.fileExists(atPath: dest.path) { return dest }
    }
    return parent.appendingPathComponent("\(stem)_\(Int(Date().timeIntervalSince1970)).\(ext)")
  }
}

private enum WindowThemeHandler {
  static func register(window: NSWindow, messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(
      name: "com.televault.televault/window",
      binaryMessenger: messenger
    )
    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "setAppearance":
        guard let args = call.arguments as? [String: Any],
              let dark = args["dark"] as? Bool else {
          result(FlutterError(code: "bad_args", message: "dark required", details: nil))
          return
        }
        applyAppearance(to: window, dark: dark)
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  static func applyAppearance(to window: NSWindow, dark: Bool) {
    if dark {
      window.appearance = NSAppearance(named: .darkAqua)
      window.backgroundColor = NSColor(red: 19 / 255, green: 19 / 255, blue: 19 / 255, alpha: 1)
    } else {
      window.appearance = NSAppearance(named: .aqua)
      window.backgroundColor = NSColor(red: 250 / 255, green: 250 / 255, blue: 250 / 255, alpha: 1)
    }
  }
}

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)
    SaveAsBookmarkHandler.register(messenger: flutterViewController.engine.binaryMessenger)
    WindowThemeHandler.register(window: self, messenger: flutterViewController.engine.binaryMessenger)

    if let displayName = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String {
      self.title = displayName
    }

    let systemDark = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
    WindowThemeHandler.applyAppearance(to: self, dark: systemDark)

    super.awakeFromNib()
  }
}
