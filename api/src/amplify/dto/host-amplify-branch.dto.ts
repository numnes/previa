import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class HostAmplifyBranchDto {
  @ApiProperty({ example: 'proj-1024' })
  @IsString()
  @MinLength(1)
  branchName: string;
}
