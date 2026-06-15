export type ConversationResponse = {
  handle: string;
  id: string;
  lastMessage: string;
  lastMessageAt: string | null;
  participant: {
    avatarUrl: string | null;
    id: string;
    name: string;
    status: string;
  };
  typingUsers: string[];
  unreadCount: number;
  user: string;
};

export type MessageResponse = {
  delivered: boolean;
  id: string;
  isOwn: boolean;
  read: boolean;
  sender: {
    avatarUrl: string | null;
    id: string;
    name: string;
  };
  text: string;
  time: string;
};
