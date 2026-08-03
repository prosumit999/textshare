process.env.MONGODB_URI ||= "mongodb://localhost:27017/textshare_test";
process.env.SHARE_ENCRYPTION_KEYS ||=
  "test-encryption-key-current,test-encryption-key-old";
process.env.AUDIT_LOG_KEYS ||= "test-audit-signing-key";
process.env.ADMIN_EMAIL ||= "admin-test@example.com";
process.env.ADMIN_PASSWORD ||= "AdminTest123!";
process.env.CLAMAV_REQUIRED = "false";
process.env.REDIS_URL = "";
process.env.STRIPE_SECRET_KEY ||=
  "sk_test_51TextShareAutomatedTestKey000000000000";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_textshare_test_secret";
process.env.STRIPE_MONTHLY_PRICE_ID ||= "price_textshare_monthly";
process.env.STRIPE_ANNUAL_PRICE_ID ||= "price_textshare_annual";
process.env.EMAIL_DELIVERY_DISABLED = "true";
