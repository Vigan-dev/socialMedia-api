import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SupportChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionId?: string;
}
