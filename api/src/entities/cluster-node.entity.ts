import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Nó remoto configurado neste painel (credenciais para fan-out). */
@Entity('cluster_nodes')
export class ClusterNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  label: string;

  @Column({ name: 'base_url' })
  baseUrl: string;

  /** Chave cluster remota criptografada com PREVIA_CLUSTER_SECRET. */
  @Column({ name: 'api_key' })
  apiKey: string;

  /** Capacidade detectada da chave do nó remoto (`read` ou `write`). */
  @Column({ default: 'read' })
  scope: 'read' | 'write';

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
