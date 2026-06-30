#!/bin/bash
# ============================================================
# Coleta de Inventario de Ambiente Fluig - Linux
# InsightLog Environment Analyzer
# Versao 2.0 - Alinhado com a Matriz de Portabilidade Fluig (TDN)
# ============================================================
# Execute este script no servidor de APLICACAO do Fluig
# (nao no servidor de banco de dados).
#
# Uso: chmod +x coleta-linux.sh && ./coleta-linux.sh
# Saida: inventario.json (enviar para o InsightLog)
# ============================================================

OUTPUT_FILE="inventario.json"

echo "=========================================="
echo "  InsightLog - Coleta de Inventario Fluig"
echo "=========================================="
echo ""
echo "Coletando informacoes do servidor..."
echo ""

# ----------------------------------------------------------
# Sistema Operacional
# ----------------------------------------------------------
OS_NAME=$(grep "^NAME=" /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo "Linux")
OS_VERSION=$(grep "^VERSION=" /etc/os-release 2>/dev/null | cut -d'"' -f2 || \
             grep "^VERSION_ID=" /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo "")
OS_BUILD=$(uname -r 2>/dev/null || echo "")
ARCHITECTURE=$(uname -m 2>/dev/null || echo "")

echo "[OK] SO: $OS_NAME $OS_VERSION ($ARCHITECTURE)"

# ----------------------------------------------------------
# Hardware
# ----------------------------------------------------------
CPU_VCPU=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "0")
RAM_GB=$(free -g 2>/dev/null | awk '/^Mem:/{print $2}' || \
         awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo "0")
# Disco: usa a particao do / ou a maior particao disponivel
DISK_GB=$(df -BG / 2>/dev/null | awk 'NR==2{gsub("G","",$2); print $2}' || echo "0")

echo "[OK] Hardware: $CPU_VCPU vCPU | $RAM_GB GB RAM | $DISK_GB GB Disco"

# ----------------------------------------------------------
# Java
# Prioridade: java no PATH do Fluig, depois JAVA_HOME, depois PATH global
# ----------------------------------------------------------
JAVA_CMD="java"
# Tenta localizar o Java do Fluig primeiro
FLUIG_JAVA_PATHS=(
  "/opt/fluig/jre/bin/java"
  "/opt/fluig/java/bin/java"
  "/opt/totvs/fluig/jre/bin/java"
  "/fluig/jre/bin/java"
)
for jpath in "${FLUIG_JAVA_PATHS[@]}"; do
  if [ -x "$jpath" ]; then
    JAVA_CMD="$jpath"
    break
  fi
done

JAVA_RAW=$("$JAVA_CMD" -version 2>&1 | head -1)
JAVA_VERSION=$(echo "$JAVA_RAW" | awk -F '"' '{print $2}' | head -1)
JAVA_VENDOR_RAW=$(echo "$JAVA_RAW" | awk -F '"' '{print $1}')

# Normaliza o vendor conforme valores esperados pela matriz
if echo "$JAVA_VENDOR_RAW" | grep -qi "temurin\|adoptium"; then
  JAVA_VENDOR="Eclipse Temurin"
elif echo "$JAVA_VENDOR_RAW" | grep -qi "corretto"; then
  JAVA_VENDOR="Amazon Corretto"
elif echo "$JAVA_VENDOR_RAW" | grep -qi "zulu"; then
  JAVA_VENDOR="Azul Zulu"
elif echo "$JAVA_VENDOR_RAW" | grep -qi "openjdk"; then
  JAVA_VENDOR="OpenJDK"
elif echo "$JAVA_VENDOR_RAW" | grep -qi "oracle"; then
  JAVA_VENDOR="Oracle"
elif echo "$JAVA_VENDOR_RAW" | grep -qi "ibm"; then
  JAVA_VENDOR="IBM"
else
  JAVA_VENDOR="OpenJDK"
fi

JAVA_HOME_VAL="${JAVA_HOME:-}"
if [ -z "$JAVA_HOME_VAL" ] && [ "$JAVA_CMD" != "java" ]; then
  JAVA_HOME_VAL=$(dirname $(dirname "$JAVA_CMD"))
fi

echo "[OK] Java: $JAVA_VERSION ($JAVA_VENDOR)"

# ----------------------------------------------------------
# Fluig: versao, patch, diretorio, servidor de aplicacao embutido
# ----------------------------------------------------------
FLUIG_DIR=""
FLUIG_VERSION=""
FLUIG_PATCH=""
APPSERVER_TYPE="JBoss (embutido no Fluig)"

# Caminhos mais comuns de instalacao do Fluig em Linux
FLUIG_SEARCH_PATHS=(
  "/opt/fluig"
  "/opt/totvs/fluig"
  "/fluig"
  "/home/fluig"
  "/opt/fluig-platform"
  "/srv/fluig"
)

for fpath in "${FLUIG_SEARCH_PATHS[@]}"; do
  if [ -d "$fpath" ]; then
    FLUIG_DIR="$fpath"
    break
  fi
done

# Fallback: procura pelo server.xml ou standalone.xml do Fluig
if [ -z "$FLUIG_DIR" ]; then
  FLUIG_DIR=$(find /opt /srv /home -maxdepth 5 \( -name "fluig.log" -o -name "standalone.xml" \) 2>/dev/null | \
    grep -i fluig | head -1 | xargs -I{} dirname {} 2>/dev/null | head -1 || echo "")
fi

