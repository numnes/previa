import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ClusterKeyScope = 'read' | 'write';

/**
 * Chave gerada neste nó para que outros hosts Previa se conectem.
 * - `read`: leitura de dashboard/projetos/instâncias + logs.
 * - `write`: tudo de `read` + pausar/ativar/remover instâncias.
 */
@Entity('cluster_keys')
export class ClusterKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'key_hash', unique: true })
  keyHash: string;

  @Column({ default: 'cluster' })
  label: string;

  @Column({ default: 'read' })
  scope: ClusterKeyScope;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
