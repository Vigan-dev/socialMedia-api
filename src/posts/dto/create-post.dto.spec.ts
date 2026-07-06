import { validate } from 'class-validator';
import { CreatePostDto } from './create-post.dto';

describe('CreatePostDto', () => {
  it('allows a media-only payload without content', async () => {
    const dto = Object.assign(new CreatePostDto(), {
      mediaUrls: ['/uploads/post-media/example.png'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('validates content when it is provided', async () => {
    const dto = Object.assign(new CreatePostDto(), {
      content: null,
      mediaUrls: ['/uploads/post-media/example.png'],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'content')).toBe(true);
  });
});
