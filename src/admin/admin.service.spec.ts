import { AdminService } from './admin.service';

describe('AdminService user search', () => {
  let service: AdminService;
  let userModel: {
    find: jest.Mock;
  };
  let queryBuilder: {
    exec: jest.Mock;
    lean: jest.Mock;
    limit: jest.Mock;
    select: jest.Mock;
    sort: jest.Mock;
  };

  beforeEach(() => {
    queryBuilder = {
      exec: jest.fn().mockResolvedValue([]),
      lean: jest.fn(),
      limit: jest.fn(),
      select: jest.fn(),
      sort: jest.fn(),
    };
    queryBuilder.sort.mockReturnValue(queryBuilder);
    queryBuilder.limit.mockReturnValue(queryBuilder);
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.lean.mockReturnValue(queryBuilder);

    userModel = {
      find: jest.fn().mockReturnValue(queryBuilder),
    };
    service = new AdminService(
      {} as never,
      {} as never,
      userModel as never,
      {} as never,
    );
  });

  it('escapes regex metacharacters before querying MongoDB', async () => {
    await expect(service.getUsers('  jane.*(admin)[test]$  ')).resolves.toEqual(
      [],
    );

    const safeQuery = 'jane\\.\\*\\(admin\\)\\[test\\]\\$';
    expect(userModel.find).toHaveBeenCalledWith({
      $or: [
        { username: { $regex: safeQuery, $options: 'i' } },
        { email: { $regex: safeQuery, $options: 'i' } },
      ],
    });
  });

  it('hard-limits search input received outside the controller', async () => {
    const limitedQuery = 'a'.repeat(100);

    await service.getUsers(`${limitedQuery}(.*)`);

    expect(userModel.find).toHaveBeenCalledWith({
      $or: [
        { username: { $regex: limitedQuery, $options: 'i' } },
        { email: { $regex: limitedQuery, $options: 'i' } },
      ],
    });
  });
});
