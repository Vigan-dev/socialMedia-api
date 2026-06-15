import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';

import { Post, PostSchema } from '../src/posts/schemas/post.schema';
import { Report, ReportSchema } from '../src/posts/schemas/report.schema';
import { User, UserSchema } from '../src/users/schemas/user.schema';

type DemoUserSeed = {
  avatarUrl?: string;
  bio: string;
  email: string;
  password: string;
  role: 'admin' | 'moderator' | 'user';
  status: 'available' | 'away' | 'busy';
  username: string;
};

function getDemoUsers(): DemoUserSeed[] {
  return [
    {
      bio: 'Admin demo account for local review.',
      email: process.env.ADMIN_EMAIL?.trim() || 'admin@example.com',
      password: process.env.ADMIN_PASSWORD || 'AdminPassword1',
      role: 'admin',
      status: 'available',
      username: process.env.ADMIN_USERNAME?.trim() || 'admin',
    },
    {
      bio: 'Moderator account for testing reports and moderation tools.',
      email: 'mod@example.com',
      password: 'ModPassword1',
      role: 'moderator',
      status: 'away',
      username: 'mod_user',
    },
    {
      bio: 'Product-minded builder sharing updates from the demo feed.',
      email: 'demo@example.com',
      password: 'DemoPassword1',
      role: 'user',
      status: 'available',
      username: 'demo_user',
    },
    {
      bio: 'Designer testing comments, replies, follows, mute, and block flows.',
      email: 'casey@example.com',
      password: 'CaseyPassword1',
      role: 'user',
      status: 'busy',
      username: 'casey',
    },
    {
      bio: 'QA account for report and visibility testing.',
      email: 'riley@example.com',
      password: 'RileyPassword1',
      role: 'user',
      status: 'available',
      username: 'riley',
    },
  ];
}

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ??= value;
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Create socialMedia-api/.env first.`);
  }

  return value;
}

async function upsertDemoUsers(demoUsers: DemoUserSeed[]) {
  const UserModel = mongoose.model(User.name, UserSchema);
  const hashedPasswords = await Promise.all(
    demoUsers.map((user) => bcrypt.hash(user.password, 10)),
  );

  for (const [index, user] of demoUsers.entries()) {
    const conflictingUsers = await UserModel.find({
      $or: [{ email: user.email }, { username: user.username }],
    })
      .select('_id email username')
      .exec();
    const existingUser =
      conflictingUsers.find((candidate) => candidate.email === user.email) ??
      conflictingUsers.find((candidate) => candidate.username === user.username);

    if (existingUser) {
      const duplicateIds = conflictingUsers
        .filter(
          (candidate) =>
            candidate._id.toString() !== existingUser._id.toString(),
        )
        .map((candidate) => candidate._id);

      if (duplicateIds.length) {
        await UserModel.deleteMany({ _id: { $in: duplicateIds } });
      }
    }

    const filter = existingUser
      ? { _id: existingUser._id }
      : { email: user.email };

    await UserModel.updateOne(
      filter,
      {
        $set: {
          avatarUrl: user.avatarUrl ?? '',
          bio: user.bio,
          email: user.email,
          isSuspended: false,
          notificationSettings: {
            comments: true,
            follows: true,
            likes: true,
            mentions: true,
            messages: true,
          },
          password: hashedPasswords[index],
          privacy: {
            allowMentionsFrom: 'everyone',
            allowMessagesFrom: 'everyone',
          },
          role: user.role,
          showOnlineStatus: true,
          status: user.status,
          suspensionReason: '',
          username: user.username,
        },
        $setOnInsert: {
          blockedUsers: [],
          followers: [],
          following: [],
          mutedUsers: [],
        },
        $unset: {
          passwordResetExpiresAt: '',
          passwordResetTokenHash: '',
          refreshTokenHash: '',
        },
      },
      { runValidators: true, upsert: !existingUser },
    );
  }

  const demoEmails = demoUsers.map((user) => user.email);
  const demoUsernames = demoUsers.map((user) => user.username);
  const users = await UserModel.find({
    $or: [
      { email: { $in: demoEmails } },
      { username: { $in: demoUsernames } },
    ],
  }).exec();
  const byEmail = new Map(users.map((user) => [user.email, user]));

  for (const user of demoUsers) {
    if (!byEmail.has(user.email)) {
      throw new Error(`Failed to seed user ${user.email}`);
    }
  }

  const adminSeed = demoUsers.find((user) => user.role === 'admin')!;

  return {
    admin: byEmail.get(adminSeed.email)!,
    casey: byEmail.get('casey@example.com')!,
    demo: byEmail.get('demo@example.com')!,
    moderator: byEmail.get('mod@example.com')!,
    riley: byEmail.get('riley@example.com')!,
  };
}

type DemoUsers = Awaited<ReturnType<typeof upsertDemoUsers>>;

async function resetDemoRelationships(users: DemoUsers, demoUsers: DemoUserSeed[]) {
  const UserModel = mongoose.model(User.name, UserSchema);
  const demoEmails = demoUsers.map((user) => user.email);
  const demoUsernames = demoUsers.map((user) => user.username);

  await UserModel.updateMany(
    {
      $or: [
        { email: { $in: demoEmails } },
        { username: { $in: demoUsernames } },
      ],
    },
    {
      $set: {
        blockedUsers: [],
        followers: [],
        following: [],
        mutedUsers: [],
      },
    },
  );

  await Promise.all([
    UserModel.updateOne(
      { _id: users.demo._id },
      {
        $addToSet: {
          blockedUsers: users.riley._id,
          following: users.casey._id,
          mutedUsers: users.moderator._id,
        },
      },
    ),
    UserModel.updateOne(
      { _id: users.casey._id },
      { $addToSet: { followers: users.demo._id, following: users.demo._id } },
    ),
    UserModel.updateOne(
      { _id: users.demo._id },
      { $addToSet: { followers: users.casey._id } },
    ),
  ]);
}

async function seedPostsAndReports(users: DemoUsers) {
  const PostModel = mongoose.model(Post.name, PostSchema);
  const ReportModel = mongoose.model(Report.name, ReportSchema);
  const demoUserIds = Object.values(users).map((user) => user._id);

  await ReportModel.deleteMany({ reporter: { $in: demoUserIds } });
  await PostModel.deleteMany({ author: { $in: demoUserIds } });

  const now = Date.now();
  const postIds = {
    admin: new Types.ObjectId(),
    casey: new Types.ObjectId(),
    demo: new Types.ObjectId(),
    riley: new Types.ObjectId(),
  };
  const caseyCommentId = new Types.ObjectId();
  const demoReplyId = new Types.ObjectId();
  const rileyCommentId = new Types.ObjectId();

  await PostModel.insertMany([
    {
      _id: postIds.demo,
      author: users.demo._id,
      comments: [
        {
          _id: caseyCommentId,
          author: users.casey._id,
          content: 'The optimistic updates feel fast. I would test rollback next.',
          hiddenBy: [],
          likedBy: [users.demo._id],
          replies: [
            {
              _id: demoReplyId,
              author: users.demo._id,
              content: 'Good call. I added failure states to the demo checklist.',
              hiddenBy: [],
              likedBy: [users.casey._id],
            },
          ],
        },
        {
          _id: rileyCommentId,
          author: users.riley._id,
          content: 'This comment is useful for report moderation testing.',
          hiddenBy: [],
          likedBy: [],
          replies: [],
        },
      ],
      commentsCount: 3,
      content:
        'Seeded demo post: testing feed loading, likes, comments, replies, and reports.',
      createdAt: new Date(now - 1000 * 60 * 15),
      hiddenBy: [],
      likedBy: [users.casey._id, users.riley._id],
      updatedAt: new Date(now - 1000 * 60 * 12),
    },
    {
      _id: postIds.casey,
      author: users.casey._id,
      comments: [
        {
          _id: new Types.ObjectId(),
          author: users.demo._id,
          content: 'The profile and privacy settings are ready to review.',
          hiddenBy: [],
          likedBy: [users.casey._id],
          replies: [],
        },
      ],
      commentsCount: 1,
      content:
        'Designer note: try the profile editor, avatar field, privacy toggles, and theme accent controls.',
      createdAt: new Date(now - 1000 * 60 * 60 * 2),
      hiddenBy: [],
      likedBy: [users.demo._id],
      updatedAt: new Date(now - 1000 * 60 * 60 * 2),
    },
    {
      _id: postIds.admin,
      author: users.admin._id,
      comments: [],
      commentsCount: 0,
      content:
        'Admin demo: open the Admin tab to review users, metrics, reports, and moderation actions.',
      createdAt: new Date(now - 1000 * 60 * 60 * 5),
      hiddenBy: [],
      likedBy: [users.demo._id, users.casey._id],
      updatedAt: new Date(now - 1000 * 60 * 60 * 5),
    },
    {
      _id: postIds.riley,
      author: users.riley._id,
      comments: [],
      commentsCount: 0,
      content:
        'Visibility demo: demo_user has blocked this author, so this post should disappear for that account.',
      createdAt: new Date(now - 1000 * 60 * 60 * 8),
      hiddenBy: [],
      likedBy: [],
      updatedAt: new Date(now - 1000 * 60 * 60 * 8),
    },
  ]);

  await ReportModel.insertMany([
    {
      details: 'Seeded open report for admin review.',
      reason: 'spam',
      reporter: users.casey._id,
      status: 'open',
      targetId: postIds.demo.toString(),
      targetType: 'post',
    },
    {
      details: 'Seeded comment report for moderation workflow testing.',
      reason: 'other',
      reporter: users.demo._id,
      status: 'reviewed',
      targetId: rileyCommentId.toString(),
      targetType: 'comment',
    },
    {
      details: 'Seeded user report for the reports table.',
      reason: 'harassment',
      reporter: users.moderator._id,
      status: 'open',
      targetId: users.riley._id.toString(),
      targetType: 'user',
    },
  ]);
}

async function main() {
  loadEnvFile();
  await mongoose.connect(requiredEnv('MONGODB_URI'));

  try {
    const demoUsers = getDemoUsers();
    const users = await upsertDemoUsers(demoUsers);
    await resetDemoRelationships(users, demoUsers);
    await seedPostsAndReports(users);
    const adminUser = demoUsers.find((user) => user.role === 'admin')!;

    console.log('Demo seed complete.');
    console.log(`Admin: ${adminUser.email} / ${adminUser.password}`);
    console.log('User: demo@example.com / DemoPassword1');
    console.log('Moderator: mod@example.com / ModPassword1');
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
