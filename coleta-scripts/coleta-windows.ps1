# ============================================================
# Coleta de Inventario de Ambiente Fluig - Windows
# InsightLog Environment Analyzer
# Versao 2.0 - Alinhado com a Matriz de Portabilidade Fluig (TDN)
# ============================================================
# Execute este script no servidor de APLICACAO do Fluig.
# Requer PowerShell 5.1 ou superior.
#
# Uso: Set-ExecutionPolicy -Scope Process Bypass; .\coleta-windows.ps1
# Saida: inventario.json (enviar para o InsightLog)
# ============================================================

$OUTPUT_FILE = "inventario.json"
$ErrorActionPreference = "SilentlyContinue"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  InsightLog - Coleta de Inventario Fluig" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Coletando informacoes do servidor..."
Write-Host ""

# ----------------------------------------------------------
# Sistema Operacional
# ----------------------------------------------------------
$OS = Get-WmiObject Win32_OperatingSystem
$OS_NAME = $OS.Caption -replace '\s+', ' '
$OS_VERSION = $OS.Version
$OS_BUILD = $OS.BuildNumber
$ARCH_RAW = $OS.OSArchitecture
# Normaliza para o valor esperado pela matriz (x86_64)
$ARCHITECTURE = if ($ARCH_RAW -match "64") { "x86_64" } else { "x86" }

Write-Host "[OK] SO: $OS_NAME (Build $OS_BUILD, $ARCHITECTURE)"

