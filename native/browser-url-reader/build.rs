fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = tauri_winres::WindowsResource::new();

        res.set_manifest_file("browser-url-reader.manifest");
        res.set("FileDescription", "Browser URL Reader - Extracts active browser tab URL for accessibility and productivity applications");
        res.set("ProductName", "Browser URL Reader - Accessibility Tool");
        res.set("CompanyName", "Demox Labs");
        res.set(
            "LegalCopyright",
            "Copyright © 2025 Demox Labs. All rights reserved.",
        );
        res.set("FileVersion", "0.1.0.0");
        res.set("ProductVersion", "0.1.0.0");
        res.set("InternalName", "browser-url-reader");
        res.set("OriginalFilename", "browser-url-reader.exe");
        res.set(
            "Comments",
            "Accessibility utility for browser URL extraction via UI Automation",
        );

        res.compile().unwrap();
    }
}
