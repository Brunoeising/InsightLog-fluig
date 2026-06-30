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
  recommended_instances: string;
  recommended_heap: string;
  sizing_status: 'ADEQUADO' | 'SUBDIMENSIONADO' | 'SUPERDIMENSIONADO';
  profile: string;
  over_limit: boolean;
  over_limit_note?: string;
}

interface SizingProfile {
  name: string;
  label: string;
  max_registered_users: number;
  max_concurrent_users: number;
  max_daily_publications: number;
  max_processes: number;
  recommended: {
    cpu_cores: number;
    ram_gb: number;
    disk_gb: number;
    heap_max_gb: number;
    heap_initial_gb: number;
    instances: number;
  };
  notes: string;
}

interface SizingRulesFile {
  profiles: SizingProfile[];
  adjustments: {
    doc_volume: { threshold: number; extra_disk_per_100k: number; notes: string };
    integration_volume: { threshold: number; extra_cpu_per_25: number; extra_ram_per_25: number; notes: string };
  };
  over_limit_note: string;
}

const rules = sizingRules as unknown as SizingRulesFile;

export function calculateSizing(input: SizingInput): {
  cpu: number;
  ram: number;
  disk: number;
  instances: number;
  heapMax: number;
  profile: string;
  profileLabel: string;
  overLimit: boolean;
} {
  const profiles = rules.profiles;
  const lastProfile = profiles[profiles.length - 1];

  if (
    input.registered_users > lastProfile.max_registered_users ||
    input.concurrent_users > lastProfile.max_concurrent_users
  ) {
    return {
      cpu: lastProfile.recommended.cpu_cores,
      ram: lastProfile.recommended.ram_gb,
      disk: lastProfile.recommended.disk_gb,
      instances: lastProfile.recommended.instances,
      heapMax: lastProfile.recommended.heap_max_gb,
      profile: lastProfile.name,
      profileLabel: lastProfile.label,
      overLimit: true,
    };
  }

  let selectedProfile = profiles[0];
  for (const p of profiles) {
    if (
      input.registered_users <= p.max_registered_users &&
      input.concurrent_users <= p.max_concurrent_users
    ) {
      selectedProfile = p;
      break;
    }
  }

  let cpu = selectedProfile.recommended.cpu_cores;
  let ram = selectedProfile.recommended.ram_gb;
  let disk = selectedProfile.recommended.disk_gb;
  const instances = selectedProfile.recommended.instances;
  const heapMax = selectedProfile.recommended.heap_max_gb;

  const adj = rules.adjustments;

  if (input.doc_volume > 0) {
    const extra = Math.ceil(input.doc_volume / 100000);
    disk += extra * adj.doc_volume.extra_disk_per_100k;
  }

  if (input.integration_volume > adj.integration_volume.threshold) {
    const extra = Math.ceil((input.integration_volume - adj.integration_volume.threshold) / 25);
    cpu += extra * adj.integration_volume.extra_cpu_per_25;
    ram += extra * adj.integration_volume.extra_ram_per_25;
  }

  return {
    cpu,
    ram,
    disk,
    instances,
    heapMax,
    profile: selectedProfile.name,
    profileLabel: selectedProfile.label,
    overLimit: false,
  };
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
  const status = compareSizing(
    { cpu: recommended.cpu, ram: recommended.ram, disk: recommended.disk },
    current
  );

  return {
    recommended_cpu: `${recommended.cpu} vCPU`,
    recommended_ram: `${recommended.ram} GB`,
    recommended_disk: `${recommended.disk} GB`,
    recommended_instances: `${recommended.instances} instancia(s)`,
    recommended_heap: `${recommended.heapMax} GB (max-size no host.xml)`,
    sizing_status: status,
    profile: recommended.profileLabel,
    over_limit: recommended.overLimit,
    over_limit_note: recommended.overLimit ? rules.over_limit_note : undefined,
  };
}
