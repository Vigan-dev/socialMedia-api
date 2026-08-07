# API Endpoints

Base URL for local development:

```text
http://localhost:3000
```

Most app endpoints use HTTP-only cookies for authentication. Log in through `POST /auth/login`; authenticated requests should include credentials/cookies.

## Cursor pagination

Paginated endpoints accept `limit` and an optional opaque `cursor`. Do not inspect or construct cursors on the client; pass the previous response's `nextCursor` back unchanged.

```json
{
  "items": [],
  "hasMore": false,
  "nextCursor": null
}
```

The default page size is 30 for users, conversations, messages, and notifications, and 20 for support sessions. All of these endpoints cap `limit` at 50.

## Health

| Method | Path | Auth | Description                |
| ------ | ---- | ---- | -------------------------- |
| `GET`  | `/`  | No   | Basic API health response. |

## Auth

| Method | Path                    | Auth                    | Description                                                                                          |
| ------ | ----------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST` | `/auth/register`        | No                      | Create a user account.                                                                               |
| `POST` | `/auth/login`           | No                      | Log in and set `access_token` and `refresh_token` cookies.                                           |
| `POST` | `/auth/refresh`         | Refresh cookie          | Rotate session cookies and return the current user.                                                  |
| `POST` | `/auth/logout`          | Optional refresh cookie | Clear auth cookies and invalidate the stored refresh token.                                          |
| `POST` | `/auth/forgot-password` | No                      | Email a 30-minute password reset link. The token is returned only when `NODE_ENV` is explicitly `development` or `test`. |
| `POST` | `/auth/reset-password`  | No                      | Reset password with email, token, and new password.                                                  |
| `GET`  | `/auth/security/activity` | Access cookie          | Get the current user's 20 most recent security events.                                               |
| `POST` | `/auth/change-password` | Access cookie            | Change the password after verifying `currentPassword`; revokes every session.                         |
| `POST` | `/auth/logout-all`      | Access cookie            | Increment the account session version, disconnect sockets, and sign out every device.                 |

Five failed passwords within a rolling 15-minute window lock that account for
15 minutes. Security activity is retained for 90 days. Password changes,
password resets, and logout-all invalidate access tokens immediately through a
server-checked session version rather than waiting for JWT expiry.

## Users

All user endpoints require authentication.

| Method   | Path                                          | Description                                                                      |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET`    | `/users?limit=30&cursor=...`                  | List visible users ordered by username. Returns a cursor page.                   |
| `GET`    | `/users/me`                                   | Get the current user profile.                                                    |
| `GET`    | `/users/me/followers?limit=30&cursor=...`     | Get the current user's followers as a cursor page.                               |
| `GET`    | `/users/me/following?limit=30&cursor=...`     | Get users followed by the current user as a cursor page.                         |
| `GET`    | `/users/me/follow-requests?limit=30&cursor=...` | Get pending incoming follow requests as a cursor page.                         |
| `GET`    | `/users/suggestions`                          | Get up to five suggested users ranked in MongoDB by follower count and username. |
| `GET`    | `/users/username-availability?username=value` | Check username availability.                                                     |
| `PATCH`  | `/users/me`                                   | Update profile fields such as username, bio, and uploaded avatar URL.            |
| `PATCH`  | `/users/avatar`                               | Update uploaded avatar URL.                                                      |
| `PATCH`  | `/users/status`                               | Update user status.                                                              |
| `PATCH`  | `/users/privacy`                              | Update profile visibility, message, mention, and online-status privacy settings. |
| `PATCH`  | `/users/notification-settings`                | Update notification preferences.                                                 |
| `PUT`    | `/users/follow-requests/:id`                  | Accept a pending request from the identified user.                               |
| `DELETE` | `/users/follow-requests/:id`                  | Decline a pending request from the identified user.                              |
| `PUT`    | `/users/:id/follow`                           | Follow a public user or request access to a private account. Idempotent.          |
| `DELETE` | `/users/:id/follow`                           | Unfollow a user or cancel a pending request. Idempotent.                         |
| `POST`   | `/users/:id/block`                            | Block a user.                                                                    |
| `DELETE` | `/users/:id/block`                            | Unblock a user.                                                                  |
| `POST`   | `/users/:id/mute`                             | Mute a user.                                                                     |
| `DELETE` | `/users/:id/mute`                             | Unmute a user.                                                                   |

