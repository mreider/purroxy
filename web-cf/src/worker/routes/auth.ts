import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Env, User } from '../lib/types';
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  validateUsername,
  createSessionToken,
  verifySessionToken,
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  createVerifyToken,
  verifyEmail,
  createResetToken,
  resetPassword,
} from '../lib/auth';
import { sendVerificationEmail, sendPasswordReset } from '../lib/email';

const auth = new Hono<{ Bindings: Env }>();

function sanitizeUser(user: User) {
  const { password_hash, verify_token, verify_token_expires, reset_token, reset_token_expires, ...safe } = user;
  return {
    ...safe,
    licenseKey: user.license_key,
    displayName: user.username,
  };
}

function isProduction(c: { env: Env }): boolean {
  return c.env.APP_URL.startsWith('https://');
}

// POST /signup
auth.post('/signup', async (c) => {
  const body = await c.req.json<{ username?: string; displayName?: string; email?: string; password?: string }>();
  // Accept username or displayName (backward compat with older desktop app)
  const username = body.username || body.displayName?.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const { email, password } = body;

  if (!username || !email || !password) {
    return c.json({ error: 'Username, email, and password are required.' }, 400);
  }

  // Validate username
  const usernameError = validateUsername(username);
  if (usernameError) {
    return c.json({ error: usernameError }, 400);
  }

  // Validate password strength
  const passwordError = validatePassword(password);
  if (passwordError) {
    return c.json({ error: passwordError }, 400);
  }

  // Check if email is already taken
  const existingEmail = await getUserByEmail(c.env.DB, email);
  if (existingEmail) {
    return c.json({ error: 'An account with that email already exists.' }, 409);
  }

  // Check if username is already taken
  const existingUsername = await getUserByUsername(c.env.DB, username);
  if (existingUsername) {
    return c.json({ error: 'That username is already taken.' }, 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(c.env.DB, email, passwordHash, username);

  // Create verification token and send email
  const token = await createVerifyToken(c.env.DB, user.id);
  await sendVerificationEmail(
    c.env.MAILGUN_API_KEY,
    c.env.MAILGUN_DOMAIN,
    c.env.APP_URL,
    email,
    token,
  );

  return c.json({ needsVerification: true, user: sanitizeUser(user) }, 201);
});

// POST /login
auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ error: 'Email and password are required.' }, 400);
  }

  const user = await getUserByEmail(c.env.DB, email);
  if (!user) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  if (!user.email_verified) {
    return c.json({ error: 'Please verify your email before logging in.' }, 403);
  }

  const sessionToken = await createSessionToken(user.id, user.email, c.env.SESSION_SECRET);

  setCookie(c, 'purroxy-session', sessionToken, {
    httpOnly: true,
    secure: isProduction(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  });

  return c.json({ user: sanitizeUser(user) });
});

// GET /session
auth.get('/session', async (c) => {
  const token = getCookie(c, 'purroxy-session');
  if (!token) {
    return c.json({ user: null });
  }

  const payload = await verifySessionToken(token, c.env.SESSION_SECRET);
  if (!payload) {
    return c.json({ user: null });
  }

  const user = await getUserById(c.env.DB, payload.userId);
  if (!user) {
    return c.json({ user: null });
  }

  return c.json({ user: sanitizeUser(user) });
});

// GET /verify-email?token=X
auth.get('/verify-email', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.redirect(`${c.env.APP_URL}/verify-email?expired=true`);
  }

  const success = await verifyEmail(c.env.DB, token);
  if (success) {
    return c.redirect(`${c.env.APP_URL}/verify-email?success=true`);
  }

  return c.redirect(`${c.env.APP_URL}/verify-email?expired=true`);
});

// POST /forgot-password
auth.post('/forgot-password', async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const { email } = body;

  if (!email) {
    return c.json({ error: 'Email is required.' }, 400);
  }

  // Always return the same message to prevent email enumeration
  const genericMessage = 'If an account with that email exists, a password reset link has been sent.';

  const token = await createResetToken(c.env.DB, email);
  if (token) {
    await sendPasswordReset(
      c.env.MAILGUN_API_KEY,
      c.env.MAILGUN_DOMAIN,
      c.env.APP_URL,
      email,
      token,
    );
  }

  return c.json({ message: genericMessage });
});

// POST /reset-password
auth.post('/reset-password', async (c) => {
  const body = await c.req.json<{ token?: string; password?: string }>();
  const { token, password } = body;

  if (!token || !password) {
    return c.json({ error: 'Token and new password are required.' }, 400);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return c.json({ error: passwordError }, 400);
  }

  const newHash = await hashPassword(password);
  const success = await resetPassword(c.env.DB, token, newHash);
  if (!success) {
    return c.json({ error: 'Invalid or expired reset token.' }, 400);
  }

  return c.json({ message: 'Password has been reset. You can now log in.' });
});

// GET /check-username?username=X
auth.get('/check-username', async (c) => {
  const username = c.req.query('username');
  if (!username) {
    return c.json({ error: 'Username is required.' }, 400);
  }

  // Also validate format
  const formatError = validateUsername(username);
  if (formatError) {
    return c.json({ available: false, reason: formatError });
  }

  const existing = await getUserByUsername(c.env.DB, username);
  return c.json({ available: !existing });
});

export default auth;
