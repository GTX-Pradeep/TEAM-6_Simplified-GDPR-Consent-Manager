/**
 * Runs before every test file (jest.config.js -> setupFiles).
 * - Safe defaults so modules that read the config can be imported in tests.
 * - The feature tests make many requests in a row, so the rate limits are raised here;
 *   security.test.ts sets low limits to test them.
 */
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
process.env.JWT_SECRET ??= "test-secret-that-is-at-least-32-characters";
process.env.AUTH_RATE_LIMIT_PER_MINUTE ??= "10000";
process.env.API_RATE_LIMIT_PER_MINUTE ??= "10000";