## Posts

All post endpoints require authentication.

| Method   | Path                                                       | Description                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/posts?feed=all&sort=latest&limit=12&cursor=...`          | Get the feed. `feed` can be `all` or `following`; `sort` can be `latest` or `trending`. `latest` uses cursor pagination. `trending` ranks a recent candidate window by engagement and does not paginate. |
| `POST`   | `/posts`                                                   | Create a post.                                                                                                                                                                                           |
| `PUT`    | `/posts/:id/like`                                          | Ensure the current user likes the post. Idempotent.                                                                                                                                                      |
| `DELETE` | `/posts/:id/like`                                          | Ensure the current user does not like the post. Idempotent.                                                                                                                                              |
| `PATCH`  | `/posts/:id`                                               | Edit your own post.                                                                                                                                                                                      |
| `DELETE` | `/posts/:id`                                               | Delete your own post.                                                                                                                                                                                    |
| `POST`   | `/posts/:id/hide`                                          | Hide a post for the current user.                                                                                                                                                                        |
| `POST`   | `/posts/reports`                                           | Report a post, comment, or user.                                                                                                                                                                         |
| `POST`   | `/posts/:id/comments`                                      | Add a comment to a post.                                                                                                                                                                                 |
| `PUT`    | `/posts/:postId/comments/:commentId/like`                  | Ensure the current user likes the comment. Idempotent.                                                                                                                                                   |
| `DELETE` | `/posts/:postId/comments/:commentId/like`                  | Ensure the current user does not like the comment. Idempotent.                                                                                                                                           |
| `POST`   | `/posts/:postId/comments/:commentId/replies`               | Add a reply to a comment.                                                                                                                                                                                |
| `PUT`    | `/posts/:postId/comments/:commentId/replies/:replyId/like` | Ensure the current user likes the reply. Idempotent.                                                                                                                                                     |
| `DELETE` | `/posts/:postId/comments/:commentId/replies/:replyId/like` | Ensure the current user does not like the reply. Idempotent.                                                                                                                                             |

## Notifications

All notification endpoints require authentication.

| Method  | Path                                 | Description                                                   |
| ------- | ------------------------------------ | ------------------------------------------------------------- |
| `GET`   | `/notifications?limit=30&cursor=...` | Get current-user notifications newest-first as a cursor page. |
| `PATCH` | `/notifications/read-all`            | Mark all current-user notifications as read.                  |

## Saved posts

All saved-post and collection endpoints require authentication. Saved content
is private to the current user.

| Method   | Path                                                        | Description                                                        |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET`    | `/saved-posts`                                              | Get up to 100 currently accessible saved posts.                    |
| `PUT`    | `/saved-posts/:postId`                                      | Save an accessible post. Idempotent.                               |
| `DELETE` | `/saved-posts/:postId`                                      | Unsave a post and remove it from the user's collections.           |
| `GET`    | `/saved-posts/collections`                                 | List the current user's collections and their post IDs.            |
| `POST`   | `/saved-posts/collections`                                 | Create a named collection with `{ "name": "..." }`.             |
| `PATCH`  | `/saved-posts/collections/:collectionId`                   | Rename an owned collection.                                        |
| `DELETE` | `/saved-posts/collections/:collectionId`                   | Delete a collection without unsaving its posts.                    |
| `PUT`    | `/saved-posts/collections/:collectionId/posts/:postId`     | Add a post to a collection and ensure it is saved. Idempotent.     |
| `DELETE` | `/saved-posts/collections/:collectionId/posts/:postId`     | Remove a post from a collection while keeping it in All saved.     |

