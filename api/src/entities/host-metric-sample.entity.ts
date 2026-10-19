import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Amostra de recursos do host (CPU/memória/disco). Retenção: 7 dias. */
@Entity('host_metric_samples')
export class HostMetricSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;

  @Column({ name: 'cpu_cores', type: 'int' })
  cpuCores: number;

  @Column({ name: 'loadavg1', type: 'double precision' })
  loadavg1: number;

  @Column({ name: 'loadavg5', type: 'double precision' })
  loadavg5: number;

  @Column({ name: 'loadavg15', type: 'double precision' })
  loadavg15: number;

  /** loadavg1 / cores * 100, limitado a 100. */
  @Column({ name: 'cpu_load_pct', type: 'double precision' })
  cpuLoadPct: number;

  @Column({ name: 'mem_total_bytes', type: 'bigint' })
  memTotalBytes: string;

  @Column({ name: 'mem_used_bytes', type: 'bigint' })
  memUsedBytes: string;

  @Column({ name: 'mem_used_pct', type: 'double precision' })
  memUsedPct: number;

  @Column({ name: 'disk_path', type: 'varchar', length: 512 })
  diskPath: string;

  @Column({ name: 'disk_total_bytes', type: 'bigint' })
  diskTotalBytes: string;

  @Column({ name: 'disk_used_bytes', type: 'bigint' })
  diskUsedBytes: string;

  @Column({ name: 'disk_used_pct', type: 'double precision' })
  diskUsedPct: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
