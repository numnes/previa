import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { headerValue } from '../../http/header-value';

@Injectable()
export class DeployApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const key = headerValue(
      req.headers,
      'x-previa-api-key',
      'x-deployer-api-key',
    );
    if (!key) {
      throw new UnauthorizedException('Cabeçalho X-Previa-Api-Key obrigatório');
    }
    const ok = await this.apiKeys.validateDeployKey(key);
    if (!ok) {
      throw new UnauthorizedException('Chave de API inválida');
    }
    return true;
  }
}
