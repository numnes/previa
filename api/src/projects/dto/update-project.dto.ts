import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProjectDto {
  @ApiPropertyOptional({
    example: 'https://github.com/yout-account/your-repo.git',
    description: 'URL do repositório Git usada nos deploys (clone / fetch).',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  gitUrl?: string;

  @ApiPropertyOptional({
    example: 'https://meuteste.com',
    description:
      'URL pública base do preview (nginx). Ex.: https://meuteste.com — o path da branch é /<branch-slug>/',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: false })
  serverUrl?: string | null;

  @ApiPropertyOptional({
    example: 7,
    description:
      'Dias máximos em que instâncias podem ficar ativas (status active). null = sem limite.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  maxActiveLifetimeDays?: number | null;

  @ApiPropertyOptional({
    example: 12,
    description:
      'Horas adicionais ao limite de tempo ativo (combinado com dias). null = sem limite.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(87600)
  maxActiveLifetimeHours?: number | null;

  @ApiPropertyOptional({
    example: 30,
    description:
      'Dias máximos de existência da instância (desde criação). Após expirar, remove checkout e registro. null = sem limite.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  maxExistenceLifetimeDays?: number | null;

  @ApiPropertyOptional({
    example: 0,
    description:
      'Horas adicionais ao limite de existência (combinado com dias). null = sem limite.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(87600)
  maxExistenceLifetimeHours?: number | null;

  @ApiPropertyOptional({
    example: { DATABASE_URL: 'postgres://…', NODE_ENV: 'production' },
    description:
      'Envs padrão do projeto (KEY → string). Aplicadas no deploy de cada instância; a instância pode sobrescrever chaves individuais.',
  })
  @IsOptional()
  @IsObject()
  envVars?: Record<string, string>;

  @ApiPropertyOptional({
    example: ['HTTP_PORT'],
    description:
      'Nomes extras de env que recebem a porta alocada (sempre inclui PORT, SERVER_PORT, APP_PORT).',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  portEnvNames?: string[];

  @ApiPropertyOptional({
    example: 30,
    description:
      'Minutos sem request HTTP na preview antes de pausar (sleep + wake na próxima request). null ou 0 = desligado.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10080)
  idlePauseMinutes?: number | null;

  @ApiPropertyOptional({
    example: '/health',
    description:
      'Path HTTP relativo para health check pós-deploy (ex.: /health). Vazio = desligado.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @Matches(/^\/[\w./-]*$/, {
    message: 'healthCheckPath deve começar com / (ex.: /health)',
  })
  healthCheckPath?: string | null;

  @ApiPropertyOptional({
    example: 200,
    description: 'Status HTTP esperado do health check. Default 200 quando path configurado.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  healthCheckStatus?: number | null;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Minutos aguardando health check OK após deploy antes de pausar e marcar error. Default 5.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  healthCheckTimeoutMinutes?: number | null;

  @ApiPropertyOptional({
    example: true,
    description:
      'Quando true, instâncias deste projeto disparam notificações Discord configuradas globalmente.',
  })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
