import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  comments?: boolean;

  @IsOptional()
  @IsBoolean()
  follows?: boolean;

  @IsOptional()
  @IsBoolean()
  likes?: boolean;

  @IsOptional()
  @IsBoolean()
  mentions?: boolean;

  @IsOptional()
  @IsBoolean()
  messages?: boolean;
}
