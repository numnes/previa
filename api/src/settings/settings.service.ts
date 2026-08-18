import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import os from 'os';
import { Repository } from 'typeorm';
import { Setting } from '../entities/setting.entity';

export const MAX_ACTIVE_INSTANCES_KEY = 'max_active_instances';
export const NODE_LABEL_KEY = 'node_label';
export const DISCORD_WEBHOOK_URL_KEY = 'discord_webhook_url';
export const DISCORD_NOTIFY_STATUSES_KEY = 'discord_notify_statuses';
export const DISCORD_MESSAGE_TEMPLATE_KEY = 'discord_message_template';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @InjectRepository(Setting)
    private readonly repo: Repository<Setting>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureKey(MAX_ACTIVE_INSTANCES_KEY, '10');
    await this.ensureKey(NODE_LABEL_KEY, '');
  }

  private async ensureKey(key: string, defaultValue: string) {
    const row = await this.repo.findOne({ where: { key } });
    if (!row) {
      await this.repo.save(this.repo.create({ key, value: defaultValue }));
    }
  }

  async getValue(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const v = await this.getValue(key);
    if (v == null || v.trim() === '') return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  async getMaxActiveInstances(): Promise<number> {
    const n = await this.getNumber(MAX_ACTIVE_INSTANCES_KEY, 10);
    return Math.max(1, Math.min(n, 1000));
  }

  async setValue(key: string, value: string) {
    await this.repo.upsert({ key, value }, ['key']);
  }

  async setMaxActiveInstances(n: number) {
    const clamped = Math.max(1, Math.min(Math.floor(n), 1000));
    await this.setValue(MAX_ACTIVE_INSTANCES_KEY, String(clamped));
    return clamped;
  }

  async setNodeLabel(label: string | null | undefined) {
    if (label === undefined) return;
    const trimmed = label?.trim() ?? '';
    await this.setValue(NODE_LABEL_KEY, trimmed);
  }

  async getNodeLabel(): Promise<string> {
    const fromSettings = (await this.getValue(NODE_LABEL_KEY))?.trim();
    if (fromSettings) return fromSettings;
    const fromEnv = (
      this.config.get<string>('PREVIA_NODE_LABEL') ||
      this.config.get<string>('DEPLOYER_NODE_LABEL') ||
      ''
    ).trim();
    if (fromEnv) return fromEnv;
    return os.hostname();
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.repo.find({ order: { key: 'ASC' } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
