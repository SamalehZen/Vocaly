import { execFile, exec } from 'child_process'
import { promisify } from 'util'
import { getNativeBinaryPath } from './native-interface'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

export type BrowserUrlInfo = {
  url: string | null
  domain: string | null
  browser: string | null
}

const NATIVE_MODULE_NAME = 'browser-url-reader'

export async function getBrowserUrl(activeWindow: {
  appName: string
} | null): Promise<BrowserUrlInfo> {
  const nullResult: BrowserUrlInfo = { url: null, domain: null, browser: null }

  if (!activeWindow) return nullResult

  try {
    const result = await getBrowserUrlNative()
    if (result.url) {
      console.log('[BrowserUrl] Got URL from native binary:', result.domain)
      return result
    }
  } catch (error) {
    console.warn('[BrowserUrl] Native binary failed, trying fallback:', error)
  }

  try {
    const result = await getBrowserUrlFallback(activeWindow.appName)
    if (result.url) {
      console.log('[BrowserUrl] Got URL from fallback:', result.domain)
    }
    return result
  } catch (error) {
    console.error('[BrowserUrl] Fallback also failed:', error)
    return nullResult
  }
}

async function getBrowserUrlNative(): Promise<BrowserUrlInfo> {
  const binaryPath = getNativeBinaryPath(NATIVE_MODULE_NAME)
  if (!binaryPath) {
    throw new Error('Native binary not found')
  }

  const { stdout } = await execFileAsync(binaryPath, [], { timeout: 200 })
  const result = JSON.parse(stdout.trim())

  return {
    url: result.url || null,
    domain: result.domain || null,
    browser: result.browser || null,
  }
}

async function getBrowserUrlFallback(appName: string): Promise<BrowserUrlInfo> {
  const platform = process.platform
  const nullResult: BrowserUrlInfo = { url: null, domain: null, browser: null }

  if (platform === 'win32') {
    return getBrowserUrlPowerShellHidden(appName)
  } else if (platform === 'darwin') {
    return getBrowserUrlAppleScript(appName)
  }

  return nullResult
}

async function getBrowserUrlPowerShellHidden(
  appName: string,
): Promise<BrowserUrlInfo> {
  const nullResult: BrowserUrlInfo = { url: null, domain: null, browser: null }

  const browserProcessMap: Record<string, string> = {
    'google chrome': 'chrome',
    firefox: 'firefox',
    'microsoft edge': 'msedge',
    brave: 'brave',
    opera: 'opera',
    vivaldi: 'vivaldi',
  }

  const lowerAppName = appName.toLowerCase()
  let processName: string | null = null
  let browserName: string | null = null

  for (const [browser, proc] of Object.entries(browserProcessMap)) {
    if (lowerAppName.includes(browser)) {
      processName = proc
      browserName = appName
      break
    }
  }

  if (!processName) return nullResult

  const script = `
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $process = Get-Process -Name "${processName}" -ErrorAction SilentlyContinue | 
      Where-Object { $_.MainWindowHandle -ne 0 } | 
      Select-Object -First 1
    if (-not $process) { exit 0 }
    try {
      $element = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
      $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit
      )
      $addressBar = $element.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
      if ($addressBar) {
        $pattern = $addressBar.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        Write-Output $pattern.Current.Value
      }
    } catch { }
  `
    .trim()
    .replace(/\n/g, ' ')

  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "${script.replace(/"/g, '\\"')}"`,
      {
        timeout: 300,
        windowsHide: true,
      },
    )

    const url = stdout.trim()
    if (!url) return { url: null, domain: null, browser: browserName }

    const normalizedUrl = normalizeUrl(url)
    const domain = extractDomain(normalizedUrl)

    return { url: normalizedUrl, domain, browser: browserName }
  } catch (error) {
    console.warn('[BrowserUrl] PowerShell fallback failed:', error)
    return { url: null, domain: null, browser: browserName }
  }
}

async function getBrowserUrlAppleScript(
  appName: string,
): Promise<BrowserUrlInfo> {
  const nullResult: BrowserUrlInfo = { url: null, domain: null, browser: null }

  const scripts: Record<string, string> = {
    'Google Chrome':
      'tell application "Google Chrome" to get URL of active tab of front window',
    Safari:
      'tell application "Safari" to get URL of current tab of front window',
    Firefox:
      'tell application "System Events" to tell process "Firefox" to get value of attribute "AXValue" of text field 1 of toolbar 1 of window 1',
    Arc: 'tell application "Arc" to get URL of active tab of front window',
    'Microsoft Edge':
      'tell application "Microsoft Edge" to get URL of active tab of front window',
    'Brave Browser':
      'tell application "Brave Browser" to get URL of active tab of front window',
    Opera:
      'tell application "Opera" to get URL of active tab of front window',
    Vivaldi:
      'tell application "Vivaldi" to get URL of active tab of front window',
  }

  let script: string | null = null
  let browserName: string | null = null
  const lowerAppName = appName.toLowerCase()

  for (const [browser, s] of Object.entries(scripts)) {
    if (lowerAppName.includes(browser.toLowerCase())) {
      script = s
      browserName = browser
      break
    }
  }

  if (!script) return nullResult

  try {
    const { stdout } = await execAsync(
      `osascript -e '${script.replace(/'/g, "'\\''")}'`,
      { timeout: 200 },
    )

    const url = stdout.trim()
    if (!url || url.startsWith('missing value'))
      return { url: null, domain: null, browser: browserName }

    const normalizedUrl = normalizeUrl(url)
    const domain = extractDomain(normalizedUrl)

    return { url: normalizedUrl, domain, browser: browserName }
  } catch (error) {
    console.warn('[BrowserUrl] AppleScript fallback failed:', error)
    return { url: null, domain: null, browser: browserName }
  }
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    return `https://${trimmed}`
  }
  return trimmed
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
