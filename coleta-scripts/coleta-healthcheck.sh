#!/bin/bash
# ============================================================
# Health Check Fluig - Linux
# InsightLog Environment Analyzer
# Versao 2.0 - Metricas alinhadas com o modelo de dimensionamento Fluig (TDN)
# ============================================================
# Coleta metricas de saude do ambiente Fluig em execucao:
# - Uso de Heap JVM (via jstat, MBeans ou estimativa via /proc)
# - Uso de CPU do processo Fluig/JBoss
# - Uso de memoria do SO
# - Uso de disco da particao principal
# - Status dos servicos (fluig, jboss/wildfly, nginx, apache)
#
# Uso: chmod +x coleta-healthcheck.sh && ./coleta-healthcheck.sh
# Saida: healthcheck.json
# ============================================================

OUTPUT_FILE="healthcheck.json"

echo "==========================================="
echo "  InsightLog - Health Check Fluig"
echo "==========================================="
echo ""

# ----------------------------------------------------------
# Status dos Servicos
# ----------------------------------------------------------
SERVICES_STATUS="{}"

get_service_status() {
  local svc="$1"
  if command -v systemctl &>/dev/null; then
    systemctl is-active "$svc" 2>/dev/null || echo "inactive"
  elif command -v service &>/dev/null; then
    service "$svc" status &>/dev/null && echo "active" || echo "inactive"
  else
    echo "unknown"
  fi
}

FLUIG_STATUS=$(get_service_status "fluig")
JBOSS_STATUS=$(get_service_status "jboss")
WILDFLY_STATUS=$(get_service_status "wildfly")
# Combina: se wildfly esta ativo, usa ele; se nao, usa jboss
if [ "$WILDFLY_STATUS" = "active" ]; then
  APPSERVER_STATUS="$WILDFLY_STATUS"
else
  APPSERVER_STATUS="$JBOSS_STATUS"
fi
NGINX_STATUS=$(get_service_status "nginx")
APACHE_STATUS=$(get_service_status "httpd")
if [ "$APACHE_STATUS" = "inactive" ]; then
  APACHE_STATUS=$(get_service_status "apache2")
fi

SERVICES_STATUS="{\"fluig\":\"$FLUIG_STATUS\",\"appserver\":\"$APPSERVER_STATUS\",\"nginx\":\"$NGINX_STATUS\",\"apache\":\"$APACHE_STATUS\"}"

echo "[OK] Status servicos coletado"

# ----------------------------------------------------------
# PID do processo Fluig/JBoss
# ----------------------------------------------------------
FLUIG_PID=$(pgrep -f "fluig\|wildfly\|jboss\|standalone.sh" 2>/dev/null | head -1 || echo "")

CPU_USAGE=0
MEMORY_USAGE=0
HEAP_USAGE=0

# ----------------------------------------------------------
# Uso de CPU e Memoria do processo Fluig
# ----------------------------------------------------------
if [ -n "$FLUIG_PID" ]; then
  # CPU instantanea (2 amostras para resultado mais preciso)
  CPU_USAGE=$(ps -p "$FLUIG_PID" -o %cpu --no-headers 2>/dev/null | tr -d ' ' || echo "0")
  MEMORY_USAGE=$(ps -p "$FLUIG_PID" -o %mem --no-headers 2>/dev/null | tr -d ' ' || echo "0")
  echo "[OK] PID Fluig: $FLUIG_PID | CPU: $CPU_USAGE% | Mem: $MEMORY_USAGE%"

  # ----------------------------------------------------------
  # Heap JVM via jstat (metodo mais preciso)
  # Calcula: (Eden+Survivor0+OldGen usado) / (Eden+Survivor+Old total) * 100
  # ----------------------------------------------------------
  if command -v jstat &>/dev/null; then
    JSTAT_OUT=$(jstat -gc "$FLUIG_PID" 2>/dev/null | awk 'NR==2{print}')
    if [ -n "$JSTAT_OUT" ]; then
      # S0C S1C S0U S1U EC EU OC OU MC MU CCSC CCSU YGC YGCT FGC FGCT GCT
      HEAP_USAGE=$(echo "$JSTAT_OUT" | awk '{
        s0c=$1; s1c=$2; s0u=$3; s1u=$4; ec=$5; eu=$6; oc=$7; ou=$8;
        total=s0c+s1c+ec+oc;
        used=s0u+s1u+eu+ou;
        if(total>0) printf "%.1f", (used/total)*100;
        else print "0"
      }')
      echo "[OK] Heap JVM (jstat): $HEAP_USAGE%"
    fi
  fi

  # Fallback: estimativa via /proc/PID/status (MemRSS / MemTotal)
  if [ -z "$HEAP_USAGE" ] || [ "$HEAP_USAGE" = "0" ]; then
    if [ -f "/proc/$FLUIG_PID/status" ]; then
      PROC_MEM=$(grep "VmRSS:" /proc/"$FLUIG_PID"/status 2>/dev/null | awk '{print $2}' || echo "0")
      TOTAL_MEM=$(grep "MemTotal:" /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "1")
      if [ "$TOTAL_MEM" -gt 0 ]; then
        HEAP_USAGE=$(awk "BEGIN {printf \"%.1f\", ($PROC_MEM/$TOTAL_MEM)*100}")
      fi
    fi
  fi
