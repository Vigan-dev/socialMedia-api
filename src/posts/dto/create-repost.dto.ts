import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRepostDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  quote?: string;
}
