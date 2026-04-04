import { Hono } from 'hono';
import type { Env } from '../lib/types';

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

const GH_REPO = 'mreider/purroxy';
const GH_RELEASES_API = `https://api.github.com/repos/${GH_REPO}/releases/latest`;
const GH_DOWNLOAD_BASE = `https://github.com/${GH_REPO}/releases/download`;

const FALLBACK = {
  version: '0.3.0',
  date: '2026-04-04T10:16:55Z',
  dmg: 'Purroxy-0.3.0-arm64.dmg',
  exe: 'Purroxy.Setup.0.3.0.exe',
  appimage: 'Purroxy-0.3.0.AppImage',
  downloadBase: `${GH_DOWNLOAD_BASE}/v0.3.0`,
};

// --- GET / --- fetch latest version info from GitHub Releases (public, cached 5 min)

app.get('/', async (c) => {
  // Try KV cache first
  const cached = await c.env.KV.get('latest-version', 'json');
  if (cached) return c.json(cached);

  try {
    // Try fetching version.json from the latest GitHub release
    const releaseRes = await fetch(GH_RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'purroxy-web',
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    if (!releaseRes.ok) throw new Error(`GitHub API ${releaseRes.status}`);

    const release = await releaseRes.json() as any;
    const tag = release.tag_name; // e.g. "v0.3.0"
    const version = tag.replace(/^v/, '');

    // Look for version.json asset, or derive from release assets
    const versionAsset = release.assets?.find((a: any) => a.name === 'version.json');

    let data: any;
    if (versionAsset) {
      const vRes = await fetch(versionAsset.browser_download_url, {
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      data = await vRes.json();
      data.downloadBase = `${GH_DOWNLOAD_BASE}/${tag}`;
    } else {
      // Derive from asset names
      const assets = (release.assets || []) as any[];
      const dmg = assets.find((a: any) => a.name.endsWith('.dmg'))?.name || `Purroxy-${version}-arm64.dmg`;
      const exe = assets.find((a: any) => a.name.endsWith('.exe'))?.name || `Purroxy.Setup.${version}.exe`;
      const appimage = assets.find((a: any) => a.name.endsWith('.AppImage'))?.name || `Purroxy-${version}.AppImage`;

      data = {
        version,
        date: release.published_at || release.created_at,
        dmg,
        exe,
        appimage,
        downloadBase: `${GH_DOWNLOAD_BASE}/${tag}`,
      };
    }

    // Cache in KV for 5 minutes
    await c.env.KV.put('latest-version', JSON.stringify(data), { expirationTtl: 300 });

    return c.json(data);
  } catch {
    return c.json(FALLBACK);
  }
});

export default app;
