import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserSuspensionDto {
  @IsBoolean()
  isSuspended!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
