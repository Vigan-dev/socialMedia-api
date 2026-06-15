import { IsMongoId } from 'class-validator';

export class CreateConversationDto {
  @IsMongoId()
  participantId!: string;
}
