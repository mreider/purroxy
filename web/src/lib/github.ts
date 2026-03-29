// GitHub integration: create PRs on the purroxy-sites repo for site submissions

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = 'mreider/purroxy-sites';
const GITHUB_API = 'https://api.github.com';

function headers() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

export function isGithubConfigured(): boolean {
  return !!GITHUB_TOKEN;
}

// Create a PR with the site files on behalf of the user
export async function createSitePR(opts: {
  siteName: string;
  displayName: string;
  description: string;
  siteUrl: string;
  capabilities: string[];
  submitterEmail: string;
  submitterGithub?: string;
  submissionId: string;
  profileJson: string;
}): Promise<{ prUrl: string; prNumber: number } | null> {
  if (!GITHUB_TOKEN) return null;

  const slug = opts.siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const branch = `submission/${slug}-${opts.submissionId.slice(0, 8)}`;

  try {
    // 1. Get the SHA of main branch
    const mainRef = await ghFetch(`/repos/${GITHUB_REPO}/git/ref/heads/main`);
    const mainSha = mainRef.object.sha;

    // 2. Create a new branch
    await ghFetch(`/repos/${GITHUB_REPO}/git/refs`, 'POST', {
      ref: `refs/heads/${branch}`,
      sha: mainSha,
    });

    // 3. Create site.json
    const siteJson = JSON.stringify({
      name: opts.displayName,
      description: opts.description,
      siteUrl: opts.siteUrl,
      author: opts.submitterGithub || opts.submitterEmail,
      capabilities: opts.capabilities,
      submissionId: opts.submissionId,
    }, null, 2);

    await ghCreateFile(
      `sites/${slug}/site.json`,
      siteJson,
      `Add site: ${opts.displayName}`,
      branch
    );

    // 4. Create a README
    const readme = `# ${opts.displayName}\n\n${opts.description}\n\n**Site:** ${opts.siteUrl}\n\n## Capabilities\n\n${opts.capabilities.map(c => `- ${c}`).join('\n')}\n\n---\n*Submitted via Purroxy by ${opts.submitterGithub || opts.submitterEmail}*\n`;

    await ghCreateFile(
      `sites/${slug}/README.md`,
      readme,
      `Add README for ${opts.displayName}`,
      branch
    );

    // 5. Create the PR
    const pr = await ghFetch(`/repos/${GITHUB_REPO}/pulls`, 'POST', {
      title: `New site: ${opts.displayName}`,
      body: `## ${opts.displayName}\n\n${opts.description}\n\n**Site:** ${opts.siteUrl}\n**Submitted by:** ${opts.submitterGithub || opts.submitterEmail}\n**Submission ID:** ${opts.submissionId}\n\n### Capabilities\n${opts.capabilities.map(c => `- ${c}`).join('\n')}`,
      head: branch,
      base: 'main',
    });

    return { prUrl: pr.html_url, prNumber: pr.number };
  } catch (err: any) {
    console.error('[github] Failed to create PR:', err.message);
    return null;
  }
}

// Merge a PR (called when admin approves the submission)
export async function mergeSitePR(prNumber: number): Promise<boolean> {
  if (!GITHUB_TOKEN) return false;

  try {
    await ghFetch(`/repos/${GITHUB_REPO}/pulls/${prNumber}/merge`, 'PUT', {
      merge_method: 'squash',
    });
    return true;
  } catch (err: any) {
    console.error('[github] Failed to merge PR:', err.message);
    return false;
  }
}

// Close a PR without merging (called when admin rejects the submission)
export async function closeSitePR(prNumber: number): Promise<boolean> {
  if (!GITHUB_TOKEN) return false;

  try {
    await ghFetch(`/repos/${GITHUB_REPO}/pulls/${prNumber}`, 'PATCH', {
      state: 'closed',
    });
    return true;
  } catch (err: any) {
    console.error('[github] Failed to close PR:', err.message);
    return false;
  }
}

// --- helpers ---

async function ghFetch(path: string, method = 'GET', body?: unknown): Promise<any> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function ghCreateFile(filePath: string, content: string, message: string, branch: string): Promise<void> {
  await ghFetch(`/repos/${GITHUB_REPO}/contents/${filePath}`, 'PUT', {
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
  });
}
