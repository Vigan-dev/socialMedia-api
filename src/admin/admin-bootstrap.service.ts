import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    const email = this.configService.get<string>('ADMIN_EMAIL')?.trim();
    const username = this.configService.get<string>('ADMIN_USERNAME')?.trim();
    const password = this.configService.get<string>('ADMIN_PASSWORD');

    if (!email || !username || !password) return;

    await this.usersService.upsertAdminUser({
      email,
      password: await bcrypt.hash(password, 10),
      username,
    });

    this.logger.log(`Admin user ready: ${email}`);
  }
}
