import { IsIn } from 'class-validator';
import { USER_STATUSES } from '../user.constants';
import type { UserStatus } from '../user.constants';

export class UpdateStatusDto {
  @IsIn(USER_STATUSES)
  status!: UserStatus;
}
