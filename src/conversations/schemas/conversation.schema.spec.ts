import { Types } from 'mongoose';
import { createConversationKey } from './conversation.schema';

describe('createConversationKey', () => {
  it('creates the same key regardless of participant order', () => {
    const firstId = new Types.ObjectId();
    const secondId = new Types.ObjectId();

    expect(createConversationKey([firstId, secondId])).toBe(
      createConversationKey([secondId, firstId]),
    );
  });

  it('uses sorted participant ids separated by colons', () => {
    const firstId = new Types.ObjectId('000000000000000000000002');
    const secondId = new Types.ObjectId('000000000000000000000001');

    expect(createConversationKey([firstId, secondId])).toBe(
      '000000000000000000000001:000000000000000000000002',
    );
  });
});
