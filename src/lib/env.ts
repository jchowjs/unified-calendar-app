function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get fmpApiKey() {
    return required("FMP_API_KEY");
  },
  get homeCurrency() {
    return required("HOME_CURRENCY");
  },
  get passwordHash() {
    return required("PASSWORD_HASH");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
};
