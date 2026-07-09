import { LogEntry, PerformanceIssue } from './types';

export const PERFORMANCE_PATTERNS = {
  // Any Dataset*Service* class that logs "executou por N segundos" (also accepts "executou em" / "demorou")
  datasetSync: /(Dataset[A-Za-z]*Service(?:Bean|Impl)?|DatasetMetaListServiceBean|DatasetMetadataServiceBean)\.[A-Za-z0-9_$]+\s+(?:executou\s+por|executou\s+em|demorou)\s+(\d+)\s+segundos/i,

  // Any invokeFunction.<name> — broadened from the previous whitelist (createDataset|servicetask64)
  datasetExecution: /invokeFunction\.([A-Za-z0-9_$#\-]+)(?:\.[A-Za-z0-9_$#\-]+)*\s+(ja\s+esta\s+sendo\s+executado|executou)\s+(?:por|em)\s+(\d+)\s+segundos/i,

  // Blocked concurrent execution — same customization running simultaneously (kept as safety net)
  datasetBlocked: /invokeFunction\.\S+\s+ja\s+esta\s+sendo\s+executado\s+por\s+(\d+)\s+segundos/i,

  // JSChronos generic execution timer
  // Fluig log format after timestamp: "WARN  [com.fluig.monitoring.jschronos.JSChronos] (thread-name) OperationName executou por N segundos"
  // The (thread-name) part between JSChronos] and the operation name is optional
  jschronos: /JSChronos\]?(?:\s+\([^)]+\))?\s+([^\s]+)\s+(?:executou\s+por|executou\s+em|demorou)\s+(\d+)\s+segundos/i,

  // Anti-pattern: FluigDS/FluigDSRO used in customization (causes pool contention)
  fluigDsAntipattern: /\b(FluigDS|FluigDSRO)\b/,

  // JVM over-allocation — limit per WildFly instance is 16 GB
  jvmOverLimit: /-Xmx\s*(\d+)[gG]/,

  // Connection pool out of range in standalone.xml
  poolOutOfRange: /<max-pool-size>\s*(\d+)\s*<\/max-pool-size>/,

  memory: /(OutOfMemoryError|heap space|GC overhead limit exceeded)/i,
  database: /(deadlock|timeout.*sql|connection pool|blocking-timeout-millis)/i,
};

const MIN_SECONDS = 30;
const MIN_BLOCKED_SECONDS = 10;

