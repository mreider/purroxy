import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { sessionAuth } from '../middleware/session-auth';
import { licenseAuth } from '../middleware/license-auth';
import { hashPassword, verifyPassword, validatePassword } from '../lib/auth';
import { sendVerificationEmail } from '../lib/email';
import { createVerifyToken } from '../lib/auth';

type AuthedEnv = {
  Bindings: Env;
  Variables: { user: User };
};

const account = new Hono<AuthedEnv>();

// GET /profile - license key auth
account.get('/profile', licenseAuth, async (c) => {
  const user = c.get('user');
  return c.json({
    email: user.email,
    username: user.username,
    displayName: user.username,
    subscriptionStatus: user.subscription_status,
    contributorStatus: user.contributor_status,
    createdAt: user.created_at,
  });
});

// PUT /profile - license key auth
account.put('/profile', licenseAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    email?: string;
    newEmail?: string;
    displayName?: string;
    currentPassword?: string;
    newPassword?: string;
  }>();

  // Accept newEmail or email (backward compat with desktop app)
  const emailUpdate = body.newEmail || body.email;

  // Update email (requires re-verification)
  if (emailUpdate && emailUpdate !== user.email) {
    // Check if email is already taken
    const existing = await c.env.DB
      .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .bind(emailUpdate, user.id)
      .first();

    if (existing) {
      return c.json({ error: 'That email is already in use.' }, 409);
    }

    await c.env.DB
      .prepare('UPDATE users SET email = ?, email_verified = 0, updated_at = ? WHERE id = ?')
      .bind(emailUpdate, new Date().toISOString(), user.id)
      .run();

    // Send verification email to new address
    const token = await createVerifyToken(c.env.DB, user.id);
    await sendVerificationEmail(
      c.env.MAILGUN_API_KEY,
      c.env.MAILGUN_DOMAIN,
      c.env.APP_URL,
      emailUpdate,
      token,
    );

    // Invalidate KV license cache
    await c.env.KV.delete(`license:${user.license_key}`);

    return c.json({ success: true, emailChanged: true, message: 'Email updated. Please verify your new email address.' });
  }

  // Update password (requires current password)
  if (body.newPassword) {
    if (!body.currentPassword) {
      return c.json({ error: 'Current password is required to set a new password.' }, 400);
    }

    const valid = await verifyPassword(body.currentPassword, user.password_hash);
    if (!valid) {
      return c.json({ error: 'Current password is incorrect.' }, 401);
    }

    const passwordError = validatePassword(body.newPassword);
    if (passwordError) {
      return c.json({ error: passwordError }, 400);
    }

    const newHash = await hashPassword(body.newPassword);
    await c.env.DB
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(newHash, new Date().toISOString(), user.id)
      .run();

    // Invalidate KV license cache
    await c.env.KV.delete(`license:${user.license_key}`);

    return c.json({ success: true, message: 'Password updated.' });
  }

  // displayName is silently accepted but username is immutable
  // (just return success if nothing else changed)
  if (body.displayName) {
    return c.json({ success: true, message: 'Profile updated.' });
  }

  return c.json({ error: 'No changes provided.' }, 400);
});

// POST /github - session auth. Link GitHub username to account.
account.post('/github', sessionAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ githubUsername?: string }>();

  if (!body.githubUsername) {
    return c.json({ error: 'GitHub username is required.' }, 400);
  }

  const ghUsername = body.githubUsername.trim().replace(/^@/, '');
  if (!ghUsername || ghUsername.length > 39) {
    return c.json({ error: 'Invalid GitHub username.' }, 400);
  }

  await c.env.DB
    .prepare('UPDATE users SET github_username = ?, updated_at = ? WHERE id = ?')
    .bind(ghUsername, new Date().toISOString(), user.id)
    .run();

  // Invalidate KV license cache
  await c.env.KV.delete(`license:${user.license_key}`);

  return c.json({ message: 'GitHub username linked.', githubUsername: ghUsername });
});

export default account;
