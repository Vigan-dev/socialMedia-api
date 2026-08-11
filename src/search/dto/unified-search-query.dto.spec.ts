import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UnifiedSearchQueryDto } from './unified-search-query.dto';

describe('UnifiedSearchQueryDto', () => {
  it('normalizes Unicode width and repeated whitespace before validation', async () => {
    const dto = plainToInstance(UnifiedSearchQueryDto, {
      q: '  \uFF2E\uFF45\uFF53\uFF54\t  JS  ',
    });

    expect(dto.q).toBe('Nest JS');
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a query that is empty after normalization', async () => {
    const dto = plainToInstance(UnifiedSearchQueryDto, {
      q: ' \t  ',
    });

    expect(dto.q).toBe('');
    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
