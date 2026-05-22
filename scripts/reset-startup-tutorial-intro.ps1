# powershell -ExecutionPolicy Bypass -File "D:\FreeFlow-WorkBoard\scripts\reset-startup-tutorial-intro.ps1"

param(
  [string]$ShortcutPath = "C:\Users\lenovo\Desktop\FreeFlow-WorkBoard 开发版.lnk",
  [string]$UiSettingsPath = "",
  [switch]$NoLaunch,
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

function Resolve-FreeFlowUiSettingsPath {
  param([string]$ExplicitPath)

  if ($ExplicitPath) {
    return $ExplicitPath
  }

  $homeDir = if ($env:FREEFLOW_HOME_DIR) { $env:FREEFLOW_HOME_DIR } else { Join-Path $HOME "FreeFlow" }
  return Join-Path (Join-Path $homeDir "AppData") "ui-settings.json"
}

function Ensure-ParentDirectory {
  param([string]$TargetPath)

  $parent = Split-Path -Parent $TargetPath
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
}

function Read-UiSettings {
  param([string]$TargetPath)

  if (-not (Test-Path -LiteralPath $TargetPath)) {
    return @{
      appName = "FreeFlow"
      appSubtitle = "自由画布与 AI 工作台"
      canvasTitle = "FreeFlow 工作白板"
      canvasBoardSavePath = ""
      canvasLastOpenedBoardPath = ""
      hasShownStartupTutorial = $false
      lastTutorialIntroVersion = ""
      dismissedTutorialIntroVersion = ""
      canvasImageSavePath = ""
      updatedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    }
  }

  $raw = Get-Content -LiteralPath $TargetPath -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @{}
  }
  $parsed = $raw | ConvertFrom-Json
  $result = @{}
  if ($parsed -and $parsed.PSObject -and $parsed.PSObject.Properties) {
    foreach ($property in $parsed.PSObject.Properties) {
      $result[$property.Name] = $property.Value
    }
  }
  return $result
}

function Backup-UiSettings {
  param([string]$TargetPath)

  if (-not (Test-Path -LiteralPath $TargetPath)) {
    return $null
  }

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupPath = "$TargetPath.startup-intro-backup-$timestamp.bak"
  Copy-Item -LiteralPath $TargetPath -Destination $backupPath -Force
  return $backupPath
}

function Get-FreeFlowRunningProcesses {
  $candidates = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like "FreeFlow*" -or $_.ProcessName -like "electron*"
  }

  return @($candidates | Where-Object {
    try {
      $pathValue = $_.Path
      if (-not $pathValue) {
        return $false
      }
      return $pathValue -like "*FreeFlow*" -or $pathValue -like "*electron*"
    } catch {
      return $false
    }
  })
}

$resolvedUiSettingsPath = Resolve-FreeFlowUiSettingsPath -ExplicitPath $UiSettingsPath
Ensure-ParentDirectory -TargetPath $resolvedUiSettingsPath

$runningProcesses = Get-FreeFlowRunningProcesses
if ($runningProcesses.Count -gt 0) {
  $processSummary = ($runningProcesses | ForEach-Object { "$($_.ProcessName)#$($_.Id)" }) -join ", "
  throw "检测到 FreeFlow 仍在运行：$processSummary。请先关闭应用后再执行脚本，避免 ui-settings.json 被运行中的程序回写。"
}

$backupPath = $null
if (-not $NoBackup) {
  $backupPath = Backup-UiSettings -TargetPath $resolvedUiSettingsPath
}

$settings = Read-UiSettings -TargetPath $resolvedUiSettingsPath
$settings["hasShownStartupTutorial"] = $false
$settings["lastTutorialIntroVersion"] = ""
$settings["dismissedTutorialIntroVersion"] = ""
$settings["updatedAt"] = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()

$json = $settings | ConvertTo-Json -Depth 20
Set-Content -LiteralPath $resolvedUiSettingsPath -Value $json -Encoding UTF8

Write-Host "[reset-startup-tutorial-intro] 已重置首次说明测试状态"
Write-Host "  ui-settings: $resolvedUiSettingsPath"
if ($backupPath) {
  Write-Host "  backup:      $backupPath"
}

if (-not $NoLaunch) {
  if (-not (Test-Path -LiteralPath $ShortcutPath)) {
    throw "未找到快捷方式：$ShortcutPath"
  }
  Start-Process -FilePath $ShortcutPath | Out-Null
  Write-Host "  launched:    $ShortcutPath"
}
