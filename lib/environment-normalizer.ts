import { z } from 'zod';
import {
  EnvironmentInventory,
  EnvironmentInventorySource,
  HealthCheckData,
  NormalizedHealthCheckUpload,
  NormalizedInventoryUpload,
} from '@/lib/types';

const inventoryKeys = [
  'os_name',
  'os_version',
  'os_build',
  'architecture',
  'cpu_cores',
  'cpu_vcpu',
  'ram_gb',
  'disk_gb',
  'java_version',
  'java_vendor',
  'java_home',
  'fluig_version',
  'fluig_patch',
  'fluig_directory',
  'database_type',
  'database_version',
  'database_charset',
  'database_collation',
  'appserver_type',
  'nginx_version',
  'apache_version',
] as const;

const healthCheckKeys = [
  'heap_usage',
  'heapUsage',
  'cpu_usage',
  'cpuUsage',
  'memory_usage',
  'memoryUsage',
  'disk_usage',
  'diskUsage',
  'system_memory_usage',
  'systemMemoryUsage',
  'services_status',
  'servicesStatus',
  'host_xml_heap_max',
  'hostXmlHeapMax',
  'host_xml_heap_init',
  'hostXmlHeapInit',
  'fluig_pid',
  'fluigPid',
] as const;

const inventorySchema = z.object(Object.fromEntries(
  inventoryKeys.map((key) => [key, z.union([z.string(), z.number(), z.null()]).optional()])
) as Record<typeof inventoryKeys[number], z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>>>).passthrough();

const healthCheckSchema = z.object({
  heap_usage: z.union([z.string(), z.number(), z.null()]).optional(),
  heapUsage: z.union([z.string(), z.number(), z.null()]).optional(),
  cpu_usage: z.union([z.string(), z.number(), z.null()]).optional(),
  cpuUsage: z.union([z.string(), z.number(), z.null()]).optional(),
  memory_usage: z.union([z.string(), z.number(), z.null()]).optional(),
  memoryUsage: z.union([z.string(), z.number(), z.null()]).optional(),
  disk_usage: z.union([z.string(), z.number(), z.null()]).optional(),
  diskUsage: z.union([z.string(), z.number(), z.null()]).optional(),
  system_memory_usage: z.union([z.string(), z.number(), z.null()]).optional(),
  systemMemoryUsage: z.union([z.string(), z.number(), z.null()]).optional(),
  services_status: z.record(z.string()).nullable().optional(),
  servicesStatus: z.record(z.string()).nullable().optional(),
  host_xml_heap_max: z.union([z.string(), z.number(), z.null()]).optional(),
  hostXmlHeapMax: z.union([z.string(), z.number(), z.null()]).optional(),
  host_xml_heap_init: z.union([z.string(), z.number(), z.null()]).optional(),
  hostXmlHeapInit: z.union([z.string(), z.number(), z.null()]).optional(),
  fluig_pid: z.union([z.string(), z.number(), z.null()]).optional(),
  fluigPid: z.union([z.string(), z.number(), z.null()]).optional(),
}).passthrough();

export const emptyEnvironmentInventory: EnvironmentInventory = {
  os_name: '',
  os_version: '',
  os_build: '',
  architecture: '',
  cpu_cores: '',
  cpu_vcpu: '',
  ram_gb: '',
  disk_gb: '',
  java_version: '',
  java_vendor: '',
  java_home: '',
  fluig_version: '',
  fluig_patch: '',
  fluig_directory: '',
  database_type: '',
  database_version: '',
  database_charset: '',
  database_collation: '',
  appserver_type: '',
  nginx_version: '',
  apache_version: '',
};

function toCleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(numberValue) ? numberValue : null;
}

function detectInventorySource(data: Record<string, unknown>, fallback: EnvironmentInventorySource): EnvironmentInventorySource {
  const osName = toCleanString(data.os_name).toLowerCase();
  if (osName.includes('windows')) return 'windows_script';
  if (osName.includes('linux') || osName.includes('ubuntu') || osName.includes('red hat') || osName.includes('centos') || osName.includes('oracle')) return 'linux_script';
  return fallback;
}

