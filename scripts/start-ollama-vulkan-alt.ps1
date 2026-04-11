$ErrorActionPreference = "Stop"

$ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
$freeFlowRoot = if ($env:FREEFLOW_HOME_DIR) { $env:FREEFLOW_HOME_DIR } else { Join-Path $HOME "FreeFlow" }
$runtimeDir = Join-Path $freeFlowRoot "AppData\Runtime"
$logFile = Join-Path $runtimeDir "ollama-vulkan-11435.log"
$pidFile = Join-Path $runtimeDir "ollama-11435.pid"
$modelsDir = "D:\Ollama_AI_model"

if (-not (Test-Path $ollamaExe)) {
  Write-Error "未找到 Ollama 可执行文件：$ollamaExe"
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

Get-NetTCPConnection -LocalPort 11435 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

if (Test-Path $logFile) {
  Remove-Item $logFile -Force
}

$runnerScript = @"
`$env:OLLAMA_VULKAN='1'
`$env:OLLAMA_HOST='127.0.0.1:11435'
`$env:OLLAMA_MODELS='$modelsDir'
& '$ollamaExe' serve *>> '$logFile'
"@

$process = Start-Process `
  -FilePath powershell.exe `
  -ArgumentList "-NoProfile", "-Command", $runnerScript `
  -WindowStyle Hidden `
  -PassThru

$process.Id | Set-Content $pidFile

Start-Sleep -Seconds 6

Write-Host "Alt Ollama PID: $($process.Id)"
Get-NetTCPConnection -LocalPort 11435 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess |
  Format-Table -AutoSize

Write-Host ""
Write-Host "日志文件：$logFile"