# Versao: tenta varios arquivos comuns
if [ -n "$FLUIG_DIR" ]; then
  for verfile in "$FLUIG_DIR/version.txt" "$FLUIG_DIR/fluig-version.txt" \
                 "$FLUIG_DIR/platform/version.txt" "$FLUIG_DIR/app/version.txt"; do
    if [ -f "$verfile" ]; then
      FLUIG_VERSION=$(head -1 "$verfile" 2>/dev/null | tr -d '[:space:]' || echo "")
      break
    fi
  done

  # Patch: procura por HF_ ou update no diretorio
  FLUIG_PATCH=$(find "$FLUIG_DIR" -maxdepth 2 -name "HF_*" -o -name "UPDATE_*" 2>/dev/null | \
    head -1 | xargs basename 2>/dev/null || echo "")

  # Confirma appserver embutido
  if [ -d "$FLUIG_DIR/appserver" ] || [ -d "$FLUIG_DIR/jboss" ] || \
     ls "$FLUIG_DIR"/bin/standalone.sh 2>/dev/null; then
    APPSERVER_TYPE="JBoss (embutido no Fluig)"
  fi
fi

echo "[OK] Fluig: versao='$FLUIG_VERSION' patch='$FLUIG_PATCH' dir='$FLUIG_DIR'"

# ----------------------------------------------------------
# Banco de Dados
# Detecta apenas o tipo e versao — nao armazena credenciais
# ----------------------------------------------------------
DB_TYPE=""
DB_VERSION=""
DB_CHARSET=""
DB_COLLATION=""

if command -v sqlplus &> /dev/null; then
  DB_TYPE="Oracle 19c"
  DB_VERSION_RAW=$(sqlplus -version 2>/dev/null | grep -i "SQL\*Plus" | head -1 || echo "")
  DB_VERSION=$(echo "$DB_VERSION_RAW" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 || echo "")
  DB_CHARSET="AL32UTF8"
  DB_COLLATION="BINARY"
elif command -v sqlcmd &> /dev/null; then
  DB_TYPE="Microsoft SQL Server 2019"
  DB_VERSION=$(sqlcmd -? 2>/dev/null | head -2 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
  DB_CHARSET="UTF-8"
  DB_COLLATION="SQL_Latin1_General_CP1_CI_AS"
elif command -v mysql &> /dev/null; then
  DB_TYPE="MySQL 8.0"
  DB_VERSION=$(mysql --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
  DB_CHARSET="utf8mb4"
  DB_COLLATION="utf8mb4_general_ci"
elif command -v psql &> /dev/null; then
  DB_TYPE="PostgreSQL"
  DB_VERSION=$(psql --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "")
  DB_CHARSET="UTF-8"
  DB_COLLATION="default"
fi

echo "[OK] Banco: $DB_TYPE $DB_VERSION"

# ----------------------------------------------------------
# Nginx (reverse proxy)
# ----------------------------------------------------------
NGINX_VERSION_RAW=$(nginx -v 2>&1 | grep -oE 'nginx/[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
NGINX_VERSION=""
if [ -n "$NGINX_VERSION_RAW" ]; then
  NGINX_MINOR=$(echo "$NGINX_VERSION_RAW" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  NGINX_VERSION="Nginx $NGINX_MINOR"
fi

# ----------------------------------------------------------
# Apache HTTP Server (reverse proxy alternativo)
# ----------------------------------------------------------
APACHE_VERSION_RAW=$(httpd -v 2>/dev/null | grep "Server version" || \
                     apache2 -v 2>/dev/null | grep "Server version" || echo "")
APACHE_VERSION=""
if [ -n "$APACHE_VERSION_RAW" ]; then
  APACHE_MINOR=$(echo "$APACHE_VERSION_RAW" | grep -oE 'Apache/[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  APACHE_VERSION="Apache HTTP Server $APACHE_MINOR"
fi

echo "[OK] Nginx: '$NGINX_VERSION' | Apache: '$APACHE_VERSION'"

# ----------------------------------------------------------
# Gerar JSON de saida
# ----------------------------------------------------------
cat > "$OUTPUT_FILE" << ENDJSON
{
  "os_name": "$OS_NAME",
  "os_version": "$OS_VERSION",
  "os_build": "$OS_BUILD",
  "architecture": "$ARCHITECTURE",
  "cpu_cores": "$CPU_VCPU",
  "cpu_vcpu": "$CPU_VCPU",
  "ram_gb": "$RAM_GB",
  "disk_gb": "$DISK_GB",
  "java_version": "$JAVA_VENDOR $JAVA_VERSION",
  "java_vendor": "$JAVA_VENDOR",
  "java_home": "$JAVA_HOME_VAL",
  "fluig_version": "$FLUIG_VERSION",
  "fluig_patch": "$FLUIG_PATCH",
  "fluig_directory": "$FLUIG_DIR",
  "database_type": "$DB_TYPE",
  "database_version": "$DB_VERSION",
  "database_charset": "$DB_CHARSET",
  "database_collation": "$DB_COLLATION",
  "appserver_type": "$APPSERVER_TYPE",
  "nginx_version": "$NGINX_VERSION",
  "apache_version": "$APACHE_VERSION"
}
ENDJSON

echo ""
echo "=========================================="
echo "  Coleta concluida!"
echo "  Arquivo gerado: $OUTPUT_FILE"
echo "=========================================="
echo ""
echo "Proximos passos:"
echo "  1. Copie o arquivo '$OUTPUT_FILE' para sua maquina"
echo "  2. No InsightLog, acesse 'Analise de Ambiente' > 'Nova Analise'"
echo "  3. Faca upload do arquivo JSON"
echo ""
echo "IMPORTANTE: Este arquivo nao contem senhas ou credenciais."
