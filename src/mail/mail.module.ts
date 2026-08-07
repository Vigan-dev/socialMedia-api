import { Module } from '@nestjs/common';

import { MailProvider } from './mail.provider';
import { SmtpMailProvider } from './smtp-mail.provider';

@Module({
  providers: [
    {
      provide: MailProvider,
      useClass: SmtpMailProvider,
    },
  ],
  exports: [MailProvider],
})
export class MailModule {}
