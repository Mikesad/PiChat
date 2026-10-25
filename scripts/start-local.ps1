[CmdletBinding()]
param(
  [switch]$Status,
  [switch]$Stop,
  [switch]$Force,
  [switch]$SkipWorker,
  [switch]$SkipWeb,
  [switch]$WebProd,
  [switch]$RebuildWeb,
  [switch]$SkipDependencyCheck,
  [switch]$Open,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
$root = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $root ".local"
$logDir = Join-Path $stateDir "logs"
$pidDir = Join-Path $stateDir "pids"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "  OK  $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
  Write-Host "  !!  $Message" -ForegroundColor Yellow
}

function Write-Fail([string]$Message) {
  Write-Host "  XX  $Message" -ForegroundColor Red
}

function Read-EnvFile([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }
    $equals = $trimmed.IndexOf("=")
    if ($equals -lt 1) {
      continue
    }
    $name = $trimmed.Substring(0, $equals).Trim()
    $value = $trimmed.Substring($equals + 1).Trim()
    if ($value.Length -ge 2) {
      $first = $value[0]
      $last = $value[$value.Length - 1]
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    $values[$name] = $value
  }
  return $values
}

function Get-ConfiguredEndpoint([hashtable]$Config, [string]$Key, [int]$FallbackPort) {
  $value = $Config[$Key]
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $null
  }
  try {
    $uri = [uri]$value
  }
  catch {
    return $null
  }
  if (-not $uri.Host) {
    return $null
  }
  $port = if ($uri.Port -gt 0) { $uri.Port } else { $FallbackPort }
  return [pscustomobject]@{ HostName = $uri.Host; Port = $port }
}

function Get-ConfiguredPort([hashtable]$Config, [string]$Key, [int]$Fallback) {
  $port = 0
  if ([int]::TryParse([string]$Config[$Key], [ref]$port) -and $port -gt 0) {
    return $port
  }
  return $Fallback
}

function Test-TcpPort([string]$TargetHost, [int]$Port, [int]$TimeoutMs = 1500) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync($TargetHost, $Port)
    if (-not $task.Wait($TimeoutMs)) {
      return $false
    }
    return $client.Connected
  }
  catch {
    return $false
  }
  finally {
    $client.Dispose()
  }
}

function Test-HttpHealth([string]$Url, [int]$TimeoutSec = 2) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  }
  catch {
    return $false
  }
}

function Wait-HttpHealth([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpHealth -Url $Url) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-TcpPort([string]$TargetHost, [int]$Port, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort -TargetHost $TargetHost -Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Get-ServicePid([string]$Name) {
  $pidFile = Join-Path $pidDir "$Name.pid"
  if (-not (Test-Path -LiteralPath $pidFile)) {
    return $null
  }
  $processId = 0
  $raw = [string](Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue)
  if (-not [int]::TryParse($raw.Trim(), [ref]$processId)) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    return $null
  }
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    return $null
  }
  return $process
}

function Start-LocalService([string]$Name, [string]$Filter, [string]$Command) {
  $stdout = Join-Path $logDir "$Name.out.log"
  $stderr = Join-Path $logDir "$Name.err.log"
  $arguments = "/d /c `"`"$pnpmCmd`" --filter $Filter $Command`""
  $process = Start-Process -FilePath $env:ComSpec -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Set-Content -LiteralPath (Join-Path $pidDir "$Name.pid") -Value $process.Id -Encoding ascii
  return $process
}

function Stop-LocalService([string]$Name) {
  $process = Get-ServicePid -Name $Name
  if (-not $process) {
    return $false
  }
  & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
  Start-Sleep -Milliseconds 500
  $stillRunning = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
  if (-not $stillRunning) {
    Remove-Item -LiteralPath (Join-Path $pidDir "$Name.pid") -Force -ErrorAction SilentlyContinue
    return $true
  }
  return $false
}

