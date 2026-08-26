try {
  process.loadEnvFile(".env");
} catch {
  // DATABASE_URL may already be set in the environment.
}
