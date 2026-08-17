import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { extractSetupKey, isValidSetupKey } from './setup-key.util';

/**
 * Permite acesso quando há um JWT válido (dashboard) OU a chave de setup
 * da máquina root (script de deploy). Usado em endpoints que precisam servir
 * tanto o painel autenticado quanto o processo de bootstrap.
 */
@Injectable()
export class JwtOrSetupKeyGuard extends AuthGuard('jwt') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const expected =
      this.config.get<string>('PREVIA_SETUP_KEY') ??
      this.config.get<string>('DEPLOYER_SETUP_KEY') ??
      '';
    const provided = extractSetupKey(req.headers);
    if (isValidSetupKey(provided, expected)) {
      return true;
    }
    return super.canActivate(context);
  }
}