# ----------------------------------------------------------
# Hardware
# ----------------------------------------------------------
$CPU = Get-WmiObject Win32_Processor | Select-Object -First 1
$CPU_VCPU = (Get-WmiObject Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
$CPU_CORES_PHYSICAL = (Get-WmiObject Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum
$RAM_OBJ = Get-WmiObject Win32_ComputerSystem
$RAM_GB = [math]::Round($RAM_OBJ.TotalPhysicalMemory / 1GB, 0)
$DISK = Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DeviceID -eq "C:" }
$DISK_GB = if ($DISK) { [math]::Round($DISK.Size / 1GB, 0) } else { 0 }

Write-Host "[OK] Hardware: $CPU_VCPU vCPU | $RAM_GB GB RAM | $DISK_GB GB Disco (C:)"

# ----------------------------------------------------------
# Java
# Prioridade: JAVA_HOME do Fluig, depois JAVA_HOME global, depois PATH
# ----------------------------------------------------------
$JAVA_VERSION = ""
$JAVA_VENDOR = ""
$JAVA_HOME_VAL = ""

# Caminhos de instalacao do Fluig
$FluigJavaPaths = @(
    "C:\fluig\jre\bin\java.exe",
    "C:\TOTVS\fluig\jre\bin\java.exe",
    "D:\fluig\jre\bin\java.exe",
    "D:\TOTVS\fluig\jre\bin\java.exe",
    "C:\fluig\java\bin\java.exe"
)
$JavaCmd = "java"
foreach ($jp in $FluigJavaPaths) {
    if (Test-Path $jp) {
        $JavaCmd = $jp
        $JAVA_HOME_VAL = Split-Path (Split-Path $jp -Parent) -Parent
        break
    }
}
if (-not $JAVA_HOME_VAL -and $env:JAVA_HOME) {
    $JAVA_HOME_VAL = $env:JAVA_HOME
}

try {
    $JavaOutput = & $JavaCmd -version 2>&1 | Select-Object -First 1
    $JavaOutputStr = $JavaOutput.ToString()
    # Extrai versao entre aspas
    if ($JavaOutputStr -match '"([^"]+)"') {
        $JAVA_VERSION = $Matches[1]
    }
    # Identifica vendor
    if ($JavaOutputStr -match "Temurin|Adoptium") { $JAVA_VENDOR = "Eclipse Temurin" }
    elseif ($JavaOutputStr -match "Corretto") { $JAVA_VENDOR = "Amazon Corretto" }
    elseif ($JavaOutputStr -match "Zulu") { $JAVA_VENDOR = "Azul Zulu" }
    elseif ($JavaOutputStr -match "OpenJDK") { $JAVA_VENDOR = "OpenJDK" }
    elseif ($JavaOutputStr -match "IBM") { $JAVA_VENDOR = "IBM" }
    else { $JAVA_VENDOR = "Oracle" }
} catch {
    $JAVA_VERSION = "nao detectado"
    $JAVA_VENDOR = ""
}

Write-Host "[OK] Java: $JAVA_VERSION ($JAVA_VENDOR)"

# ----------------------------------------------------------
# Fluig: versao, patch, diretorio
# ----------------------------------------------------------
$FLUIG_DIR = ""
$FLUIG_VERSION = ""
$FLUIG_PATCH = ""
$APPSERVER_TYPE = "JBoss (embutido no Fluig)"

$FluigPaths = @(
    "C:\fluig",
    "C:\TOTVS\fluig",
    "D:\fluig",
    "D:\TOTVS\fluig",
    "C:\Fluig",
    "D:\Fluig",
    "C:\fluig-platform",
    "D:\fluig-platform"
)
foreach ($path in $FluigPaths) {
    if (Test-Path $path) {
        $FLUIG_DIR = $path
        # Tenta ler a versao de varios arquivos possiveis
        $VerFiles = @(
            (Join-Path $path "version.txt"),
            (Join-Path $path "fluig-version.txt"),
            (Join-Path $path "platform\version.txt"),
            (Join-Path $path "app\version.txt")
        )
        foreach ($vf in $VerFiles) {
            if (Test-Path $vf) {
                $FLUIG_VERSION = (Get-Content $vf -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
                break
            }
        }
        # Patch: procura por pastas HF_ ou UPDATE_ no diretorio
        $PatchDirs = Get-ChildItem -Path $path -Filter "HF_*" -Directory -ErrorAction SilentlyContinue |
                     Select-Object -First 1
        if (-not $PatchDirs) {
            $PatchDirs = Get-ChildItem -Path $path -Filter "UPDATE_*" -Directory -ErrorAction SilentlyContinue |
                         Select-Object -First 1
        }
        if ($PatchDirs) { $FLUIG_PATCH = $PatchDirs.Name }
        break
    }
}

Write-Host "[OK] Fluig: versao='$FLUIG_VERSION' patch='$FLUIG_PATCH' dir='$FLUIG_DIR'"

# ----------------------------------------------------------
# Banco de Dados
# Detecta apenas tipo — nao armazena credenciais
# ----------------------------------------------------------
$DB_TYPE = ""
$DB_VERSION = ""
$DB_CHARSET = ""
$DB_COLLATION = ""

if (Get-Command sqlplus -ErrorAction SilentlyContinue) {
    $DB_TYPE = "Oracle 19c"
    $DB_CHARSET = "AL32UTF8"
    $DB_COLLATION = "BINARY"
} elseif (Get-Command sqlcmd -ErrorAction SilentlyContinue) {
    $DB_TYPE = "Microsoft SQL Server 2019"
    $DB_CHARSET = "UTF-8"
    $DB_COLLATION = "SQL_Latin1_General_CP1_CI_AS"
    # Tenta obter versao exata via registry
    $SqlVerKey = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server"
    if (Test-Path $SqlVerKey) {
        $Instances = (Get-ItemProperty $SqlVerKey -ErrorAction SilentlyContinue).InstalledInstances
        if ($Instances) { $DB_VERSION = $Instances[0] }
    }
} elseif (Get-Command mysql -ErrorAction SilentlyContinue) {
    $DB_TYPE = "MySQL 8.0"
    $MysqlVer = & mysql --version 2>&1
    if ($MysqlVer -match "([0-9]+\.[0-9]+\.[0-9]+)") { $DB_VERSION = $Matches[1] }
    $DB_CHARSET = "utf8mb4"
    $DB_COLLATION = "utf8mb4_general_ci"
} elseif (Get-Command psql -ErrorAction SilentlyContinue) {
    $DB_TYPE = "PostgreSQL"
    $PgVer = & psql --version 2>&1
    if ($PgVer -match "([0-9]+\.[0-9]+)") { $DB_VERSION = $Matches[1] }
    $DB_CHARSET = "UTF-8"
    $DB_COLLATION = "default"
}

Write-Host "[OK] Banco: $DB_TYPE $DB_VERSION"

# ----------------------------------------------------------
# Nginx
# ----------------------------------------------------------
$NGINX_VERSION = ""
if (Get-Command nginx -ErrorAction SilentlyContinue) {
    $NginxOut = & nginx -v 2>&1
    if ($NginxOut -match "nginx/([0-9]+\.[0-9]+\.[0-9]+)") {
        $NGINX_VERSION = "Nginx $($Matches[1])"
    }
}

# ----------------------------------------------------------
# Apache HTTP Server
# ----------------------------------------------------------
$APACHE_VERSION = ""
foreach ($ApacheCmd in @("httpd", "apache2")) {
    if (Get-Command $ApacheCmd -ErrorAction SilentlyContinue) {
        $ApacheOut = & $ApacheCmd -v 2>&1 | Select-String "Server version"
        if ($ApacheOut -match "Apache/([0-9]+\.[0-9]+\.[0-9]+)") {
            $APACHE_VERSION = "Apache HTTP Server $($Matches[1])"
        }
        break
    }
}

Write-Host "[OK] Nginx: '$NGINX_VERSION' | Apache: '$APACHE_VERSION'"

# ----------------------------------------------------------
# Gerar JSON de saida
# ----------------------------------------------------------
$Inventory = [ordered]@{
    os_name           = $OS_NAME
    os_version        = $OS_VERSION
    os_build          = [string]$OS_BUILD
    architecture      = $ARCHITECTURE
    cpu_cores         = [string]$CPU_VCPU
    cpu_vcpu          = [string]$CPU_VCPU
    ram_gb            = [string]$RAM_GB
    disk_gb           = [string]$DISK_GB
    java_version      = if ($JAVA_VERSION) { "$JAVA_VENDOR $JAVA_VERSION" } else { "" }
    java_vendor       = $JAVA_VENDOR
    java_home         = $JAVA_HOME_VAL
    fluig_version     = $FLUIG_VERSION
    fluig_patch       = $FLUIG_PATCH
    fluig_directory   = $FLUIG_DIR
    database_type     = $DB_TYPE
    database_version  = $DB_VERSION
    database_charset  = $DB_CHARSET
    database_collation = $DB_COLLATION
    appserver_type    = $APPSERVER_TYPE
    nginx_version     = $NGINX_VERSION
    apache_version    = $APACHE_VERSION
}

$Inventory | ConvertTo-Json -Depth 3 | Out-File -FilePath $OUTPUT_FILE -Encoding UTF8 -NoNewline

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Coleta concluida!" -ForegroundColor Green
Write-Host "  Arquivo gerado: $OUTPUT_FILE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos:"
Write-Host "  1. Copie o arquivo '$OUTPUT_FILE' para sua maquina"
Write-Host "  2. No InsightLog, acesse 'Analise de Ambiente' > 'Nova Analise'"
Write-Host "  3. Faca upload do arquivo JSON"
Write-Host ""
Write-Host "IMPORTANTE: Este arquivo nao contem senhas ou credenciais." -ForegroundColor Yellow
