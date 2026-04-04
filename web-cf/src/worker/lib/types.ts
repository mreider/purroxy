export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;
  STRIPE_SECRET_KEY: string;
  STRIPE_PRICE_ID: string;
  STRIPE_WEBHOOK_SECRET: string;
  MAILGUN_API_KEY: string;
  MAILGUN_DOMAIN: string;
  GITHUB_TOKEN: string;
  GITHUB_WEBHOOK_SECRET: string;
  SESSION_SECRET: string;
  APP_URL: string;
  LAUNCH_CODE: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  license_key: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  subscription_stripe_id: string | null;
  github_username: string | null;
  contributor_status: string;
  email_verified: number;
  verify_token: string | null;
  verify_token_expires: string | null;
  reset_token: string | null;
  reset_token_expires: string | null;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  username: string;
  site_slug: string | null;
  submission_type: string;
  github_pr_number: number | null;
  github_pr_url: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}
