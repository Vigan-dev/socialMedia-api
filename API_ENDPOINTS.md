# API Endpoints

Base URL for local development:

```text
http://localhost:3000
```

Most app endpoints use HTTP-only cookies for authentication. Log in through `POST /auth/login`; authenticated requests should include credentials/cookies.

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/` | No | Basic API health response. |

## Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | No | Create a user account. |
| `POST` | `/auth/login` | No | Log in and set `access_token` and `refresh_token` cookies. |
| `POST` | `/auth/refresh` | Refresh cookie | Rotate session cookies and return the current user. |
| `POST` | `/auth/logout` | Optional refresh cookie | Clear auth cookies and invalidate the stored refresh token. |
| `POST` | `/auth/forgot-password` | No | Request a password reset token. In local non-production mode, the token is returned in the response. |
| `POST` | `/auth/reset-password` | No | Reset password with email, token, and new password. |

## Users

All user endpoints require authentication.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/users` | List visible users. |
| `GET` | `/users/me` | Get the current user profile. |
| `GET` | `/users/me/followers` | Get the current user's followers. |
| `GET` | `/users/me/following` | Get users followed by the current user. |
| `GET` | `/users/suggestions` | Get suggested users. |
| `GET` | `/users/username-availability?username=value` | Check username availability. |
| `PATCH` | `/users/me` | Update profile fields such as username, bio, and uploaded avatar URL. |
| `PATCH` | `/users/avatar` | Update uploaded avatar URL. |
| `PATCH` | `/users/status` | Update user status. |
| `PATCH` | `/users/privacy` | Update message, mention, and online-status privacy settings. |
| `PATCH` | `/users/notification-settings` | Update notification preferences. |
| `POST` | `/users/:id/follow` | Toggle follow/unfollow for a user. |
| `POST` | `/users/:id/block` | Block a user. |
| `DELETE` | `/users/:id/block` | Unblock a user. |
| `POST` | `/users/:id/mute` | Mute a user. |
| `DELETE` | `/users/:id/mute` | Unmute a user. |

## Posts

All post endpoints require authentication.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/posts?feed=all&sort=latest&limit=12&cursor=...` | Get the feed with cursor pagination. `feed` can be `all` or `following`; `sort` can be `latest` or `top`. |
| `POST` | `/posts` | Create a post. |
| `POST` | `/posts/:id/like` | Toggle post like. |
| `PATCH` | `/posts/:id` | Edit your own post. |
| `DELETE` | `/posts/:id` | Delete your own post. |
| `POST` | `/posts/:id/hide` | Hide a post for the current user. |
| `POST` | `/posts/reports` | Report a post, comment, or user. |
| `POST` | `/posts/:id/comments` | Add a comment to a post. |
| `POST` | `/posts/:postId/comments/:commentId/like` | Toggle comment like. |
| `POST` | `/posts/:postId/comments/:commentId/replies` | Add a reply to a comment. |
| `POST` | `/posts/:postId/comments/:commentId/replies/:replyId/like` | Toggle reply like. |

## Notifications

All notification endpoints require authentication.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/notifications` | Get notifications for the current user. |
| `PATCH` | `/notifications/read-all` | Mark all current-user notifications as read. |

## Conversations

All conversation endpoints require authentication.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/conversations` | Get current-user conversations. |
| `POST` | `/conversations` | Find or create a conversation with `participantId`. |
| `GET` | `/conversations/:id/messages` | Get messages for a conversation. |
| `POST` | `/conversations/:id/messages` | Send a message. |
| `PATCH` | `/conversations/:id/read` | Mark a conversation as read. |
| `PATCH` | `/conversations/:id/typing` | Update typing state. |

## Admin

Admin routes require authentication and role `admin`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/admin/profile` | Check protected admin access. |
| `GET` | `/admin/metrics` | Get admin dashboard metrics. |
| `GET` | `/admin/users?q=value` | List or search users. |
| `PATCH` | `/admin/users/:id/suspension` | Suspend or unsuspend a user. |
| `GET` | `/admin/reports?status=open` | List reports. |
| `PATCH` | `/admin/reports/:id` | Update report status. |
| `DELETE` | `/admin/posts/:id` | Delete a post as admin. |
| `DELETE` | `/admin/comments/:id` | Delete a comment as admin. |

## Moderation

Moderation routes require authentication and role `admin` or `moderator`.
Moderators can review reports and remove reported posts/comments, but they cannot access the admin dashboard, platform metrics, user search, or user suspension controls.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/moderation/reports?status=open` | List reports. Use `status=all` to list every status. |
| `PATCH` | `/moderation/reports/:id` | Update report status. |
| `DELETE` | `/moderation/posts/:id` | Delete a reported post. |
| `DELETE` | `/moderation/comments/:id` | Delete a reported comment. |

## AI Support

AI support endpoints require authentication. Support chat sessions are scoped to the logged-in user, so one account cannot read another account's support history.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/ai/support-chat` | Send a support-chat message and get an assistant reply for the current user. |
| `GET` | `/ai/support-chat` | List current-user support-chat sessions. |
| `GET` | `/ai/support-chat/:sessionId` | Get messages for a current-user support-chat session. |
