import { initSchema, getDb, closeDb } from '@/lib/db';

// Use an in-memory database for tests
process.env.PURROXY_DB_PATH = ':memory:';

beforeEach(() => {
  // Close and recreate fresh DB for each test
  closeDb();
  initSchema();
});

afterAll(() => {
  closeDb();
});
