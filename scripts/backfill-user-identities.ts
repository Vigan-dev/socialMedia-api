import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose, { Types } from 'mongoose';

import {
  normalizeEmail,
  normalizeUsername,
  normalizeUsernameLower,
} from '../src/users/user-identity';

type ExistingUser = {
  _id: Types.ObjectId;
  email?: unknown;
  username?: unknown;
};

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ??= value;
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Create socialMedia-api/.env first.`);
  }

  return value;
}

function requiredIdentityValue(
  value: unknown,
  field: 'email' | 'username',
  userId: Types.ObjectId,
) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`User ${userId.toString()} is missing ${field}`);
  }

  return value;
}

function assertNoCollision(
  values: Map<string, string>,
  canonicalValue: string,
  userId: Types.ObjectId,
  field: 'email' | 'username',
) {
  const existingUserId = values.get(canonicalValue);

  if (existingUserId && existingUserId !== userId.toString()) {
    throw new Error(
      `Cannot backfill: ${field} collision between users ${existingUserId} and ${userId.toString()}`,
    );
  }

  values.set(canonicalValue, userId.toString());
}

async function main() {
  loadEnvFile();
  await mongoose.connect(requiredEnv('MONGODB_URI'), { autoIndex: false });

  try {
    const database = mongoose.connection.db;

    if (!database) {
      throw new Error('MongoDB connection is not ready');
    }

    const usersCollection = database.collection<ExistingUser>('users');
    const users = await usersCollection
      .find({}, { projection: { _id: 1, email: 1, username: 1 } })
      .toArray();
    const emailOwners = new Map<string, string>();
    const usernameOwners = new Map<string, string>();

    const normalizedUsers = users.map((user) => {
      const email = normalizeEmail(
        requiredIdentityValue(user.email, 'email', user._id),
      );
      const username = normalizeUsername(
        requiredIdentityValue(user.username, 'username', user._id),
      );
      const usernameLower = normalizeUsernameLower(username);

      assertNoCollision(emailOwners, email, user._id, 'email');
      assertNoCollision(usernameOwners, usernameLower, user._id, 'username');

      return { ...user, email, username, usernameLower };
    });

    if (normalizedUsers.length > 0) {
      await usersCollection.bulkWrite(
        normalizedUsers.map((user) => ({
          updateOne: {
            filter: { _id: user._id },
            update: {
              $set: {
                email: user.email,
                emailLower: user.email,
                username: user.username,
                usernameLower: user.usernameLower,
              },
            },
          },
        })),
      );
    }

    await usersCollection.createIndex(
      { emailLower: 1 },
      { name: 'user_email_lower_unique', unique: true },
    );
    await usersCollection.createIndex(
      { usernameLower: 1 },
      { name: 'user_username_lower_unique', unique: true },
    );

    console.log(`Backfilled ${normalizedUsers.length} user identities.`);
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
