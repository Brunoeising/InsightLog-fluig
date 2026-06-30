#!/bin/bash
# ============================================================
# Coleta de Inventario de Ambiente Fluig - Linux
# InsightLog Environment Analyzer
# ============================================================
# Execute este script no servidor onde o Fluig esta instalado.
# Ele gera um arquivo inventario.json que deve ser enviado
# para o app InsightLog.
#
# Uso: chmod +x coleta-linux.sh && ./coleta-linux.sh
# ============================================================

OUTPUT_FILE="inventario.json"

echo "Coletando informacoes do ambiente..."

# Sistema Operacional
OS_NAME=$(cat /etc/os-release 2>/dev/null | grep "^NAME=" | cut -d'"' -f2 || echo "Linux")
OS_VERSION=$(cat /etc/os-release 2>/dev/null | grep "^VERSION=" | cut -d'"' -f2 || echo "")
OS_BUILD=$(uname -r 2>/dev/null || echo "")
ARCHITECTURE=$(uname -m 2>/dev/null || echo "")

# Hardware
CPU_CORES=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "")
RAM_GB=$(free -g 2>/dev/null | awk '/^Mem:/{print $2}' || echo "")
DISK_GB=$(df -BG / 2>/dev/null | awk 'NR==2{print $2}' | tr -d 'G' || echo "")

# Java
JAVA_VERSION=$(java -version 2>&1 | head -1 | awk -F '"' '{print $2}' || echo "")
JAVA_VENDOR=$(java -version 2>&1 | head -1 | awk -F '"' '{print $1}' | tr -d ' ' || echo "")
JAVA_HOME_VAL=$(echo $JAVA_HOME || echo "")

# Fluig (tentar localizar)
FLUIG_DIR=$(find / -maxdepth 4 -name "fluig.conf" -o -name "standalone.sh" 2>/dev/null | head -1 | xargs dirname 2>/dev/null || echo "")
FLUIG_VERSION=""
FLUIG_PATCH=""
if [ -f "$FLUIG_DIR/../version.txt" ]; then
  FLUIG_VERSION=$(cat "$FLUIG_DIR/../version.txt" 2>/dev/null || echo "")
fi

# Banco de Dados (tentar detectar)
DB_TYPE=""
DB_VERSION=""
DB_CHARSET=""
DB_COLLATION=""
if command -v psql &> /dev/null; then
  DB_TYPE="PostgreSQL"
  DB_VERSION=$(psql --version 2>/dev/null | awk '{print $3}' || echo "")
elif command -v sqlplus &> /dev/null; then
  DB_TYPE="Oracle"
  DB_VERSION=$(sqlplus -version 2>/dev/null | head -1 || echo "")
elif command -v sqlcmd &> /dev/null; then
  DB_TYPE="Microsoft SQL Server"
  DB_VERSION=$(sqlcmd -? 2>/dev/null | head -1 || echo "")
fi

# Servidor de Aplicacao
APPSERVER_TYPE="WildFly"
if [ -f "$FLUIG_DIR/standalone.sh" ]; then
  APPSERVER_TYPE="WildFly"
fi

# Nginx
NGINX_VERSION=$(nginx -v 2>&1 | awk -F '/' '{print $2}' || echo "")

# Apache
APACHE_VERSION=$(httpd -v 2>/dev/null | grep "Server version" | awk '{print $3}' || apache2 -v 2>/dev/null | grep "Server version" | awk '{print $3}' || echo "")

# Gerar JSON
cat > "$OUTPUT_FILE" << EOF
{
  "os_name": "$OS_NAME",
  "os_version": "$OS_VERSION",
  "os_build": "$OS_BUILD",
  "architecture": "$ARCHITECTURE",
  "cpu_cores": "$CPU_CORES",
  "cpu_vcpu": "$CPU_CORES",
  "ram_gb": "$RAM_GB",
  "disk_gb": "$DISK_GB",
  "java_version": "$JAVA_VERSION",
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
EOF

echo "Arquivo $OUTPUT_FILE gerado com sucesso!"
echo "Envie este arquivo para o InsightLog para realizar a analise."
