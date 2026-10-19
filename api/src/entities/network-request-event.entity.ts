import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** Request HTTP vista nos access logs das previews (e log opcional do host). */
@Entity('network_request_events')
@Unique(['lineHash'])
export class NetworkRequestEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'remote_addr', type: 'varchar', length: 64 })
  remoteAddr: string;

  @Column({ name: 'method', type: 'varchar', length: 16 })
  method: string;

  /** Path sem query. */
  @Column({ name: 'path', type: 'varchar', length: 2048 })
  path: string;

  /** Query string ou trecho do request line (access log não tem body). */
  @Column({ name: 'payload', type: 'varchar', length: 2048, nullable: true })
  payload: string | null;

  @Column({ name: 'status_code', type: 'int' })
  statusCode: number;

  /** País/cidade quando GeoIP disponível; "Local" para IPs privados. */
  @Column({ name: 'region', type: 'varchar', length: 256, nullable: true })
  region: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ name: 'project_slug', type: 'varchar', length: 128, nullable: true })
  projectSlug: string | null;

  @Column({ name: 'branch_slug', type: 'varchar', length: 256, nullable: true })
  branchSlug: string | null;

  @Column({ name: 'line_hash', type: 'varchar', length: 64 })
  lineHash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
