$ErrorActionPreference = "Stop"

function Invoke-OllamaChatCheck {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Model
  )

  $payload = @{
    model = $Model
    messages = @(
      @{
        role = "user"
        content = "只回复 ok"
      }
    )
    stream = $false
  } | ConvertTo-Json -Depth 6

  Invoke-WebRequest `
    -Method Post `
    -Uri "http://127.0.0.1:11434/api/chat" `
    -ContentType "application/json" `
    -Body $payload `
    -UseBasicParsing | Out-Null
}

Write-Host "Ollama 版本："
ollama -v

Write-Host ""
Write-Host "用户环境变量："
Write-Host "OLLAMA_VULKAN=$([Environment]::GetEnvironmentVariable('OLLAMA_VULKAN', 'User'))"

Write-Host ""
Write-Host "显卡信息："
Get-CimInstance Win32_VideoController |
  Select-Object Name, AdapterCompatibility |
  Format-Table -AutoSize

Write-Host ""
Write-Host "触发 qwen2.5:0.5b-instruct-q4_0 推理..."
Invoke-OllamaChatCheck -Model "qwen2.5:0.5b-instruct-q4_0"
Start-Sleep -Seconds 1
ollama ps

Write-Host ""
Write-Host "触发 qwen3.5:0.8b 推理..."
Invoke-OllamaChatCheck -Model "qwen3.5:0.8b"
Start-Sleep -Seconds 1
ollama ps

Write-Host ""
Write-Host "最近日志关键字："
$log = Join-Path $env:LOCALAPPDATA "Ollama\server.log"
if (Test-Path $log) {
  Select-String -Path $log -Pattern "OLLAMA_VULKAN|experimental Vulkan support|inference compute|offloaded .* layers to GPU" |
    Select-Object -Last 20 |
    ForEach-Object { $_.Line }
} else {
  Write-Host "未找到日志文件：$log"
}
