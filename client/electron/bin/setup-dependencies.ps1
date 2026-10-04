# setup-dependencies.ps1
# Automacao de instalacao e verificacao de yt-dlp e ffmpeg para o ZeroVC

$ErrorActionPreference = 'SilentlyContinue'

# Garantir TLS 1.2 / 1.3 para conexoes seguras com GitHub e servidores web
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls

$localAppData = [Environment]::GetFolderPath('LocalApplicationData')
$binDir = Join-Path $localAppData "ZeroVC\bin"

if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

function Write-Log($msg) {
    Write-Output "[ZeroVC Setup] $msg"
}

# =========================================================================
# 1. VERIFICAR E INSTALAR YT-DLP
# =========================================================================
Write-Log "Verificando instalacao existente do yt-dlp..."

$ytdlpFound = $false
try {
    $cmd = Get-Command "yt-dlp" -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) {
        $ytdlpFound = $true
        Write-Log "yt-dlp encontrado no sistema: $($cmd.Source). Ignorando download."
    } else {
        $whereResult = where.exe yt-dlp 2>$null
        if ($whereResult) {
            $ytdlpFound = $true
            Write-Log "yt-dlp encontrado no PATH: $($whereResult[0]). Ignorando download."
        }
    }
} catch {
    $ytdlpFound = $false
}

$targetYtdlp = Join-Path $binDir "yt-dlp.exe"
if (-not $ytdlpFound -and (Test-Path $targetYtdlp)) {
    $ytdlpFound = $true
    Write-Log "yt-dlp ja existe no diretorio local do ZeroVC: $targetYtdlp. Ignorando download."
}

if (-not $ytdlpFound) {
    Write-Log "yt-dlp nao encontrado no computador. Baixando versao mais recente..."
    $ytdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    try {
        Invoke-WebRequest -Uri $ytdlpUrl -OutFile $targetYtdlp -UseBasicParsing -TimeoutSec 60
        Write-Log "yt-dlp.exe baixado com sucesso em $targetYtdlp."
    } catch {
        try {
            $wc = New-Object System.Net.WebClient
            $wc.DownloadFile($ytdlpUrl, $targetYtdlp)
            Write-Log "yt-dlp.exe baixado via WebClient com sucesso."
        } catch {
            Write-Log "Nao foi possivel baixar o yt-dlp: $_"
        }
    }
}

# =========================================================================
# 2. CONFIGURAR O PATH DO COMPUTADOR (USER PATH)
# =========================================================================
try {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathParts = if ($userPath) { $userPath -split ';' } else { @() }
    $cleanBinDir = $binDir.TrimEnd('\')

    $alreadyInPath = $false
    foreach ($p in $pathParts) {
        if ($p.TrimEnd('\') -ieq $cleanBinDir) {
            $alreadyInPath = $true
            break
        }
    }

    if (-not $alreadyInPath) {
        Write-Log "Adicionando $binDir ao PATH do usuario..."
        $newUserPath = if ($userPath) { "$userPath;$binDir" } else { $binDir }
        [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
        Write-Log "PATH do usuario atualizado com sucesso."
    } else {
        Write-Log "Diretorio $binDir ja esta presente no PATH."
    }

    # Atualiza PATH do processo em execucao
    if ($env:Path -split ';' -notcontains $binDir) {
        $env:Path = "$env:Path;$binDir"
    }
} catch {
    Write-Log "Erro ao atualizar variavel PATH: $_"
}

# =========================================================================
# 3. VERIFICAR E INSTALAR FFMPEG
# =========================================================================
Write-Log "Verificando instalacao existente do ffmpeg..."

$ffmpegFound = $false
try {
    $cmdFF = Get-Command "ffmpeg" -ErrorAction SilentlyContinue
    if ($cmdFF -and $cmdFF.Source) {
        $ffmpegFound = $true
        Write-Log "ffmpeg encontrado no sistema: $($cmdFF.Source). Ignorando download."
    } else {
        $whereFF = where.exe ffmpeg 2>$null
        if ($whereFF) {
            $ffmpegFound = $true
            Write-Log "ffmpeg encontrado no PATH: $($whereFF[0]). Ignorando download."
        }
    }
} catch {
    $ffmpegFound = $false
}

$targetFfmpeg = Join-Path $binDir "ffmpeg.exe"
if (-not $ffmpegFound -and (Test-Path $targetFfmpeg)) {
    $ffmpegFound = $true
    Write-Log "ffmpeg ja existe no diretorio local do ZeroVC: $targetFfmpeg. Ignorando download."
}

if (-not $ffmpegFound) {
    Write-Log "ffmpeg nao encontrado. Iniciando instalacao automatica..."
    $installedViaWinget = $false
    try {
        $wingetCmd = Get-Command "winget" -ErrorAction SilentlyContinue
        if ($wingetCmd) {
            Write-Log "Tentando instalacao do ffmpeg via winget..."
            $p = Start-Process -FilePath "winget" -ArgumentList "install --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements --silent" -Wait -PassThru -NoNewWindow
            if ($p.ExitCode -eq 0) {
                $installedViaWinget = $true
                Write-Log "ffmpeg instalado com sucesso pelo winget."
            }
        }
    } catch {
        Write-Log "Tentativa com winget falhou ou nao disponivel: $_"
    }

    # Se winget nao instalou, baixa o release essentials
    if (-not $installedViaWinget -and -not (Test-Path $targetFfmpeg)) {
        Write-Log "Baixando pacote ffmpeg essentials..."
        $zipPath = Join-Path $env:TEMP "zerovc-ffmpeg.zip"
        $extractDir = Join-Path $env:TEMP "zerovc-ffmpeg-ext"
        $ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

        try {
            Invoke-WebRequest -Uri $ffmpegUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 120
            if (Test-Path $zipPath) {
                Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
                $extractedExe = Get-ChildItem -Path $extractDir -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
                if ($extractedExe) {
                    Copy-Item -Path $extractedExe.FullName -Destination $targetFfmpeg -Force
                    Write-Log "ffmpeg.exe instalado em $targetFfmpeg."
                }
                $extractedProbe = Get-ChildItem -Path $extractDir -Filter "ffprobe.exe" -Recurse | Select-Object -First 1
                if ($extractedProbe) {
                    Copy-Item -Path $extractedProbe.FullName -Destination (Join-Path $binDir "ffprobe.exe") -Force
                }
            }
        } catch {
            Write-Log "Erro ao baixar/extrair ffmpeg essentials: $_"
        } finally {
            Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
            Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Log "Verificacao e instalacao de dependencias concluida."
