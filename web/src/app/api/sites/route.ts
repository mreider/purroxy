import { NextRequest, NextResponse } from 'next/server';
import { initSchema, getDb } from '@/lib/db';

initSchema();

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const db = getDb();

  const conditions: string[] = [];
  const values: any[] = [];

  if (params.get('search')) {
    conditions.push('(name LIKE ? OR description LIKE ? OR site_url LIKE ?)');
    const term = `%${params.get('search')}%`;
    values.push(term, term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.has('limit') ? parseInt(params.get('limit')!) : 50;
  const offset = params.has('offset') ? parseInt(params.get('offset')!) : 0;

  const total = (db.prepare(`SELECT COUNT(*) as count FROM sites ${where}`).get(...values) as any).count;
  const sites = db.prepare(
    `SELECT * FROM sites ${where} ORDER BY download_count DESC, created_at DESC LIMIT ? OFFSET ?`
  ).all(...values, limit, offset);

  return NextResponse.json({ sites, total });
}