else
  echo "[WARN] Processo do Fluig/JBoss nao encontrado. O Fluig pode estar parado."
fi

# ----------------------------------------------------------
# Uso total de memoria do SO (diferente do processo)
# ----------------------------------------------------------
MEM_TOTAL=$(grep "MemTotal:" /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
MEM_AVAILABLE=$(grep "MemAvailable:" /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
SYSTEM_MEMORY_USAGE=0
if [ "$MEM_TOTAL" -gt 0 ]; then
  SYSTEM_MEMORY_USAGE=$(awk "BEGIN {printf \"%.1f\", (($MEM_TOTAL - $MEM_AVAILABLE)/$MEM_TOTAL)*100}")
fi

# Usa o uso de memoria do sistema se o processo nao foi encontrado
if [ -z "$MEMORY_USAGE" ] || [ "$MEMORY_USAGE" = "0" ]; then
  MEMORY_USAGE="$SYSTEM_MEMORY_USAGE"
fi

echo "[OK] Memoria SO: $SYSTEM_MEMORY_USAGE%"

# ----------------------------------------------------------
# Uso de disco da particao principal do Fluig
# Verifica / e /opt (onde o Fluig costuma estar em Linux)
# ----------------------------------------------------------
DISK_USAGE=$(df / 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}' || echo "0")
DISK_OPT=""
if df /opt &>/dev/null 2>&1; then
  DISK_OPT_USAGE=$(df /opt 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}' || echo "0")
  # Usa a particao mais cheia entre / e /opt
  if [ "$DISK_OPT_USAGE" -gt "$DISK_USAGE" ] 2>/dev/null; then
    DISK_USAGE="$DISK_OPT_USAGE"
  fi
fi

echo "[OK] Disco: $DISK_USAGE%"

# ----------------------------------------------------------
# Configuracao de Heap do host.xml (informacao de referencia)
# ----------------------------------------------------------
HOST_XML_HEAP_MAX=""
HOST_XML_HEAP_INIT=""

FLUIG_SEARCH_PATHS=(
  "/opt/fluig"
  "/opt/totvs/fluig"
  "/fluig"
  "/home/fluig"
)
for fpath in "${FLUIG_SEARCH_PATHS[@]}"; do
  HOST_XML=$(find "$fpath" -name "host.xml" -maxdepth 5 2>/dev/null | head -1)
  if [ -n "$HOST_XML" ]; then
    HOST_XML_HEAP_MAX=$(grep -oP '(?<=-Xmx)[0-9]+[mMgG]?' "$HOST_XML" 2>/dev/null | head -1 || echo "")
    HOST_XML_HEAP_INIT=$(grep -oP '(?<=-Xms)[0-9]+[mMgG]?' "$HOST_XML" 2>/dev/null | head -1 || echo "")
    break
  fi
done

# ----------------------------------------------------------
# Gerar JSON de saida
# ----------------------------------------------------------
cat > "$OUTPUT_FILE" << ENDJSON
{
  "heap_usage": $HEAP_USAGE,
  "cpu_usage": $CPU_USAGE,
  "memory_usage": $MEMORY_USAGE,
  "disk_usage": $DISK_USAGE,
  "system_memory_usage": $SYSTEM_MEMORY_USAGE,
  "services_status": $SERVICES_STATUS,
  "host_xml_heap_max": "$HOST_XML_HEAP_MAX",
  "host_xml_heap_init": "$HOST_XML_HEAP_INIT",
  "fluig_pid": "$FLUIG_PID"
}
ENDJSON

echo ""
echo "==========================================="
echo "  Health Check concluido!"
echo "  Arquivo gerado: $OUTPUT_FILE"
echo "==========================================="
echo ""
echo "Proximos passos:"
echo "  1. Copie o arquivo '$OUTPUT_FILE' para sua maquina"
echo "  2. No InsightLog, 'Nova Analise' > passo 'Health Check'"
echo "  3. Faca upload do arquivo JSON"
echo ""

if [ -z "$FLUIG_PID" ]; then
  echo "AVISO: O processo Fluig nao foi detectado. Verifique se o servico esta ativo."
fi
