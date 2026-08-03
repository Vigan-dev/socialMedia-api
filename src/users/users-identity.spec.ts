import { ConflictException } from '@nestjs/common';

import { UsersService } from './users.service';

describe('UsersService canonical identities', () => {
  let service: UsersService;
  let userModel: {
    create: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findOne: jest.Mock;
  };
  let userResponseMapper: { toProfile: jest.Mock };

  function duplicateKey(field: string) {
    return Object.assign(new Error('E11000 duplicate key error'), {
      code: 11000,
      keyPattern: { [field]: 1 },
    });
  }

  beforeEach(() => {
    userModel = {
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOne: jest.fn(),
    };
    userResponseMapper = {
      toProfile: jest.fn((user: object) => user),
    };

    service = new UsersService(
      userModel as never,
      {} as never,
      {} as never,
      userResponseMapper as never,
      {} as never,
    );
  });

  it('stores trimmed display values and canonical lowercase identity fields', async () => {
    userModel.create.mockImplementation((data) => Promise.resolve(data));

    await service.create({
      email: '  Alice@Example.COM ',
      password: 'hashed-password',
      username: '  Alice.User  ',
    });

    expect(userModel.create).toHaveBeenCalledWith({
      email: 'alice@example.com',
      emailLower: 'alice@example.com',
      password: 'hashed-password',
      username: 'Alice.User',
      usernameLower: 'alice.user',
    });
  });

  it('uses canonical email for account lookup', async () => {
    const select = jest.fn().mockReturnValue('selected-query');
    userModel.findOne.mockReturnValue({ select });

    await expect(service.findByEmail(' Alice@Example.COM ')).resolves.toBe(
      'selected-query',
    );
    expect(userModel.findOne).toHaveBeenCalledWith({
      emailLower: 'alice@example.com',
    });
    expect(select).toHaveBeenCalledWith('+password');
  });

  it.each([
    ['emailLower', 'Email is already in use'],
    ['usernameLower', 'Username is already in use'],
  ])(
    'translates a duplicate %s create race into a conflict response',
    async (field, message) => {
      userModel.create.mockRejectedValue(duplicateKey(field));

      await expect(
        service.create({
          email: 'alice@example.com',
          password: 'hashed-password',
          username: 'Alice',
        }),
      ).rejects.toThrow(new ConflictException(message));
    },
  );

  it('updates username and usernameLower together', async () => {
    userModel.findByIdAndUpdate.mockResolvedValue({ username: 'Alice.User' });

    await service.updateProfile('user-id', { username: '  Alice.User  ' });

    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-id',
      { username: 'Alice.User', usernameLower: 'alice.user' },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('translates a duplicate username profile update into a conflict response', async () => {
    userModel.findByIdAndUpdate.mockRejectedValue(
      duplicateKey('usernameLower'),
    );

    await expect(
      service.updateProfile('user-id', { username: 'TakenName' }),
    ).rejects.toThrow(new ConflictException('Username is already in use'));
  });
});
