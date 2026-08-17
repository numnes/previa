import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';

@Injectable()
export class ClusterNodeSecretService {
  constructor(private readonly config: ConfigService) {}

  isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }

  encrypt(plain: string): string {
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      PREFIX.slice(0, -1),
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(stored: string): string {
    if (!this.isEncrypted(stored)) {
      // Compatibilidade com nós cadastrados antes da criptografia.
      return stored;
    }
    const [, version, ivRaw, tagRaw, ciphertextRaw] = stored.split(':');
    if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
      throw new InternalServerErrorException('Credencial cluster criptografada inválida');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key(),
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(): Buffer {
    const secret = (
      this.config.get<string>('PREVIA_CLUSTER_SECRET') ||
      this.config.get<string>('DEPLOYER_CLUSTER_SECRET') ||
      ''
    ).trim();
    if (!secret) {
      throw new InternalServerErrorException(
        'PREVIA_CLUSTER_SECRET não configurado; não é possível usar credenciais cluster',
      );
    }
    return createHash('sha256').update(secret, 'utf8').digest();
  }
}
