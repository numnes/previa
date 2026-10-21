import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateResourceDto {
  @ApiProperty({ example: 'redis-shared' })
  @IsString()
  @MinLength(1)
  @Matches(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'slug deve ser minúsculo (letras, números, hífen)',
  })
  slug: string;

  @ApiPropertyOptional({ example: 'Redis compartilhado' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ enum: ['image', 'dockerfile', 'compose'] })
  @IsIn(['image', 'dockerfile', 'compose'])
  kind: 'image' | 'dockerfile' | 'compose';

  @ApiPropertyOptional({ example: 'redis:7-alpine' })
  @ValidateIf((o: CreateResourceDto) => o.kind === 'image')
  @IsString()
  @MinLength(1)
  image?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: CreateResourceDto) => o.kind === 'dockerfile')
  @IsString()
  @MinLength(1)
  dockerfile?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: CreateResourceDto) => o.kind === 'compose')
  @IsString()
  @MinLength(1)
  composeYaml?: string;

  @ApiPropertyOptional({ example: [6379], type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(65535, { each: true })
  @Type(() => Number)
  containerPorts?: number[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  envVars?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Sobe o recurso imediatamente após criar' })
  @IsOptional()
  @IsBoolean()
  start?: boolean;
}