## Conversations

All conversation endpoints require authentication.

| Method  | Path                                              | Description                                                                           |
| ------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET`   | `/conversations?limit=30&cursor=...`              | Get current-user conversations newest-first as a cursor page.                         |
| `POST`  | `/conversations`                                  | Find or create a conversation with `participantId`.                                   |
| `GET`   | `/conversations/:id/messages?limit=30&cursor=...` | Get messages newest-first as a cursor page. Pass `nextCursor` to load older messages. |
| `POST`  | `/conversations/:id/messages`                     | Send a message.                                                                       |
| `PATCH` | `/conversations/:id/read`                         | Mark a conversation as read.                                                          |
| `PATCH` | `/conversations/:id/typing`                       | Update typing state.                                                                  |

## Realtime events

Socket.IO connects to the API base URL on the default `/socket.io` path. The
handshake uses the HTTP-only `access_token` cookie and must include an origin
allowed by `CLIENT_ORIGINS`. The server assigns the authenticated socket to an
internal per-user room; clients do not join rooms themselves.

The connection is receive-only for application data. Message, typing, read,
and notification mutations continue to use the REST endpoints above so their
authorization, validation, and rate limits remain in effect.

| Server event            | Payload                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `conversation:updated`  | The authenticated user's personalized conversation response.  |
| `message:new`           | `{ conversationId, message }`                                  |
| `message:read`          | `{ conversationId }`                                           |
| `notification:new`      | A notification response.                                       |
| `notification:read-all` | No payload.                                                     |
| `session:revoked`       | No payload; the server then disconnects the user's sockets.     |

The frontend uses REST for initial loading, pagination, focus recovery, and
reconciliation after reconnecting, so persisted updates are recovered if a
socket event is missed.

## Admin

Admin routes require authentication and role `admin`.

| Method   | Path                          | Description                   |
| -------- | ----------------------------- | ----------------------------- |
| `GET`    | `/admin/profile`              | Check protected admin access. |
| `GET`    | `/admin/metrics`              | Get admin dashboard metrics.  |
| `GET`    | `/admin/users?q=value`        | List or search users.         |
| `PATCH`  | `/admin/users/:id/suspension` | Suspend or unsuspend a user.  |
| `GET`    | `/admin/reports?status=open`  | List reports.                 |
| `PATCH`  | `/admin/reports/:id`          | Update report status.         |
| `DELETE` | `/admin/posts/:id`            | Delete a post as admin.       |
| `DELETE` | `/admin/comments/:id`         | Delete a comment as admin.    |

## Moderation

Moderation routes require authentication and role `admin` or `moderator`.
Moderators can review reports and remove reported posts/comments, but they cannot access the admin dashboard, platform metrics, user search, or user suspension controls.

| Method   | Path                              | Description                                          |
| -------- | --------------------------------- | ---------------------------------------------------- |
| `GET`    | `/moderation/reports?status=open` | List reports. Use `status=all` to list every status. |
| `PATCH`  | `/moderation/reports/:id`         | Update report status.                                |
| `DELETE` | `/moderation/posts/:id`           | Delete a reported post.                              |
| `DELETE` | `/moderation/comments/:id`        | Delete a reported comment.                           |

## AI Support

AI support endpoints require authentication. Support chat sessions are scoped to the logged-in user, so one account cannot read another account's support history.

| Method | Path                                   | Description                                                                  |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------- |
| `POST` | `/ai/support-chat`                     | Send a support-chat message and get an assistant reply for the current user. |
| `GET`  | `/ai/support-chat?limit=20&cursor=...` | List current-user support-chat sessions newest-first as a cursor page.       |
| `GET`  | `/ai/support-chat/:sessionId`          | Get messages for a current-user support-chat session.                        |
