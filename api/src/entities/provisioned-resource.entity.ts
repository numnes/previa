import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** image | dockerfile | compose */
export type ResourceKind = 'image' | 'dockerfile' | 'compose';

/** starting | running | paused | error */
export type ResourceStatus = 'starting' | 'running' | 'paused' | 'error';

@Entity('provisioned_resources')
@Unique('UQ_provisioned_resource_slug', ['slug'])
export class ProvisionedResource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  slug: string;

  @Column({ type: 'varchar', length: 160 })
  label: string;

  @Column({ type: 'varchar', length: 24 })
  kind: ResourceKind;

  /** Imagem Docker (kind=image), ex.: redis:7-alpine */
  @Column({ type: 'varchar', length: 512, nullable: true })
  image: string | null;

  @Column({ type: 'text', nullable: true })
  dockerfile: string | null;

  @Column({ name: 'compose_yaml', type: 'text', nullable: true })
  composeYaml: string | null;

  /** Portas do container a publicar. */
  @Column({ name: 'container_ports', type: 'jsonb', default: [] })
  containerPorts: number[];

  /** Env passada ao container. */
  @Column({ name: 'env_vars', type: 'jsonb', default: {} })
  envVars: Record<string, string>;

  /** Mapa porta-container → porta no host, após start. */
  @Column({ name: 'published_ports', type: 'jsonb', default: {} })
  publishedPorts: Record<string, number>;

  /** Envs geradas para o consumidor copiar (HOST/PORT + runtime). */
  @Column({ name: 'connection_env', type: 'jsonb', default: {} })
  connectionEnv: Record<string, string>;

  @Column({ type: 'varchar', length: 24, default: 'paused' })
  status: ResourceStatus;

  @Column({ name: 'runtime_name', type: 'varchar', length: 128 })
  runtimeName: string;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
