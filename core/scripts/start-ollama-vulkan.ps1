$ErrorActionPreference = "Stop"

$ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"

if (-not (Test-Path $ollamaExe)) {
  Write-Error "未找到 Ollama 可执行文件：$ollamaExe"
}

Write-Host "正在停止现有 Ollama 进程..."
Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "设置用户环境变量 OLLAMA_VULKAN=1"
[Environment]::SetEnvironmentVariable("OLLAMA_VULKAN", "1", "User")

$env:OLLAMA_VULKAN = "1"
$env:OLLAMA_HOST = "127.0.0.1:11434"

Write-Host "以 Vulkan 模式启动 Ollama..."
Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WorkingDirectory (Split-Path $ollamaExe) | Out-Null

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "当前环境变量："
Write-Host "OLLAMA_VULKAN=$env:OLLAMA_VULKAN"
Write-Host ""
Write-Host "当前监听端口："
Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess |
  Format-Table -AutoSize

Write-Host ""
Write-Host "接下来建议执行："
Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\check-ollama-gpu.ps1"
