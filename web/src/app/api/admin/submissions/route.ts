import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb } from '@/lib/db';

initSchema();

export async function GET() {
  const db = getDb();

  const submissions = db.prepare(`
    SELECT s.*, p.name as profile_name, p.site_name as profile_site, u.email as submitter_email
    FROM submissions s
    LEFT JOIN profiles p ON s.profile_id = p.id
    LEFT JOIN users u ON s.submitter_id = u.id
    ORDER BY
      CASE s.status WHEN 'pending' THEN 0 ELSE 1 END,
      s.created_at DESC
    LIMIT 100
  `).all();

  return NextResponse.json({ submissions });
}
