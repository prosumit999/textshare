process.env.MONGODB_URI ||= "mongodb://localhost:27017/textshare_test";
process.env.SHARE_ENCRYPTION_KEYS ||=
  "test-encryption-key-current,test-encryption-key-old";
process.env.AUDIT_LOG_KEYS ||= "test-audit-signing-key";
process.env.ADMIN_EMAIL ||= "admin-test@example.com";
process.env.ADMIN_PASSWORD ||= "AdminTest123!";
process.env.CLAMAV_REQUIRED = "false";
process.env.REDIS_URL = "";