export function getPerformanceIssuesForEntry(
  entry: LogEntry,
  previousContext: string,
  seenOnceTypes: Set<string>
): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  const { message, timestamp } = entry;

  // Fast substring pre-checks avoid regex work on non-matching lines
  if (/dataset/i.test(message) && !/invokeFunction/i.test(message)) {
    const datasetSyncMatch = message.match(PERFORMANCE_PATTERNS.datasetSync);
    if (datasetSyncMatch) {
      const duration = parseInt(datasetSyncMatch[2]);
      if (duration >= MIN_SECONDS) {
        issues.push({
          type: 'DATASET_SYNC',
          message: `Sincronização de dataset (${datasetSyncMatch[1]}) levando ${duration} segundos`,
          timestamp,
          duration,
          context: previousContext || message,
          suggestion:
            'Sincronização de dataset com tempo elevado. Otimize as queries do dataset, revise o volume de dados e considere paginação. Verifique se o dataset usa AppDS (não FluigDS/FluigDSRO).',
        });
      }
    }
  }

  if (message.includes('invokeFunction')) {
    const datasetExecMatch = message.match(PERFORMANCE_PATTERNS.datasetExecution);
    if (datasetExecMatch) {
      const funcName = datasetExecMatch[1];
      const duration = parseInt(datasetExecMatch[3]);
      const isBlocked = datasetExecMatch[2]?.toLowerCase().includes('ja esta sendo executado');
      if (duration >= MIN_SECONDS || (isBlocked && duration >= MIN_BLOCKED_SECONDS)) {
        issues.push({
          type: 'DATASET_EXECUTION',
          message: isBlocked
            ? `Execução concorrente bloqueada em invokeFunction.${funcName} por ${duration} segundos`
            : `Execução de dataset/evento invokeFunction.${funcName} levando ${duration} segundos`,
          timestamp,
          duration,
          context: message,
          suggestion: isBlocked
            ? 'Execução concorrente bloqueada: a mesma customização está rodando em paralelo e aguardando recurso. Possível lock em banco ou chamada síncrona a serviço externo demorado. Considere integração assíncrona.'
            : 'Dataset ou evento customizado com tempo elevado. Verifique se usa AppDS ao invés de FluigDS/FluigDSRO. Otimize queries e evite chamadas síncronas a serviços externos.',
        });
      }
    } else {
      // Fallback for lines the primary pattern misses
      const blockedMatch = message.match(PERFORMANCE_PATTERNS.datasetBlocked);
      if (blockedMatch) {
        const duration = parseInt(blockedMatch[1]);
        if (duration >= MIN_BLOCKED_SECONDS) {
          issues.push({
            type: 'DATASET_EXECUTION',
            message: `Customização bloqueada aguardando execução por ${duration} segundos`,
            timestamp,
            duration,
            context: message,
            suggestion:
              'Customização aguardando execução concorrente. Verifique locks de banco de dados ou chamadas a serviços externos lentos nesta customização.',
          });
        }
      }
    }
  }

  if (/JSChronos/i.test(message)) {
    const jschronosMatch = message.match(PERFORMANCE_PATTERNS.jschronos);
    if (jschronosMatch) {
      const duration = parseInt(jschronosMatch[2]);
      const ident = jschronosMatch[1];
      if (duration >= MIN_SECONDS) {
        issues.push({
          type: 'DATASET_EXECUTION',
          message: `Ponto de customização JSChronos ${ident} executou por ${duration} segundos`,
          timestamp,
          duration,
          context: message,
          suggestion:
            'Customização com tempo de execução elevado detectada via JSChronos. Revise queries, chamadas externas e uso de datasource. Tempo acima de mil segundos sugere sincronização travada.',
        });
      }
    }
  }

  if (!seenOnceTypes.has('FLUIG_DS') && (message.includes('FluigDS') || message.includes('FluigDSRO'))) {
    if (PERFORMANCE_PATTERNS.fluigDsAntipattern.test(message)) {
      seenOnceTypes.add('FLUIG_DS');
      issues.push({
        type: 'DATABASE',
        message: 'Anti-padrão detectado: uso de FluigDS/FluigDSRO em customização',
        timestamp,
        context: message,
        suggestion:
          'CRÍTICO: FluigDS ou FluigDSRO está sendo usado em dataset/evento customizado. Isso gera disputa de pool de conexão com o próprio Fluig e pode causar lentidão ou indisponibilidade. Migre o desenvolvimento para AppDS.',
      });
    }
  }

  if (!seenOnceTypes.has('JVM_OVER_LIMIT') && message.includes('-Xmx')) {
    const jvmMatch = message.match(PERFORMANCE_PATTERNS.jvmOverLimit);
    if (jvmMatch) {
      const heapGb = parseInt(jvmMatch[1]);
      if (heapGb > 16) {
        seenOnceTypes.add('JVM_OVER_LIMIT');
        issues.push({
          type: 'MEMORY',
          message: `JVM configurada com -Xmx${heapGb}g (limite recomendado: 16 GB por instância)`,
          timestamp,
          context: message,
          suggestion: `Heap de ${heapGb}GB ultrapassa o limite de 16 GB por instância JBoss/WildFly. Avalie escalonamento horizontal com múltiplas instâncias.`,
        });
      }
    }
  }

  if (!seenOnceTypes.has('POOL_OUT_OF_RANGE') && message.includes('max-pool-size')) {
    const poolMatch = message.match(PERFORMANCE_PATTERNS.poolOutOfRange);
    if (poolMatch) {
      const poolSize = parseInt(poolMatch[1]);
      if (poolSize < 50 || poolSize > 200) {
        seenOnceTypes.add('POOL_OUT_OF_RANGE');
        issues.push({
          type: 'DATABASE',
          message: `Pool de conexões com max-pool-size=${poolSize} (faixa recomendada: 50-200)`,
          timestamp,
          context: message,
          suggestion:
            poolSize < 50
              ? `Pool subdimensionado (${poolSize}). Aumente max-pool-size para 50-200 no standalone.xml.`
              : `Pool superdimensionado (${poolSize}). Reduza max-pool-size para 50-200 no standalone.xml.`,
        });
      }
    }
  }

  if (message.includes('OutOfMemoryError') || message.includes('heap space') || message.includes('GC overhead')) {
    if (PERFORMANCE_PATTERNS.memory.test(message)) {
      issues.push({
        type: 'MEMORY',
        message: 'Problema de alocação de memória JVM detectado',
        timestamp,
        context: message,
        suggestion:
          'OutOfMemoryError ou GC overhead detectado. Revise as configurações -Xms/-Xmx no standalone.conf (limite: 16 GB por instância WildFly). Monitore heap no WCMADMIN > Health. Verifique memory leaks em datasets/eventos customizados.',
      });
    }
  }

  if (
    message.includes('deadlock') ||
    message.includes('timeout') ||
    message.includes('connection pool') ||
    message.includes('blocking-timeout')
  ) {
    if (PERFORMANCE_PATTERNS.database.test(message)) {
      issues.push({
        type: 'DATABASE',
        message: 'Problema de performance no banco de dados detectado',
        timestamp,
        context: message,
        suggestion:
          'Deadlock, timeout SQL ou esgotamento de pool de conexões. Revise o max-pool-size no standalone.xml (50-200), otimize queries lentas e verifique transações de longa duração.',
      });
    }
  }

  return issues;
}
