/**
 * Runs before every test file. The feature tests make many requests in a row, so the
 * rate limits are raised here; security.test.ts sets low limits to test them.
 */
process.env.AUTH_RATE_LIMIT_PER_MINUTE ??= "10000";
process.env.API_RATE_LIMIT_PER_MINUTE ??= "10000";
