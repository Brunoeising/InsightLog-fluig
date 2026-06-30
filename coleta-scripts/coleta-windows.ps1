# ============================================================
# Coleta de Inventario de Ambiente Fluig - Windows
# InsightLog Environment Analyzer
# ============================================================
# Execute este script no PowerShell do servidor onde o Fluig
# esta instalado. Ele gera um arquivo inventario.json que deve
# ser enviado para o app InsightLog.
#
# Uso: .\coleta-windows.ps1
# ============================================================

$OUTPUT_FILE = "inventario.json"

Write-Host "Coletando informacoes do ambiente..."

# Sistema Operacional
$OS = Get-WmiObject Win32_OperatingSystem
$OS_NAME = $OS.Caption
$OS_VERSION = $OS.Version
$OS_BUILD = $OS.BuildNumber
$ARCHITECTURE = $OS.OSArchitecture

# Hardware
$CPU = Get-WmiObject Win32_Processor
$CPU_CORES = $CPU.NumberOfCores
$CPU_VCPU = $CPU.NumberOfLogicalProcessors
$RAM = Get-WmiObject Win32_ComputerSystem
$RAM_GB = [math]::Round($RAM.TotalPhysicalMemory / 1GB, 0)
$DISK = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
$DISK_GB = [math]::Round($DISK.Size / 1GB, 0)

# Java
$JAVA_OUTPUT = & java -version 2>&1 | Select-Object -First 1
$JAVA_VERSION = ($JAVA_OUTPUT -split '"')[1]
$JAVA_VENDOR = (($JAVA_OUTPUT -split '"')[0]).Trim()
$JAVA_HOME_VAL = $env:JAVA_HOME

# Fluig (tentar localizar)
$FLUIG_DIR = ""
$FLUIG_VERSION = ""
$FLUIG_PATCH = ""
$FluigPaths = @("C:\fluig", "C:\TOTVS\fluig", "D:\fluig", "D:\TOTVS\fluig")
foreach ($path in $FluigPaths) {
    if (Test-Path $path) {
        $FLUIG_DIR = $path
        $versionFile = Join-Path $path "version.txt"
        if (Test-Path $versionFile) {
            $FLUIG_VERSION = Get-Content $versionFile -ErrorAction SilentlyContinue
        }
        break
    }
}

# Banco de Dados
$DB_TYPE = ""
$DB_VERSION = ""
$DB_CHARSET = ""
$DB_COLLATION = ""
if (Get-Command sqlplus -ErrorAction SilentlyContinue) {
    $DB_TYPE = "Oracle"
} elseif (Get-Command sqlcmd -ErrorAction SilentlyContinue) {
    $DB_TYPE = "Microsoft SQL Server"
} elseif (Get-Command psql -ErrorAction SilentlyContinue) {
    $DB_TYPE = "PostgreSQL"
}

# Servidor de Aplicacao
$APPSERVER_TYPE = "WildFly"

# Nginx
$NGINX_VERSION = ""
if (Get-Command nginx -ErrorAction SilentlyContinue) {
    $NGINX_OUTPUT = & nginx -v 2>&1
    $NGINX_VERSION = ($NGINX_OUTPUT -split '/')[1]
}

# Apache
$APACHE_VERSION = ""
if (Get-Command httpd -ErrorAction SilentlyContinue) {
    $APACHE_OUTPUT = & httpd -v 2>&1 | Select-String "Server version"
    $APACHE_VERSION = ($APACHE_OUTPUT -split ' ')[2]
} elseif (Get-Command apache2 -ErrorAction SilentlyContinue) {
    $APACHE_OUTPUT = & apache2 -v 2>&1 | Select-String "Server version"
    $APACHE_VERSION = ($APACHE_OUTPUT -split ' ')[2]
}

# Gerar JSON
$inventory = @{
    os_name = $OS_NAME
    os_version = $OS_VERSION
    os_build = $OS_BUILD
    architecture = $ARCHITECTURE
    cpu_cores = [string]$CPU_CORES
    cpu_vcpu = [string]$CPU_VCPU
    ram_gb = [string]$RAM_GB
    disk_gb = [string]$DISK_GB
    java_version = $JAVA_VERSION
    java_vendor = $JAVA_VENDOR
    java_home = $JAVA_HOME_VAL
    fluig_version = $FLUIG_VERSION
    fluig_patch = $FLUIG_PATCH
    fluig_directory = $FLUIG_DIR
    database_type = $DB_TYPE
    database_version = $DB_VERSION
    database_charset = $DB_CHARSET
    database_collation = $DB_COLLATION
    appserver_type = $APPSERVER_TYPE
    nginx_version = $NGINX_VERSION
    apache_version = $APACHE_VERSION
}

$inventory | ConvertTo-Json -Depth 3 | Out-File -FilePath $OUTPUT_FILE -Encoding UTF8

Write-Host "Arquivo $OUTPUT_FILE gerado com sucesso!"
Write-Host "Envie este arquivo para o InsightLog para realizar a analise."
