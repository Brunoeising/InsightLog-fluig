import readinessChecklist from './readiness-rules/pre-install-checklist.json';
import { supabase } from './supabase-client';

export interface ReadinessItem {
  id: string;
  category: string;
  categoryLabel: string;
  requirement: string;
  validationHint: string;
  isMandatory: boolean;
  status: 'pass' | 'fail' | 'unchecked' | 'na';
  details?: string;
}

export interface ReadinessResult {
  items: ReadinessItem[];
  score: number;
  overallStatus: 'ready' | 'not_ready' | 'partial';
  blockers: string[];
}

export function getChecklistItems(): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  for (const category of readinessChecklist.categories) {
    for (const item of category.items) {
      items.push({
        id: item.id,
        category: category.id,
        categoryLabel: category.label,
        requirement: item.requirement,
        validationHint: item.validationHint,
        isMandatory: item.isMandatory,
        status: 'unchecked',
      });
    }
  }
  return items;
}

export function evaluateReadiness(items: ReadinessItem[]): ReadinessResult {
  const checkedItems = items.filter(i => i.status !== 'unchecked' && i.status !== 'na');
  const passedItems = checkedItems.filter(i => i.status === 'pass');
  const failedMandatory = items.filter(i => i.isMandatory && i.status === 'fail');

  const score = checkedItems.length > 0
    ? Math.round((passedItems.length / checkedItems.length) * 100)
    : 0;

  const blockers = failedMandatory.map(i => i.requirement);

  let overallStatus: 'ready' | 'not_ready' | 'partial' = 'not_ready';
  if (failedMandatory.length === 0 && score >= 80) overallStatus = 'ready';
  else if (failedMandatory.length === 0 && score >= 50) overallStatus = 'partial';

  return { items, score, overallStatus, blockers };
}

export function generateReadinessScript(os: 'linux' | 'windows'): string {
  if (os === 'linux') {
    return `#!/bin/bash
# =============================================================
# InsightLog - Script de Verificacao de Prontidao para Fluig
# Gerado automaticamente
# =============================================================

echo "=== Verificacao de Prontidao para Instalacao Fluig ==="
echo ""

# Sistema Operacional
echo "[OS] Verificando sistema operacional..."
cat /etc/os-release 2>/dev/null | grep -E "^(NAME|VERSION)="
echo "[OS] Arquitetura: $(uname -m)"
echo "[OS] Locale: $(locale | head -1)"
echo ""

# Java
echo "[JAVA] Verificando Java..."
if command -v java &>/dev/null; then
  java -version 2>&1
  echo "[JAVA] JAVA_HOME=$JAVA_HOME"
else
  echo "[JAVA] ERRO: Java nao encontrado no PATH"
fi
echo ""

# Portas
echo "[REDE] Verificando portas..."
for port in 8080 8443 9990; do
  if ss -tlnp 2>/dev/null | grep -q ":$port "; then
    echo "[REDE] ALERTA: Porta $port em uso"
  else
    echo "[REDE] OK: Porta $port disponivel"
  fi
done
echo ""

# Disco
echo "[DISCO] Espaco em disco..."
df -h / | tail -1
echo ""

# Memoria
echo "[MEM] Memoria disponivel..."
free -h
echo ""

# ulimits
echo "[ULIMIT] Verificando limites..."
echo "[ULIMIT] nofile: $(ulimit -n)"
echo "[ULIMIT] nproc: $(ulimit -u)"
echo ""

# NTP
echo "[NTP] Verificando sincronizacao..."
timedatectl status 2>/dev/null | grep -E "(NTP|synchronized)"
echo ""

# Swap
echo "[SWAP] Verificando swap..."
swapon --show 2>/dev/null || echo "Nenhuma swap configurada"
echo ""

echo "=== Verificacao concluida ==="
`;
  }

  return `# =============================================================
# InsightLog - Script de Verificacao de Prontidao para Fluig
# Windows PowerShell
# =============================================================

Write-Host "=== Verificacao de Prontidao para Instalacao Fluig ===" -ForegroundColor Cyan
Write-Host ""

# Sistema Operacional
Write-Host "[OS] Verificando sistema operacional..." -ForegroundColor Yellow
(Get-CimInstance Win32_OperatingSystem).Caption
Write-Host "[OS] Arquitetura: $([Environment]::Is64BitOperatingSystem)"
Write-Host ""

# Java
Write-Host "[JAVA] Verificando Java..." -ForegroundColor Yellow
try {
  java -version 2>&1 | ForEach-Object { Write-Host $_ }
  Write-Host "[JAVA] JAVA_HOME=$env:JAVA_HOME"
} catch {
  Write-Host "[JAVA] ERRO: Java nao encontrado" -ForegroundColor Red
}
Write-Host ""

# Portas
Write-Host "[REDE] Verificando portas..." -ForegroundColor Yellow
@(8080, 8443, 9990) | ForEach-Object {
  $port = $_
  $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if ($conn) { Write-Host "[REDE] ALERTA: Porta $port em uso" -ForegroundColor Red }
  else { Write-Host "[REDE] OK: Porta $port disponivel" -ForegroundColor Green }
}
Write-Host ""

# Disco
Write-Host "[DISCO] Espaco em disco..." -ForegroundColor Yellow
Get-PSDrive C | Format-Table Used, Free -AutoSize
Write-Host ""

# Memoria
Write-Host "[MEM] Memoria disponivel..." -ForegroundColor Yellow
$mem = Get-CimInstance Win32_OperatingSystem
Write-Host "Total: $([math]::Round($mem.TotalVisibleMemorySize / 1MB, 1)) GB"
Write-Host "Livre: $([math]::Round($mem.FreePhysicalMemory / 1MB, 1)) GB"
Write-Host ""

Write-Host "=== Verificacao concluida ===" -ForegroundColor Cyan
`;
}

export async function saveReadinessAssessment(data: {
  environmentName: string;
  fluigVersion: string;
  items: ReadinessItem[];
  result: ReadinessResult;
  aiRecommendations?: string;
}) {
  const { data: row, error } = await supabase
    .from('readiness_assessments')
    .insert({
      environment_name: data.environmentName,
      fluig_version: data.fluigVersion,
      assessment_data: data.items as any,
      overall_status: data.result.overallStatus,
      blockers: data.result.blockers,
      ai_recommendations: data.aiRecommendations || null,
      score: data.result.score,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return row;
}

export async function fetchReadinessHistory(page: number = 1, pageSize: number = 10) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('readiness_assessments')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { assessments: data || [], total: count || 0 };
}