function normalizeDatabaseType(databaseType: string, databaseVersion: string): string {
  const value = databaseType.trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  if (lower.includes('sql server') && databaseVersion && !lower.includes(databaseVersion.toLowerCase())) {
    return `Microsoft SQL Server ${databaseVersion}`;
  }
  if (lower === 'oracle' && databaseVersion) return `Oracle ${databaseVersion}`;
  if (lower === 'mysql' && databaseVersion) return `MySQL ${databaseVersion}`;
  return value;
}

export function normalizeInventoryUpload(
  rawData: unknown,
  currentInventory: EnvironmentInventory = emptyEnvironmentInventory,
  fallbackSource: EnvironmentInventorySource = 'uploaded_json'
): NormalizedInventoryUpload {
  const parsed = inventorySchema.parse(rawData);
  const rawRecord = parsed as Record<string, unknown>;
  const inventory = { ...currentInventory };
  let importedFields = 0;

  for (const key of inventoryKeys) {
    if (Object.prototype.hasOwnProperty.call(rawRecord, key)) {
      inventory[key] = toCleanString(rawRecord[key]);
      importedFields += 1;
    }
  }

  inventory.database_type = normalizeDatabaseType(inventory.database_type, inventory.database_version);

  if (!inventory.cpu_vcpu && inventory.cpu_cores) inventory.cpu_vcpu = inventory.cpu_cores;
  if (!inventory.cpu_cores && inventory.cpu_vcpu) inventory.cpu_cores = inventory.cpu_vcpu;

  const ignoredFields = Object.keys(rawRecord).filter((key) => !inventoryKeys.includes(key as typeof inventoryKeys[number]));

  return {
    inventory,
    importedFields,
    ignoredFields,
    source: detectInventorySource(rawRecord, fallbackSource),
  };
}

export function normalizeHealthCheckUpload(rawData: unknown): NormalizedHealthCheckUpload {
  const parsed = healthCheckSchema.parse(rawData);
  const rawRecord = parsed as Record<string, unknown>;
  const healthCheck: Partial<HealthCheckData> = {
    heapUsage: toNullableNumber(rawRecord.heap_usage ?? rawRecord.heapUsage),
    cpuUsage: toNullableNumber(rawRecord.cpu_usage ?? rawRecord.cpuUsage),
    memoryUsage: toNullableNumber(rawRecord.memory_usage ?? rawRecord.memoryUsage),
    diskUsage: toNullableNumber(rawRecord.disk_usage ?? rawRecord.diskUsage),
    systemMemoryUsage: toNullableNumber(rawRecord.system_memory_usage ?? rawRecord.systemMemoryUsage),
    servicesStatus: ((rawRecord.services_status ?? rawRecord.servicesStatus) && typeof (rawRecord.services_status ?? rawRecord.servicesStatus) === 'object')
      ? (rawRecord.services_status ?? rawRecord.servicesStatus) as Record<string, string>
      : null,
    hostXmlHeapMax: toCleanString(rawRecord.host_xml_heap_max ?? rawRecord.hostXmlHeapMax) || null,
    hostXmlHeapInit: toCleanString(rawRecord.host_xml_heap_init ?? rawRecord.hostXmlHeapInit) || null,
    fluigPid: toCleanString(rawRecord.fluig_pid ?? rawRecord.fluigPid) || null,
  };

  const importedFields = healthCheckKeys.filter((key) => Object.prototype.hasOwnProperty.call(rawRecord, key)).length;
  const ignoredFields = Object.keys(rawRecord).filter((key) => !healthCheckKeys.includes(key as typeof healthCheckKeys[number]));

  return { healthCheck, importedFields, ignoredFields };
}

export function toInventoryRecord(inventory: EnvironmentInventory): Record<string, string> {
  return inventoryKeys.reduce((record, key) => {
    record[key] = toCleanString(inventory[key]);
    return record;
  }, {} as Record<string, string>);
}