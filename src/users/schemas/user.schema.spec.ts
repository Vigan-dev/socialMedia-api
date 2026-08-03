import { Mongoose } from 'mongoose';

import { User, UserSchema } from './user.schema';

describe('UserSchema canonical identities', () => {
  it('declares unique indexes for canonical email and username', () => {
    expect(UserSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { emailLower: 1 },
          expect.objectContaining({
            name: 'user_email_lower_unique',
            unique: true,
          }),
        ],
        [
          { usernameLower: 1 },
          expect.objectContaining({
            name: 'user_username_lower_unique',
            unique: true,
          }),
        ],
        [{ blockedUsers: 1 }, expect.any(Object)],
        [{ followers: 1 }, expect.any(Object)],
        [{ following: 1 }, expect.any(Object)],
        [{ mutedUsers: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('normalizes identity fields during document validation', async () => {
    const isolatedMongoose = new Mongoose();
    const UserModel = isolatedMongoose.model(User.name, UserSchema.clone());
    const user = new UserModel({
      email: ' Alice@Example.COM ',
      password: 'hashed-password',
      username: ' Alice.User ',
    });

    await user.validate();

    expect(user.email).toBe('alice@example.com');
    expect(user.emailLower).toBe('alice@example.com');
    expect(user.username).toBe('Alice.User');
    expect(user.usernameLower).toBe('alice.user');
  });
});
