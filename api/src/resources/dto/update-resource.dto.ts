import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateResourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dockerfile?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  composeYaml?: string | null;

  @ApiPropertyOptional({ type: [Number] })
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
}
