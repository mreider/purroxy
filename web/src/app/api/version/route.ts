import { NextResponse } from 'next/server';

const SPACES_URL = 'https://purroxy-releases.nyc3.digitaloceanspaces.com';

export async function GET() {
  try {
    const res = await fetch(`${SPACES_URL}/latest/version.json`, {
      next: { revalidate: 300 }, // cache for 5 minutes
    });
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      version: '0.2.0',
      date: '',
      dmg: 'Purroxy-0.2.0-arm64.dmg',
      exe: 'Purroxy Setup 0.2.0.exe',
      appimage: 'Purroxy-0.2.0.AppImage',
    });
  }
}
