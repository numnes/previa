import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column({ name: 'git_url' })
  gitUrl: string;

  /** URL base pública (ex.: https://meuteste.com) para montar links de preview. */
  @Column({ name: 'server_url', type: 'varchar', nullable: true })
  serverUrl: string | null;

  /**
   * Tempo máximo em que instâncias podem ficar ativas (status active).
   * null em ambos = sem limite.
   */
  @Column({ name: 'max_active_lifetime_days', type: 'int', nullable: true })
  maxActiveLifetimeDays: number | null;

  @Column({ name: 'max_active_lifetime_hours', type: 'int', nullable: true })
  maxActiveLifetimeHours: number | null;

  /**
   * Tempo máximo de existência da instância (desde createdAt).
   * Após expirar, a instância é removida e o checkout em disco é apagado.
   * null em ambos = sem limite.
   */
  @Column({ name: 'max_existence_lifetime_days', type: 'int', nullable: true })
  maxExistenceLifetimeDays: number | null;

  @Column({ name: 'max_existence_lifetime_hours', type: 'int', nullable: true })
  maxExistenceLifetimeHours: number | null;

  /**
   * Variáveis de ambiente padrão aplicadas a todas as instâncias deste projeto
   * no deploy (sobrescritas por envVars da instância).
   */
  @Column({ name: 'env_vars', type: 'jsonb', default: () => "'{}'" })
  envVars: Record<string, string>;

  /**
   * Nomes extras de env que recebem a porta alocada no deploy
   * (além de PORT, SERVER_PORT, APP_PORT).
   */
  @Column({ name: 'port_env_names', type: 'jsonb', default: () => "'[]'" })
  portEnvNames: string[];

  /**
   * Se > 0: pausa automática (sleep) após N minutos sem request HTTP na preview.
   * null ou 0 = desligado (padrão).
   */
  @Column({ name: 'idle_pause_minutes', type: 'int', nullable: true })
  idlePauseMinutes: number | null;

  /**
   * Path relativo do health check (ex.: /health). null = desligado (comportamento legado).
   */
  @Column({ name: 'health_check_path', type: 'varchar', nullable: true })
  healthCheckPath: string | null;

  /** Status HTTP esperado do health check (default 200 quando path configurado). */
  @Column({ name: 'health_check_status', type: 'int', nullable: true })
  healthCheckStatus: number | null;

  /** Minutos para aguardar health check OK antes de pausar e marcar error. */
  @Column({ name: 'health_check_timeout_minutes', type: 'int', nullable: true })
  healthCheckTimeoutMinutes: number | null;

  /** Envia notificações Discord quando instâncias deste projeto mudam de status. */
  @Column({ name: 'notifications_enabled', type: 'boolean', default: false })
  notificationsEnabled: boolean;

  /** Comenta no ClickUp (task id = nome da branch) quando a preview fica active. */
  @Column({ name: 'clickup_comments_enabled', type: 'boolean', default: false })
  clickupCommentsEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
