import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';

initSchema();

// Link a GitHub username to the current user's account
export async function POST(request: NextRequest) {
  const token = request.cookies.get('purroxy-session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });
  }

  const { github_username } = await request.json();
  if (!github_username || typeof github_username !== 'string') {
    return NextResponse.json({ error: 'github_username is required.' }, { status: 400 });
  }

  const clean = github_username.trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9-]+$/.test(clean)) {
    return NextResponse.json({ error: 'Invalid GitHub username.' }, { status: 400 });
  }

  const db = getDb();

  // Check if this GitHub username is already linked to another account
  const existing = db.prepare('SELECT id FROM users WHERE github_username = ? AND id != ?').get(clean, session.userId) as any;
  if (existing) {
    return NextResponse.json({ error: 'This GitHub username is already linked to another account.' }, { status: 409 });
  }

  db.prepare('UPDATE users SET github_username = ?, updated_at = datetime(\'now\') WHERE id = ?').run(clean, session.userId);

  return NextResponse.json({ ok: true, github_username: clean });
}
