import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateInstanceDto {
  @ApiPropertyOptional({
    example: { FEATURE_FLAG: '1' },
    description:
      'Override de env desta instância (KEY → string). Merge sobre as envs do projeto no próximo deploy. Use {} para limpar overrides.',
  })
  @IsOptional()
  @IsObject()
  envVars?: Record<string, string>;

  @ApiPropertyOptional({
    example: 'https://app.clickup.com/t/CICM-4491',
    description:
      'URL ou ID da tarefa ClickUp. null/string vazia remove o vínculo. Não posta comentário — só exibe link e status.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  clickupTaskUrl?: string | null;

  @ApiPropertyOptional({
    example: true,
    description:
      'Quando true, resolve a tarefa ClickUp a partir do nome da branch (sem comentar). Tem prioridade sobre clickupTaskUrl.',
  })
  @IsOptional()
  @IsBoolean()
  clickupLinkFromBranch?: boolean;
}
