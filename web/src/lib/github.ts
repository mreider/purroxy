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

// Create a PR with the site files on behalf of the user.
// If existingSiteSlug is set, this is a capability addition to an existing site.
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
  existingSiteSlug?: string;
}): Promise<{ prUrl: string; prNumber: number; slug: string } | null> {
  if (!GITHUB_TOKEN) return null;

  const slug = opts.existingSiteSlug || opts.siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const isCapabilityAddition = !!opts.existingSiteSlug;
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

    let allCapabilities = opts.capabilities;

    // For capability additions, fetch existing site.json and merge capabilities
    if (isCapabilityAddition) {
      try {
        const existing = await ghFetch(
          `/repos/${GITHUB_REPO}/contents/sites/${slug}/site.json?ref=main`
        );
        const existingSite = JSON.parse(
          Buffer.from(existing.content, 'base64').toString('utf-8')
        );
        const existingCaps: string[] = existingSite.capabilities || [];
        allCapabilities = [...new Set([...existingCaps, ...opts.capabilities])];
      } catch {
        // If we can't fetch existing, just use the new capabilities
      }
    }

    // 3. Create/update site.json
    const siteJson = JSON.stringify({
      name: opts.displayName,
      description: opts.description,
      siteUrl: opts.siteUrl,
      author: opts.submitterGithub || opts.submitterEmail,
      capabilities: allCapabilities,
      submissionId: opts.submissionId,
    }, null, 2);

    const commitMsg = isCapabilityAddition
      ? `Add capabilities to ${opts.displayName}`
      : `Add site: ${opts.displayName}`;

    // For updates, we need the existing file SHA
    if (isCapabilityAddition) {
      try {
        const existing = await ghFetch(
          `/repos/${GITHUB_REPO}/contents/sites/${slug}/site.json?ref=${branch}`
        );
        await ghFetch(`/repos/${GITHUB_REPO}/contents/sites/${slug}/site.json`, 'PUT', {
          message: commitMsg,
          content: Buffer.from(siteJson).toString('base64'),
          sha: existing.sha,
          branch,
        });
      } catch {
        // File doesn't exist on the branch yet, create it
        await ghCreateFile(`sites/${slug}/site.json`, siteJson, commitMsg, branch);
      }
    } else {
      await ghCreateFile(`sites/${slug}/site.json`, siteJson, commitMsg, branch);
    }

    // 4. Create/update README
    const readme = `# ${opts.displayName}\n\n${opts.description}\n\n**Site:** ${opts.siteUrl}\n\n## Capabilities\n\n${allCapabilities.map(c => `- ${c}`).join('\n')}\n\n---\n*Submitted via Purroxy by ${opts.submitterGithub || opts.submitterEmail}*\n`;

    if (isCapabilityAddition) {
      try {
        const existing = await ghFetch(
          `/repos/${GITHUB_REPO}/contents/sites/${slug}/README.md?ref=${branch}`
        );
        await ghFetch(`/repos/${GITHUB_REPO}/contents/sites/${slug}/README.md`, 'PUT', {
          message: `Update README for ${opts.displayName}`,
          content: Buffer.from(readme).toString('base64'),
          sha: existing.sha,
          branch,
        });
      } catch {
        await ghCreateFile(`sites/${slug}/README.md`, readme, `Add README for ${opts.displayName}`, branch);
      }
    } else {
      await ghCreateFile(`sites/${slug}/README.md`, readme, `Add README for ${opts.displayName}`, branch);
    }

    // 5. Create the PR
    const prTitle = isCapabilityAddition
      ? `Add capabilities to ${opts.displayName}`
      : `New site: ${opts.displayName}`;

    const newCapsSection = isCapabilityAddition
      ? `\n\n### New capabilities\n${opts.capabilities.map(c => `- ${c}`).join('\n')}\n\n### All capabilities after merge\n${allCapabilities.map(c => `- ${c}`).join('\n')}`
      : `\n\n### Capabilities\n${opts.capabilities.map(c => `- ${c}`).join('\n')}`;

    const pr = await ghFetch(`/repos/${GITHUB_REPO}/pulls`, 'POST', {
      title: prTitle,
      body: `## ${opts.displayName}\n\n${opts.description}\n\n**Site:** ${opts.siteUrl}\n**Submitted by:** ${opts.submitterGithub || opts.submitterEmail}\n**Submission ID:** ${opts.submissionId}${newCapsSection}`,
      head: branch,
      base: 'main',
    });

    return { prUrl: pr.html_url, prNumber: pr.number, slug };
  } catch (err: any) {
    console.error('[github] Failed to create PR:', err.message);
    return null;
  }
}

// Check the current state of a PR (polling fallback when webhook is missed)
export async function getPRState(prNumber: number): Promise<{
  state: 'open' | 'closed';
  merged: boolean;
  closedAt: string | null;
  mergedAt: string | null;
} | null> {
  if (!GITHUB_TOKEN) return null;
  try {
    const pr = await ghFetch(`/repos/${GITHUB_REPO}/pulls/${prNumber}`);
    return {
      state: pr.state,
      merged: pr.merged,
      closedAt: pr.closed_at,
      mergedAt: pr.merged_at,
    };
  } catch (err: any) {
    console.error('[github] Failed to get PR state:', err.message);
    return null;
  }
}

// Fetch the last comment on a PR (used as rejection reason when closed without merge)
export async function getPRCloseComment(prNumber: number): Promise<string | null> {
  if (!GITHUB_TOKEN) return null;
  try {
    const comments = await ghFetch(
      `/repos/${GITHUB_REPO}/issues/${prNumber}/comments?per_page=5`
    );
    if (comments.length > 0) {
      return comments[comments.length - 1].body || null;
    }
    return null;
  } catch (err: any) {
    console.error('[github] Failed to get PR comments:', err.message);
    return null;
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
