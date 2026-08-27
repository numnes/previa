import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';

/** waiting | deploying | active | paused | error */
@Entity('preview_instances')
@Unique('UQ_preview_instance_project_branch', ['projectId', 'branch'])
export class PreviewInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  /** Nome da branch no Git (ex.: feature/foo). */
  @Column({ type: 'varchar' })
  branch: string;

  /** Slug usado no path nginx / PM2 (sanitizado no core). */
  @Column({ name: 'branch_slug', type: 'varchar' })
  branchSlug: string;

  @Column({ name: 'pm2_name', type: 'varchar' })
  pm2Name: string;

  /** pm2 | docker */
  @Column({ type: 'varchar', length: 16, default: 'pm2' })
  runner: string;

  /** waiting | deploying | active | paused | error — default para linhas legadas. */
  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: string;

  @Column({ type: 'int', nullable: true })
  port: number | null;

  /** Última mensagem de erro do deploy (quando status = error). */
  @Column({ name: 'last_deploy_error', type: 'text', nullable: true })
  lastDeployError: string | null;

  /** Momento em que a instância entrou em status active (para limite de tempo ativo). */
  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  /**
   * true = pausada por idle (nginx aponta para wake); false = pause manual / lifetime.
   * Wake sob demanda só se aplica quando true.
   */
  @Column({ name: 'idle_sleep', type: 'boolean', default: false })
  idleSleep: boolean;

  /** Comentário ClickUp já enviado para esta instância (evita spam no wake). */
  @Column({ name: 'clickup_commented_at', type: 'timestamptz', nullable: true })
  clickupCommentedAt: Date | null;

  /**
   * Task ID (custom ou interno) vinculado à instância.
   * Preenchido por override manual ou resolvido a partir do nome da branch.
   */
  @Column({ name: 'clickup_task_id', type: 'varchar', nullable: true })
  clickupTaskId: string | null;

  /** URL da tarefa no ClickUp (colada ou retornada pela API). */
  @Column({ name: 'clickup_task_url', type: 'varchar', nullable: true })
  clickupTaskUrl: string | null;

  /** Status em texto da tarefa (cache; atualizado no detalhe / ao vincular). */
  @Column({ name: 'clickup_task_status', type: 'varchar', nullable: true })
  clickupTaskStatus: string | null;

  /**
   * true = vínculo manual (URL colada): mostra link/status, nunca comenta automaticamente.
   */
  @Column({ name: 'clickup_manual_link', type: 'boolean', default: false })
  clickupManualLink: boolean;

  /**
   * Override de env por instância (sobrescreve as do projeto no merge do deploy).
   * Objeto vazio = sem override.
   */
  @Column({ name: 'env_vars', type: 'jsonb', default: () => "'{}'" })
  envVars: Record<string, string>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
