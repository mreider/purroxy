// GitHub integration: create PRs on the purroxy-sites repo for site submissions

const GITHUB_REPO = 'mreider/purroxy-sites';
const GITHUB_API = 'https://api.github.com';

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function ghFetch(token: string, path: string, method = 'GET', body?: unknown): Promise<any> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function ghCreateFile(
  token: string,
  filePath: string,
  content: string,
  message: string,
  branch: string
): Promise<void> {
  await ghFetch(token, `/repos/${GITHUB_REPO}/contents/${filePath}`, 'PUT', {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  });
}

// Create a PR with the site files on behalf of the user.
// If existingSiteSlug is set, this is a capability addition to an existing site.
export async function createSitePR(
  token: string,
  opts: {
    siteName: string;
    displayName: string;
    description: string;
    siteUrl: string;
    capabilities: string[];
    submitterUsername: string;
    submissionId: string;
    profileJson: string;
    authSpecJson: string;
    endpointsJson: string;
    existingSiteSlug?: string;
  }
): Promise<{ prUrl: string; prNumber: number; slug: string } | null> {
  const slug =
    opts.existingSiteSlug ||
    opts.siteName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

  const isCapabilityAddition = !!opts.existingSiteSlug;
  const branch = `submission/${slug}-${opts.submissionId.slice(0, 8)}`;

  try {
    // 1. Get the SHA of main branch
    const mainRef = await ghFetch(token, `/repos/${GITHUB_REPO}/git/ref/heads/main`);
    const mainSha = mainRef.object.sha;

    // 2. Create a new branch
    await ghFetch(token, `/repos/${GITHUB_REPO}/git/refs`, 'POST', {
      ref: `refs/heads/${branch}`,
      sha: mainSha,
    });

    let allCapabilities = opts.capabilities;

    // For capability additions, fetch existing site.json and merge capabilities
    if (isCapabilityAddition) {
      try {
        const existing = await ghFetch(
          token,
          `/repos/${GITHUB_REPO}/contents/sites/${slug}/site.json?ref=main`
        );
        const decoded = decodeURIComponent(escape(atob(existing.content.replace(/\n/g, ''))));
        const existingSite = JSON.parse(decoded);
        const existingCaps: string[] = existingSite.capabilities || [];
        allCapabilities = [...new Set([...existingCaps, ...opts.capabilities])];
      } catch {
        // If we can't fetch existing, just use the new capabilities
      }
    }

    // 3. Create/update site.json
    const siteJson = JSON.stringify(
      {
        name: opts.displayName,
        description: opts.description,
        siteUrl: opts.siteUrl,
        author: opts.submitterUsername,
        capabilities: allCapabilities,
        submissionId: opts.submissionId,
      },
      null,
      2
    );

    const commitMsg = isCapabilityAddition
      ? `Add capabilities to ${opts.displayName}`
      : `Add site: ${opts.displayName}`;

    // For updates, we need the existing file SHA
    if (isCapabilityAddition) {
      try {
        const existing = await ghFetch(
          token,
          `/repos/${GITHUB_REPO}/contents/sites/${slug}/site.json?ref=${branch}`
        );
        await ghFetch(token, `/repos/${GITHUB_REPO}/contents/sites/${slug}/site.json`, 'PUT', {
          message: commitMsg,
          content: btoa(unescape(encodeURIComponent(siteJson))),
          sha: existing.sha,
          branch,
        });
      } catch {
        // File doesn't exist on the branch yet, create it
        await ghCreateFile(token, `sites/${slug}/site.json`, siteJson, commitMsg, branch);
      }
    } else {
      await ghCreateFile(token, `sites/${slug}/site.json`, siteJson, commitMsg, branch);
    }

    // 4. Create/update profile.json
    if (isCapabilityAddition) {
      try {
        const existing = await ghFetch(
          token,
          `/repos/${GITHUB_REPO}/contents/sites/${slug}/profile.json?ref=${branch}`
        );
        await ghFetch(token, `/repos/${GITHUB_REPO}/contents/sites/${slug}/profile.json`, 'PUT', {
          message: `Update profile.json for ${opts.displayName}`,
          content: btoa(unescape(encodeURIComponent(opts.profileJson))),
          sha: existing.sha,
          branch,
        });
      } catch {
        await ghCreateFile(token, `sites/${slug}/profile.json`, opts.profileJson, `Add profile.json for ${opts.displayName}`, branch);
      }
    } else {
      await ghCreateFile(token, `sites/${slug}/profile.json`, opts.profileJson, `Add profile.json for ${opts.displayName}`, branch);
    }

    // 5. Create/update auth-spec.json
    if (isCapabilityAddition) {
      try {
        const existing = await ghFetch(
          token,
          `/repos/${GITHUB_REPO}/contents/sites/${slug}/auth-spec.json?ref=${branch}`
        );
        await ghFetch(token, `/repos/${GITHUB_REPO}/contents/sites/${slug}/auth-spec.json`, 'PUT', {
          message: `Update auth-spec.json for ${opts.displayName}`,
          content: btoa(unescape(encodeURIComponent(opts.authSpecJson))),
          sha: existing.sha,
          branch,
        });
      } catch {
        await ghCreateFile(token, `sites/${slug}/auth-spec.json`, opts.authSpecJson, `Add auth-spec.json for ${opts.displayName}`, branch);
      }
    } else {
      await ghCreateFile(token, `sites/${slug}/auth-spec.json`, opts.authSpecJson, `Add auth-spec.json for ${opts.displayName}`, branch);
    }

    // 6. Create/update endpoints.json
    if (isCapabilityAddition) {
      try {
        const existing = await ghFetch(
          token,
          `/repos/${GITHUB_REPO}/contents/sites/${slug}/endpoints.json?ref=${branch}`
        );
        await ghFetch(token, `/repos/${GITHUB_REPO}/contents/sites/${slug}/endpoints.json`, 'PUT', {
          message: `Update endpoints.json for ${opts.displayName}`,
          content: btoa(unescape(encodeURIComponent(opts.endpointsJson))),
          sha: existing.sha,
          branch,
        });
      } catch {
        await ghCreateFile(token, `sites/${slug}/endpoints.json`, opts.endpointsJson, `Add endpoints.json for ${opts.displayName}`, branch);
      }
    } else {
      await ghCreateFile(token, `sites/${slug}/endpoints.json`, opts.endpointsJson, `Add endpoints.json for ${opts.displayName}`, branch);
    }

    // 7. Create/update README
    const readme = `# ${opts.displayName}\n\n${opts.description}\n\n**Site:** ${opts.siteUrl}\n\n## Capabilities\n\n${allCapabilities.map((c) => `- ${c}`).join('\n')}\n\n---\n*Submitted via Purroxy by ${opts.submitterUsername}*\n`;

    if (isCapabilityAddition) {
      try {
        const existing = await ghFetch(
          token,
          `/repos/${GITHUB_REPO}/contents/sites/${slug}/README.md?ref=${branch}`
        );
        await ghFetch(token, `/repos/${GITHUB_REPO}/contents/sites/${slug}/README.md`, 'PUT', {
          message: `Update README for ${opts.displayName}`,
          content: btoa(unescape(encodeURIComponent(readme))),
          sha: existing.sha,
          branch,
        });
      } catch {
        await ghCreateFile(token, `sites/${slug}/README.md`, readme, `Add README for ${opts.displayName}`, branch);
      }
    } else {
      await ghCreateFile(token, `sites/${slug}/README.md`, readme, `Add README for ${opts.displayName}`, branch);
    }

    // 8. Create the PR
    const prTitle = isCapabilityAddition
      ? `Add capabilities to ${opts.displayName}`
      : `New site: ${opts.displayName}`;

    const newCapsSection = isCapabilityAddition
      ? `\n\n### New capabilities\n${opts.capabilities.map((c) => `- ${c}`).join('\n')}\n\n### All capabilities after merge\n${allCapabilities.map((c) => `- ${c}`).join('\n')}`
      : `\n\n### Capabilities\n${opts.capabilities.map((c) => `- ${c}`).join('\n')}`;

    const pr = await ghFetch(token, `/repos/${GITHUB_REPO}/pulls`, 'POST', {
      title: prTitle,
      body: `## ${opts.displayName}\n\n${opts.description}\n\n**Site:** ${opts.siteUrl}\n**Submitted by:** ${opts.submitterUsername}\n**Submission ID:** ${opts.submissionId}${newCapsSection}`,
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
export async function getPRState(
  token: string,
  prNumber: number
): Promise<{
  state: string;
  merged: boolean;
  closedAt: string | null;
  mergedAt: string | null;
} | null> {
  try {
    const pr = await ghFetch(token, `/repos/${GITHUB_REPO}/pulls/${prNumber}`);
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
export async function getPRCloseComment(
  token: string,
  prNumber: number
): Promise<string | null> {
  try {
    const comments = await ghFetch(
      token,
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
