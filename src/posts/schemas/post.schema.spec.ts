import { model, models, Types } from 'mongoose';
import { PostSchema } from './post.schema';

const PostValidationModel =
  models.PostSchemaValidationSpec ??
  model('PostSchemaValidationSpec', PostSchema);

describe('PostSchema validation', () => {
  const author = new Types.ObjectId();

  it('allows a post with text and no media', async () => {
    const post = new PostValidationModel({
      author,
      content: 'A regular text post',
      mediaUrls: [],
    });

    await expect(post.validate()).resolves.toBeUndefined();
  });

  it('allows a post with media and no text', async () => {
    const post = new PostValidationModel({
      author,
      content: '',
      mediaUrls: ['/uploads/post-media/example.png'],
    });

    await expect(post.validate()).resolves.toBeUndefined();
  });

  it('rejects a post without text or media', async () => {
    const post = new PostValidationModel({
      author,
      content: '   ',
      mediaUrls: [],
    });

    await expect(post.validate()).rejects.toThrow(
      'Post content or media is required',
    );
  });
});
