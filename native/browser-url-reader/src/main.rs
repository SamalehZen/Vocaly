use serde::Serialize;
use serde_json::json;

#[derive(Serialize)]
struct BrowserUrlResult {
    url: Option<String>,
    domain: Option<String>,
    browser: Option<String>,
}

fn main() {
    match get_browser_url() {
        Ok(result) => {
            println!(
                "{}",
                json!({
                    "url": result.url,
                    "domain": result.domain,
                    "browser": result.browser
                })
            );
        }
        Err(e) => {
            eprintln!("{}", json!({ "error": e.to_string() }));
            std::process::exit(1);
        }
    }
}

fn normalize_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if trimmed.contains('.') && !trimmed.contains(' ') {
        format!("https://{}", trimmed)
    } else {
        trimmed.to_string()
    }
}

fn extract_domain(url: &str) -> Option<String> {
    let url = url.trim();
    let without_protocol = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or(url);

    let domain = without_protocol.split('/').next().unwrap_or("");
    let domain = domain.split('?').next().unwrap_or(domain);
    let domain = domain.split('#').next().unwrap_or(domain);
    let domain = domain.split(':').next().unwrap_or(domain);

    if domain.is_empty() || !domain.contains('.') {
        None
    } else {
        Some(domain.to_string())
    }
}

#[cfg(target_os = "windows")]
fn get_browser_url() -> Result<BrowserUrlResult, Box<dyn std::error::Error>> {
    use windows::core::Interface;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    use windows::Win32::UI::Accessibility::*;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let hwnd = GetForegroundWindow();
        if hwnd.0 == std::ptr::null_mut() {
            return Ok(BrowserUrlResult {
                url: None,
                domain: None,
                browser: None,
            });
        }

        let browser = get_browser_name_from_hwnd(hwnd)?;
        if browser.is_none() {
            return Ok(BrowserUrlResult {
                url: None,
                domain: None,
                browser: None,
            });
        }

        let automation: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;

        let element = automation.ElementFromHandle(hwnd)?;

        let condition = automation.CreatePropertyCondition(
            UIA_ControlTypePropertyId,
            &windows::core::VARIANT::from(UIA_EditControlTypeId.0 as i32),
        )?;

        if let Ok(address_bar) = element.FindFirst(TreeScope_Descendants, &condition) {
            if let Ok(pattern) = address_bar.GetCurrentPattern(UIA_ValuePatternId) {
                let value_pattern: IUIAutomationValuePattern = pattern.cast()?;
                let url_bstr = value_pattern.CurrentValue()?;
                let url = url_bstr.to_string();

                if !url.is_empty() {
                    let normalized = normalize_url(&url);
                    let domain = extract_domain(&normalized);
                    return Ok(BrowserUrlResult {
                        url: Some(normalized),
                        domain,
                        browser,
                    });
                }
            }
        }

        Ok(BrowserUrlResult {
            url: None,
            domain: None,
            browser,
        })
    }
}

#[cfg(target_os = "windows")]
fn get_browser_name_from_hwnd(hwnd: windows::Win32::Foundation::HWND) -> Result<Option<String>, Box<dyn std::error::Error>> {
    use windows::Win32::Foundation::*;
    use windows::Win32::System::Threading::*;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    unsafe {
        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));

        if process_id == 0 {
            return Ok(None);
        }

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)?;
        if handle.is_invalid() {
            return Ok(None);
        }

        let mut buffer = [0u16; 260];
        let mut size = buffer.len() as u32;

        let result = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, windows::core::PWSTR(buffer.as_mut_ptr()), &mut size);
        let _ = CloseHandle(handle);

        if result.is_err() {
            return Ok(None);
        }

        let path = OsString::from_wide(&buffer[..size as usize]);
        let path_str = path.to_string_lossy().to_lowercase();

        let browser_name = if path_str.contains("chrome") && !path_str.contains("chromium") {
            Some("Google Chrome".to_string())
        } else if path_str.contains("firefox") {
            Some("Firefox".to_string())
        } else if path_str.contains("msedge") {
            Some("Microsoft Edge".to_string())
        } else if path_str.contains("brave") {
            Some("Brave".to_string())
        } else if path_str.contains("opera") {
            Some("Opera".to_string())
        } else if path_str.contains("vivaldi") {
            Some("Vivaldi".to_string())
        } else if path_str.contains("chromium") {
            Some("Chromium".to_string())
        } else {
            None
        };

        Ok(browser_name)
    }
}

#[cfg(target_os = "macos")]
fn get_browser_url() -> Result<BrowserUrlResult, Box<dyn std::error::Error>> {
    use std::process::Command;

    let output = Command::new("osascript")
        .args(["-e", r#"tell application "System Events" to get name of first application process whose frontmost is true"#])
        .output()?;

    let app_name = String::from_utf8_lossy(&output.stdout).trim().to_string();

    let script = match app_name.as_str() {
        "Google Chrome" => r#"tell application "Google Chrome" to get URL of active tab of front window"#,
        "Safari" => r#"tell application "Safari" to get URL of current tab of front window"#,
        "Firefox" => r#"tell application "System Events" to tell process "Firefox" to get value of attribute "AXValue" of text field 1 of toolbar 1 of window 1"#,
        "Arc" => r#"tell application "Arc" to get URL of active tab of front window"#,
        "Microsoft Edge" => r#"tell application "Microsoft Edge" to get URL of active tab of front window"#,
        "Brave Browser" => r#"tell application "Brave Browser" to get URL of active tab of front window"#,
        "Opera" => r#"tell application "Opera" to get URL of active tab of front window"#,
        "Vivaldi" => r#"tell application "Vivaldi" to get URL of active tab of front window"#,
        _ => {
            return Ok(BrowserUrlResult {
                url: None,
                domain: None,
                browser: None,
            });
        }
    };

    let output = Command::new("osascript").args(["-e", script]).output()?;

    if output.status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !url.is_empty() && !url.starts_with("missing value") {
            let normalized = normalize_url(&url);
            let domain = extract_domain(&normalized);
            return Ok(BrowserUrlResult {
                url: Some(normalized),
                domain,
                browser: Some(app_name),
            });
        }
    }

    Ok(BrowserUrlResult {
        url: None,
        domain: None,
        browser: Some(app_name),
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn get_browser_url() -> Result<BrowserUrlResult, Box<dyn std::error::Error>> {
    Ok(BrowserUrlResult {
        url: None,
        domain: None,
        browser: None,
    })
}
