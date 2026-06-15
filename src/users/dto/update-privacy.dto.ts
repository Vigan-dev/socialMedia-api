import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { MESSAGE_PRIVACY_OPTIONS } from '../user.constants';
import type { MessagePrivacy } from '../user.constants';

export class UpdatePrivacyDto {
  @IsOptional()
  @IsIn(MESSAGE_PRIVACY_OPTIONS)
  allowMessagesFrom?: MessagePrivacy;

  @IsOptional()
  @IsIn(MESSAGE_PRIVACY_OPTIONS)
  allowMentionsFrom?: MessagePrivacy;

  @IsOptional()
  @IsBoolean()
  showOnlineStatus?: boolean;
}
