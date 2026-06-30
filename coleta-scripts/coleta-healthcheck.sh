#!/bin/bash
# ============================================================
# Health Check Fluig - Linux
# InsightLog Environment Analyzer
# ============================================================
# Coleta metricas de saude do ambiente Fluig: uso de heap,
# CPU, memoria, disco e status dos servicos.
#
# Uso: chmod +x coleta-healthcheck.sh && ./coleta-healthcheck.sh
# ============================================================

OUTPUT_FILE="healthcheck.json"

echo "Coletando metricas de health check..."

# Status dos servicos Fluig
SERVICES_STATUS="{}"
if command -v systemctl &> /dev/null; then
  FLUIG_STATUS=$(systemctl is-active fluig 2>/dev/null || echo "unknown")
  WILDFLY_STATUS=$(systemctl is-active wildfly 2>/dev/null || echo "unknown")
  NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null || echo "unknown")
  SERVICES_STATUS="{\"fluig\":\"$FLUIG_STATUS\",\"wildfly\":\"$WILDFLY_STATUS\",\"nginx\":\"$NGINX_STATUS\"}"
fi

# Uso de CPU do processo Fluig
FLUIG_PID=$(pgrep -f "fluig\|wildfly\|jboss" 2>/dev/null | head -1 || echo "")
CPU_USAGE=0
MEMORY_USAGE=0
HEAP_USAGE=0

if [ -n "$FLUIG_PID" ]; then
  CPU_USAGE=$(top -b -n1 -p "$FLUIG_PID" 2>/dev/null | tail -1 | awk '{print $9}' || echo "0")
  MEMORY_USAGE=$(ps -p "$FLUIG_PID" -o %mem --no-headers 2>/dev/null || echo "0")

  # Heap via jstat (se disponivel)
  if command -v jstat &> /dev/null; then
    HEAP_OUTPUT=$(jstat -gc "$FLUIG_PID" 2>/dev/null || echo "")
    if [ -n "$HEAP_OUTPUT" ]; then
      HEAP_USAGE=$(echo "$HEAP_OUTPUT" | awk 'NR==2{total=$1+$2; used=$3+$5+$7; if(total>0) printf "%.1f", (used/total)*100; else print 0}')
    fi
  fi
fi

# Uso de disco
DISK_USAGE=$(df / 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%' || echo "0")

# Gerar JSON
cat > "$OUTPUT_FILE" << EOF
{
  "heap_usage": $HEAP_USAGE,
  "cpu_usage": $CPU_USAGE,
  "memory_usage": $MEMORY_USAGE,
  "disk_usage": $DISK_USAGE,
  "services_status": $SERVICES_STATUS
}
EOF

echo "Arquivo $OUTPUT_FILE gerado com sucesso!"
