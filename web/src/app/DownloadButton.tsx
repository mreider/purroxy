'use client';

import { useState, useEffect } from 'react';

const SPACES_URL = 'https://purroxy-releases.nyc3.digitaloceanspaces.com';

interface VersionInfo {
  version: string;
  date: string;
  dmg: string;
  exe: string;
  appimage: string;
}

type Platform = 'mac' | 'win' | 'linux';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'mac';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'win';
  if (ua.includes('linux')) return 'linux';
  return 'mac';
}

const platformLabels: Record<Platform, string> = {
  mac: 'macOS',
  win: 'Windows',
  linux: 'Linux',
};

const platformIcons: Record<Platform, string> = {
  mac: 'M318.7 268.7c-.2-36.7 16.4-64.4 50-83.8-19.3-27.6-47.7-42.3-85.5-44.1-17.5-.9-37.8 6.2-54.7 12.8-24.6 9.6-37 9.6-56.1 0-13.4-5.2-28.7-12-46.5-12.8-49.9-1.1-97 30.9-97 89.7 0 17.3 3.2 35.2 9.6 53.7 14.6 39.6 54.2 116.3 95.3 114.9 15.3-.5 26-10.2 48.1-10.2 21.5 0 31.4 10.2 49.2 10.2 41.4-.7 76.5-68.3 90.2-108C283.5 327.5 318.9 303.5 318.7 268.7zM271 166.7c19.1-22.8 32.8-54.4 29.2-87.4-28.4 1.6-61.5 19.1-81.3 42.8-17.5 20.4-33.6 54.1-29.5 85.3C221.5 210 252 189.5 271 166.7z',
  win: 'M0 93.7l183.6-25.3v177.4H0V93.7zm0 324.6l183.6 25.3V249.9H0v168.4zM203.8 64L512 0v246.5H203.8V64zm0 384L512 512V265.5H203.8V448z',
  linux: 'M220.8 123.3c1 .5 1.8 1.7 3 1.7 1.1 0 2.8-.4 2.9-1.5.2-1.4-1.9-2.3-3.2-2.9-1.7-.7-3.9-1-5.5-.1-.4.2-.8.7-.6 1.1.3 1.3 2.3 1.1 3.4 1.7zm-21.9 1.7c1.2 0 2-1.2 3-1.7 1.1-.6 3.1-.4 3.5-1.6.2-.4-.2-.9-.6-1.1-1.6-.9-3.8-.6-5.5.1-1.3.6-3.4 1.5-3.2 2.9.1 1 1.8 1.5 2.8 1.4zM248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8z',
};

export default function DownloadButton() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [platform, setPlatform] = useState<Platform>('mac');
  const [showOthers, setShowOthers] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    fetch('/api/version')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {
        setInfo({
          version: '0.2.0',
          date: '',
          dmg: 'Purroxy-0.2.0-arm64.dmg',
          exe: 'Purroxy Setup 0.2.0.exe',
          appimage: 'Purroxy-0.2.0.AppImage',
        });
      });
  }, []);

  if (!info) {
    return <span className="loading loading-spinner loading-sm text-primary"></span>;
  }

  const downloads: Record<Platform, { file: string; label: string }> = {
    mac: { file: info.dmg, label: 'Download for macOS' },
    win: { file: info.exe, label: 'Download for Windows' },
    linux: { file: info.appimage, label: 'Download for Linux' },
  };

  const primary = downloads[platform];
  const others = (['mac', 'win', 'linux'] as Platform[]).filter((p) => p !== platform);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-3 items-center">
        <a
          href={`${SPACES_URL}/latest/${primary.file}`}
          className="btn btn-primary btn-lg"
        >
          {primary.label}
        </a>
        <a href="https://docs.purroxy.com" className="btn btn-ghost btn-lg border border-base-300">
          Documentation
        </a>
      </div>

      <div className="flex items-center gap-2 text-xs text-base-content/40">
        <span>v{info.version}</span>
        <span>&middot;</span>
        <div className="dropdown dropdown-top">
          <label tabIndex={0} className="link link-hover cursor-pointer text-base-content/50 hover:text-base-content">
            Also for {others.map((p) => platformLabels[p]).join(' and ')}
          </label>
          <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box border border-base-300 shadow-lg w-52 p-2 mb-2">
            {others.map((p) => (
              <li key={p}>
                <a href={`${SPACES_URL}/latest/${downloads[p].file}`} className="text-sm">
                  {platformLabels[p]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
