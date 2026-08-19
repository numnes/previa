import {
  All,
  Controller,
  Headers,
  Logger,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PreviewInstancesService } from '../preview-instances/preview-instances.service';

/**
 * Wake sob demanda: nginx (idle sleep) faz proxy para cá.
 * Após resume, responde 302 para a URI original da preview.
 */
@Controller('internal/wake')
export class WakeController {
  private readonly log = new Logger(WakeController.name);

  constructor(private readonly previewInstances: PreviewInstancesService) {}

  @All()
  async wake(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-previa-project') projectHeader?: string,
    @Headers('x-deployer-project') projectHeaderLegacy?: string,
    @Headers('x-previa-branch-slug') branchSlugHeader?: string,
    @Headers('x-deployer-branch-slug') branchSlugHeaderLegacy?: string,
    @Headers('x-original-uri') originalUri?: string,
    @Headers('x-forwarded-proto') forwardedProto?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') hostHeader?: string,
  ) {
    const projectSlug = (projectHeader || projectHeaderLegacy || '').trim();
    const branchSlug = (branchSlugHeader || branchSlugHeaderLegacy || '').trim();
    if (!projectSlug || !branchSlug) {
      res
        .status(400)
        .type('text/plain')
        .send('Missing X-Previa-Project / X-Previa-Branch-Slug');
      return;
    }

    const uri = (originalUri || '/').trim() || '/';
    const proto = (forwardedProto || 'https').split(',')[0].trim() || 'https';
    const host =
      (forwardedHost || hostHeader || '').split(',')[0].trim() || 'localhost';
    const redirectTo = `${proto}://${host}${uri.startsWith('/') ? uri : `/${uri}`}`;

    try {
      this.log.log(`Wake request ${projectSlug}/${branchSlug} → ${uri}`);
      await this.previewInstances.ensureAwake(projectSlug, branchSlug);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`Wake ${projectSlug}/${branchSlug}: ${msg}`);
      const noSlot = msg.includes('Sem slot');
      res
        .status(noSlot ? 503 : 502)
        .setHeader('Retry-After', '30')
        .type('text/plain')
        .send(`Preview wake failed: ${msg}`);
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, redirectTo);
  }
}
