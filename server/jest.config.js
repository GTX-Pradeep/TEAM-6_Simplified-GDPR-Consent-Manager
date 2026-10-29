/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  setupFiles: ["<rootDir>/src/test/setupEnv.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts", "!src/test/**"],
  coverageReporters: ["text", "lcov"],
};