function Get-PortOwnerPids([int]$Port) {
  $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Get-OwnerCommandLine([int]$ProcessId) {
  $info = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if ($info) {
    return [string]$info.CommandLine
  }
  return ""
}

function Stop-UntrackedPortOwner {
  param(
    [int]$Port,
    [string]$Label,
    [string[]]$Markers,
    [switch]$Force
  )
  foreach ($owner in (Get-PortOwnerPids -Port $Port)) {
    if ($owner -le 0) {
      continue
    }
    $commandLine = Get-OwnerCommandLine -ProcessId $owner
    $isPichat = $false
    foreach ($marker in $Markers) {
      if ($commandLine -and $commandLine.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $isPichat = $true
        break
      }
    }
    if (-not $isPichat -and -not $Force) {
      Write-Warn "端口 $Port 被未识别进程 PID $owner 占用，未停止。确认后可加 -Force。"
      continue
    }
    Write-Warn "端口 $Port 仍被 PID $owner 占用，正在停止（$Label）"
    & taskkill.exe /PID $owner /T /F 2>$null | Out-Null
  }
}

function Invoke-WebBuild {
  Write-Step "构建 Web"
  Push-Location -LiteralPath $root
  try {
    & $pnpmCmd --filter "@pichat/web" build
    if ($LASTEXITCODE -ne 0) {
      throw "Web build failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

function Wait-WorkerReady([int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  $log = Join-Path $logDir "worker.out.log"
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $log) {
      $text = [string](Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue)
      if ($text -match "worker_started") {
        return $true
      }
    }
    if (-not (Get-ServicePid -Name "worker")) {
      return $false
    }
    Start-Sleep -Milliseconds 500
  }
  return (Get-ServicePid -Name "worker") -ne $null
}

$config = Read-EnvFile (Join-Path $root ".env")
$apiPort = Get-ConfiguredPort $config "API_PORT" 3001
$runtimePort = Get-ConfiguredPort $config "AGENT_RUNTIME_PORT" 3002
$webPort = 3000
$apiHealth = "http://127.0.0.1:$apiPort/api/health"
$runtimeHealth = "http://127.0.0.1:$runtimePort/internal/health"
$webUrl = "http://127.0.0.1:$webPort"

if ($RebuildWeb) {
  $WebProd = $true
}

if ($Status) {
  Write-Host ""
  Write-Host "PiChat 本地服务" -ForegroundColor Cyan
  $apiState = if (Test-HttpHealth -Url $apiHealth) { "运行中" } elseif (Test-TcpPort "127.0.0.1" $apiPort) { "端口占用" } else { "未运行" }
  $runtimeState = if (Test-HttpHealth -Url $runtimeHealth) { "运行中" } elseif (Test-TcpPort "127.0.0.1" $runtimePort) { "端口占用" } else { "未运行" }
  $webState = if (Test-TcpPort "127.0.0.1" $webPort) { "运行中" } else { "未运行" }
  $workerProcess = Get-ServicePid -Name "worker"
  $workerState = if ($workerProcess) { "运行中 (PID $($workerProcess.Id))" } else { "未运行" }
  Write-Host ("  {0,-8} {1,-36} {2}" -f "Web", $webUrl, $webState)
  Write-Host ("  {0,-8} {1,-36} {2}" -f "API", $apiHealth, $apiState)
  Write-Host ("  {0,-8} {1,-36} {2}" -f "Runtime", $runtimeHealth, $runtimeState)
  Write-Host ("  {0,-8} {1,-36} {2}" -f "Worker", "-", $workerState)
  Write-Host ""
  Write-Host "依赖（Docker Desktop / 本机）" -ForegroundColor Cyan
  $dependencies = @(
    @{ Label = "MySQL"; Key = "DATABASE_URL"; Port = 3306 },
    @{ Label = "Redis"; Key = "REDIS_URL"; Port = 6379 },
    @{ Label = "RAGFlow"; Key = "RAGFLOW_BASE_URL"; Port = 9380 }
  )
  foreach ($dependency in $dependencies) {
    $endpoint = Get-ConfiguredEndpoint $config $dependency.Key $dependency.Port
    if (-not $endpoint) {
      Write-Host ("  {0,-8} {1}" -f $dependency.Label, "未配置") -ForegroundColor Yellow
      continue
    }
    $state = if (Test-TcpPort $endpoint.HostName $endpoint.Port) { "可达" } else { "不可达" }
    $color = if ($state -eq "可达") { "Green" } else { "Red" }
    Write-Host ("  {0,-8} {1}:{2}  {3}" -f $dependency.Label, $endpoint.HostName, $endpoint.Port, $state) -ForegroundColor $color
  }
  Write-Host ""
  exit 0
}

if ($Stop) {
  Write-Step "停止 PiChat 本地服务"
  $stopped = 0
  foreach ($name in @("web", "worker", "agent-runtime", "api")) {
    if (Stop-LocalService -Name $name) {
      Write-Ok "$name 已停止"
      $stopped++
    }
  }
  if ($stopped -eq 0) {
    Write-Warn "没有本脚本记录的运行进程"
  }
  Start-Sleep -Milliseconds 500
  Stop-UntrackedPortOwner -Port $webPort -Label "Web" -Markers @("apps\web", "apps/web", "next") -Force:$Force
  Stop-UntrackedPortOwner -Port $apiPort -Label "API" -Markers @("apps\api", "apps/api", "dist\main", "dist/main", "nest") -Force:$Force
  Stop-UntrackedPortOwner -Port $runtimePort -Label "Runtime" -Markers @("src\server.ts", "src/server.ts", "agent-runtime") -Force:$Force
  Start-Sleep -Milliseconds 500
  $remaining = @()
  if (Test-HttpHealth -Url $apiHealth) { $remaining += "API" }
  if (Test-HttpHealth -Url $runtimeHealth) { $remaining += "Runtime" }
  if (Test-TcpPort "127.0.0.1" $webPort) { $remaining += "Web" }
  if (Get-ServicePid -Name "worker") { $remaining += "Worker" }
  if ($remaining.Count -gt 0) {
    Write-Warn "仍在运行（未自动处理）：$($remaining -join ', ')"
  }
  exit 0
}

Write-Step "检查环境"
if (-not (Test-Path -LiteralPath (Join-Path $root ".env"))) {
  Write-Fail "缺少 .env。先复制 .env.example 并填写本机配置。"
  exit 1
}
if (-not $SkipWeb -and -not (Test-Path -LiteralPath (Join-Path $root "apps/web/.env.local"))) {
  Write-Fail "缺少 apps/web/.env.local。先复制 apps/web/.env.local.example。"
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules"))) {
  Write-Fail "缺少 node_modules。先运行 pnpm install。"
  exit 1
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Fail "未找到 node。需要 Node.js >= 22.22.3。"
  exit 1
}
$nodeVersion = $null
if (-not [version]::TryParse((& node --version).Trim().TrimStart("v"), [ref]$nodeVersion) -or $nodeVersion -lt [version]"22.22.3") {
  Write-Fail "Node.js 版本过低，需要 >= 22.22.3。"
  exit 1
}
Write-Ok "Node.js $nodeVersion"

$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpmCommand) {
  $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
}
if (-not $pnpmCommand) {
  Write-Fail "未找到 pnpm。需要 pnpm >= 10.8.0。"
  exit 1
}
$pnpmCmd = $pnpmCommand.Source
$pnpmVersion = $null
if (-not [version]::TryParse([string](& $pnpmCmd --version | Select-Object -First 1).Trim(), [ref]$pnpmVersion) -or $pnpmVersion -lt [version]"10.8.0") {
  Write-Fail "pnpm 版本过低，需要 >= 10.8.0。"
  exit 1
}
Write-Ok "pnpm $pnpmVersion"

$requiredKeys = @("DATABASE_URL", "INTERNAL_SHARED_SECRET", "MODEL_CONFIG_ENCRYPTION_KEY")
if (-not $SkipWorker) {
  $requiredKeys += @("RAGFLOW_BASE_URL", "RAGFLOW_API_KEY")
}
$missingKeys = @($requiredKeys | Where-Object { [string]::IsNullOrWhiteSpace($config[$_]) })
if ($missingKeys.Count -gt 0) {
  Write-Fail "缺少配置：$($missingKeys -join ', ')"
  exit 1
}
Write-Ok ".env 关键配置齐全"

if (-not $SkipDependencyCheck) {
  Write-Step "检查依赖"
  $dependencies = @(
    @{ Label = "MySQL"; Key = "DATABASE_URL"; Port = 3306; Hint = "本机或 Docker 中的 MySQL 服务" },
    @{ Label = "Redis"; Key = "REDIS_URL"; Port = 6379; Hint = "Docker Desktop 中的 pichat-redis-1" },
    @{ Label = "RAGFlow"; Key = "RAGFLOW_BASE_URL"; Port = 9380; Hint = "Docker Desktop 中的 RAGFlow 容器" }
  )
  $failed = @()
  foreach ($dependency in $dependencies) {
    $endpoint = Get-ConfiguredEndpoint $config $dependency.Key $dependency.Port
    if (-not $endpoint) {
      Write-Fail "$($dependency.Label)：$($dependency.Key) 未配置"
      $failed += $dependency.Label
      continue
    }
    if (Test-TcpPort $endpoint.HostName $endpoint.Port) {
      Write-Ok "$($dependency.Label) $($endpoint.HostName):$($endpoint.Port)"
    }
    else {
      Write-Fail "$($dependency.Label) $($endpoint.HostName):$($endpoint.Port) 不可达（$($dependency.Hint)）"
      $failed += $dependency.Label
    }
  }
  if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "请先在 Docker Desktop 启动 Redis / RAGFlow（以及使用 Docker 时的 MySQL），或确认本机 MySQL 已运行。" -ForegroundColor Yellow
    exit 1
  }
}
else {
  Write-Warn "已跳过依赖检查"
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
New-Item -ItemType Directory -Path $pidDir -Force | Out-Null

Write-Step "启动服务"

if (Test-HttpHealth -Url $apiHealth) {
  Write-Warn "API 已在运行，跳过启动"
}
elseif (Test-TcpPort "127.0.0.1" $apiPort) {
  Write-Fail "端口 $apiPort 已被占用，但 API 健康检查失败。请先停止占用进程。"
  exit 1
}
else {
  $process = Start-LocalService -Name "api" -Filter "@pichat/api" -Command "dev"
  Write-Ok "API 启动中 (PID $($process.Id))"
  if (-not (Wait-HttpHealth -Url $apiHealth -Seconds $TimeoutSeconds)) {
    Write-Fail "API 启动超时。查看 .local/logs/api.out.log 与 api.err.log"
    exit 1
  }
  Write-Ok "API 健康检查通过"
}

if (Test-HttpHealth -Url $runtimeHealth) {
  Write-Warn "Agent Runtime 已在运行，跳过启动"
}
elseif (Test-TcpPort "127.0.0.1" $runtimePort) {
  Write-Fail "端口 $runtimePort 已被占用，但 Runtime 健康检查失败。请先停止占用进程。"
  exit 1
}
else {
  $process = Start-LocalService -Name "agent-runtime" -Filter "@pichat/agent-runtime" -Command "dev"
  Write-Ok "Agent Runtime 启动中 (PID $($process.Id))"
  if (-not (Wait-HttpHealth -Url $runtimeHealth -Seconds $TimeoutSeconds)) {
    Write-Fail "Agent Runtime 启动超时。查看 .local/logs/agent-runtime.out.log 与 agent-runtime.err.log"
    exit 1
  }
  Write-Ok "Agent Runtime 健康检查通过"
}

if ($SkipWorker) {
  Write-Warn "按参数跳过 Worker"
}
elseif (Get-ServicePid -Name "worker") {
  Write-Warn "Worker 已在运行，跳过启动"
}
else {
  $process = Start-LocalService -Name "worker" -Filter "@pichat/worker" -Command "dev"
  if (Wait-WorkerReady -Seconds 30) {
    Write-Ok "Worker 已启动 (PID $($process.Id))"
  }
  else {
    Write-Fail "Worker 启动失败。查看 .local/logs/worker.out.log 与 worker.err.log"
    exit 1
  }
}

if ($SkipWeb) {
  Write-Warn "按参数跳过 Web"
}
elseif (Test-TcpPort "127.0.0.1" $webPort) {
  Write-Warn "端口 $webPort 已被占用，跳过 Web 启动"
}
else {
  if ($WebProd) {
    if ($RebuildWeb -or -not (Test-Path -LiteralPath (Join-Path $root "apps/web/.next/BUILD_ID"))) {
      Invoke-WebBuild
    }
    $process = Start-LocalService -Name "web" -Filter "@pichat/web" -Command "start"
  }
  else {
    $process = Start-LocalService -Name "web" -Filter "@pichat/web" -Command "dev"
  }
  Write-Ok "Web 启动中 (PID $($process.Id))"
  if (-not (Wait-TcpPort "127.0.0.1" $webPort -Seconds $TimeoutSeconds)) {
    Write-Fail "Web 启动超时。查看 .local/logs/web.out.log 与 web.err.log"
    exit 1
  }
  Write-Ok "Web 已监听 $webUrl"
}

Write-Host ""
Write-Host "PiChat 本地服务已启动" -ForegroundColor Green
if ($SkipWeb) {
  Write-Host "  Web      已跳过"
}
else {
  Write-Host "  Web      $webUrl"
}
Write-Host "  API      $apiHealth"
Write-Host "  Runtime  $runtimeHealth"
Write-Host "  日志     $logDir"
Write-Host "  状态     pwsh -File scripts/start-local.ps1 -Status"
Write-Host "  停止     pwsh -File scripts/start-local.ps1 -Stop"
Write-Host ""

if ($Open) {
  Start-Process $webUrl
}

exit 0
