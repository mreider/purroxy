export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Patterns that look like secrets
const SECRET_PATTERNS = [
  { pattern: /sk-[a-zA-Z0-9_-]{20,}/, name: 'API key (sk-)' },
  { pattern: /Bearer [a-zA-Z0-9._-]{20,}/, name: 'Bearer token' },
  { pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\./, name: 'JWT token' },
  { pattern: /[A-Za-z0-9+/]{60,}={0,2}/, name: 'Long base64 string (possible token)' },
  { pattern: /password["']?\s*[:=]\s*["'][^"']{4,}/, name: 'Password in value' },
  { pattern: /secret["']?\s*[:=]\s*["'][^"']{4,}/, name: 'Secret in value' },
];

// Patterns that indicate executable code
const CODE_PATTERNS = [
  { pattern: /function\s*\(/, name: 'JavaScript function' },
  { pattern: /=>\s*\{/, name: 'Arrow function' },
  { pattern: /eval\s*\(/, name: 'eval() call' },
  { pattern: /require\s*\(/, name: 'require() call' },
  { pattern: /import\s+.*from/, name: 'ES import' },
  { pattern: /<script[\s>]/, name: 'Script tag' },
  { pattern: /exec\s*\(/, name: 'exec() call' },
];

// Fields that should never have real values in published profiles
const SENSITIVE_FIELD_NAMES = ['password', 'secret', 'token', 'api_key', 'apikey', 'access_token', 'refresh_token'];

export function scanForSecrets(jsonStr: string): string[] {
  const findings: string[] = [];
  for (const { pattern, name } of SECRET_PATTERNS) {
    if (pattern.test(jsonStr)) {
      findings.push(`Possible secret detected: ${name}`);
    }
  }
  return findings;
}

export function scanForCode(jsonStr: string): string[] {
  const findings: string[] = [];
  for (const { pattern, name } of CODE_PATTERNS) {
    if (pattern.test(jsonStr)) {
      findings.push(`Executable code detected: ${name}`);
    }
  }
  return findings;
}

export function validateProfilePackage(
  profileJson: string,
  authSpecJson: string,
  endpointsJson: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse JSON
  let profile: any;
  let authSpec: any;
  let endpoints: any;

  try { profile = JSON.parse(profileJson); }
  catch { errors.push('profile.json is not valid JSON'); }

  try { authSpec = JSON.parse(authSpecJson); }
  catch { errors.push('auth-spec.json is not valid JSON'); }

  try { endpoints = JSON.parse(endpointsJson); }
  catch { errors.push('endpoints.json is not valid JSON'); }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // Validate profile manifest
  if (!profile.id) errors.push('profile.json: missing id');
  if (!profile.name) errors.push('profile.json: missing name');
  if (!profile.siteName) errors.push('profile.json: missing siteName');
  if (!profile.siteBaseUrl) errors.push('profile.json: missing siteBaseUrl');
  if (!profile.authType) errors.push('profile.json: missing authType');

  // Validate auth spec
  if (!authSpec.loginEndpoint) errors.push('auth-spec.json: missing loginEndpoint');
  if (!authSpec.sessionMechanism) errors.push('auth-spec.json: missing sessionMechanism');
  if (authSpec.loginEndpoint?.url) {
    try { new URL(authSpec.loginEndpoint.url); }
    catch { errors.push('auth-spec.json: loginEndpoint.url is not a valid URL'); }
  }

  // Validate endpoints
  if (!Array.isArray(endpoints)) {
    errors.push('endpoints.json: must be an array');
  } else {
    for (let i = 0; i < endpoints.length; i++) {
      const ep = endpoints[i];
      if (!ep.name) errors.push(`endpoints[${i}]: missing name`);
      if (!ep.method) errors.push(`endpoints[${i}]: missing method`);
      if (!ep.urlPattern) errors.push(`endpoints[${i}]: missing urlPattern`);
    }
  }

  // Scan for secrets in all files
  const allJson = profileJson + authSpecJson + endpointsJson;
  const secretFindings = scanForSecrets(allJson);
  for (const finding of secretFindings) {
    errors.push(finding);
  }

  // Scan for executable code
  const codeFindings = scanForCode(allJson);
  for (const finding of codeFindings) {
    errors.push(finding);
  }

  // Check auth spec credential fields don't have values
  if (authSpec.loginEndpoint?.credentialFields) {
    for (const field of authSpec.loginEndpoint.credentialFields) {
      if (SENSITIVE_FIELD_NAMES.includes(field.name?.toLowerCase()) && field.value) {
        errors.push(`auth-spec.json: credential field "${field.name}" has a value (must be shape only)`);
      }
    }
  }

  // Check static fields for suspicious values
  if (authSpec.loginEndpoint?.staticFields) {
    for (const field of authSpec.loginEndpoint.staticFields) {
      const secretHits = scanForSecrets(field.value || '');
      for (const hit of secretHits) {
        errors.push(`auth-spec.json: staticField "${field.name}" - ${hit}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
