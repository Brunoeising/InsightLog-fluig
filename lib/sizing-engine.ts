import sizingRules from './portability-matrix/sizing-rules.json';

export interface SizingInput {
  registered_users: number;
  concurrent_users: number;
  process_count: number;
  doc_volume: number;
  dataset_count: number;
  integration_volume: number;
}

export interface SizingResult {
  recommended_cpu: string;
  recommended_ram: string;
  recommended_disk: string;
  sizing_status: 'ADEQUADO' | 'SUBDIMENSIONADO' | 'SUPERDIMENSIONADO';
  profile: string;
}

interface SizingRulesFile {
  profiles: Array<{
    name: string;
    label: string;
    max_registered_users: number;
    max_concurrent_users: number;
    recommended: { cpu_cores: number; ram_gb: number; disk_gb: number };
  }>;
  adjustments: {
    process_count: { threshold: number; extra_cpu_per_100: number; extra_ram_per_100: number };
    doc_volume: { threshold: number; extra_disk_per_100k: number };
    dataset_count: { threshold: number; extra_cpu_per_50: number; extra_ram_per_50: number };
    integration_volume: { threshold: number; extra_cpu_per_25: number; extra_ram_per_25: number };
  };
}

const rules = sizingRules as unknown as SizingRulesFile;

export function calculateSizing(input: SizingInput): {
  cpu: number;
  ram: number;
  disk: number;
  profile: string;
} {
  let profile = rules.profiles[0];
  for (const p of rules.profiles) {
    if (input.registered_users <= p.max_registered_users && input.concurrent_users <= p.max_concurrent_users) {
      profile = p;
      break;
    }
    profile = p;
  }

  let cpu = profile.recommended.cpu_cores;
  let ram = profile.recommended.ram_gb;
  let disk = profile.recommended.disk_gb;

  const adj = rules.adjustments;

  if (input.process_count > adj.process_count.threshold) {
    const extra = Math.ceil((input.process_count - adj.process_count.threshold) / 100);
    cpu += extra * adj.process_count.extra_cpu_per_100;
    ram += extra * adj.process_count.extra_ram_per_100;
  }

  if (input.doc_volume > adj.doc_volume.threshold) {
    const extra = Math.ceil((input.doc_volume - adj.doc_volume.threshold) / 100000);
    disk += extra * adj.doc_volume.extra_disk_per_100k;
  }

  if (input.dataset_count > adj.dataset_count.threshold) {
    const extra = Math.ceil((input.dataset_count - adj.dataset_count.threshold) / 50);
    cpu += extra * adj.dataset_count.extra_cpu_per_50;
    ram += extra * adj.dataset_count.extra_ram_per_50;
  }

  if (input.integration_volume > adj.integration_volume.threshold) {
    const extra = Math.ceil((input.integration_volume - adj.integration_volume.threshold) / 25);
    cpu += extra * adj.integration_volume.extra_cpu_per_25;
    ram += extra * adj.integration_volume.extra_ram_per_25;
  }

  return { cpu, ram, disk, profile: profile.label };
}

export function compareSizing(
  recommended: { cpu: number; ram: number; disk: number },
  current: { cpu: number; ram: number; disk: number }
): 'ADEQUADO' | 'SUBDIMENSIONADO' | 'SUPERDIMENSIONADO' {
  const cpuRatio = current.cpu / recommended.cpu;
  const ramRatio = current.ram / recommended.ram;
  const diskRatio = current.disk / recommended.disk;
  const avgRatio = (cpuRatio + ramRatio + diskRatio) / 3;

  if (avgRatio < 0.8) return 'SUBDIMENSIONADO';
  if (avgRatio > 1.5) return 'SUPERDIMENSIONADO';
  return 'ADEQUADO';
}

export function runSizingSimulation(
  input: SizingInput,
  current: { cpu: number; ram: number; disk: number }
): SizingResult {
  const recommended = calculateSizing(input);
  const status = compareSizing(recommended, current);

  return {
    recommended_cpu: `${recommended.cpu} vCPU`,
    recommended_ram: `${recommended.ram} GB`,
    recommended_disk: `${recommended.disk} GB`,
    sizing_status: status,
    profile: recommended.profile,
  };
}
