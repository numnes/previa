import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractSetupKey, isValidSetupKey } from './setup-key.util';

/**
 * Exige a chave de setup gerada na máquina root (PREVIA_SETUP_KEY),
 * enviada no header X-Previa-Setup-Key. Falha fechada se não configurada.
 */
@Injectable()
export class SetupKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const expected =
      this.config.get<string>('PREVIA_SETUP_KEY') ??
      this.config.get<string>('DEPLOYER_SETUP_KEY') ??
      '';
    if (!expected) {
      throw new UnauthorizedException(
        'Setup key não configurada no servidor (PREVIA_SETUP_KEY).',
      );
    }
    const provided = extractSetupKey(req.headers);
    if (!isValidSetupKey(provided, expected)) {
      throw new UnauthorizedException('Setup key inválida ou ausente.');
    }
    return true;
  }
}
