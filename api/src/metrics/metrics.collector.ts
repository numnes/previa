import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsCollector implements OnModuleInit {
  private readonly log = new Logger(MetricsCollector.name);

  constructor(private readonly metrics: MetricsService) {}

  async onModuleInit() {
    // Primeira amostra logo após subir, sem esperar o cron.
    setTimeout(() => {
      void this.metrics.collectTick().catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`initial metrics collect failed: ${msg}`);
      });
    }, 5_000);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      await this.metrics.collectTick();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`metrics collect failed: ${msg}`);
    }
  }
}
