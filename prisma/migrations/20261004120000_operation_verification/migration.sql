-- Additive: preserves historical operations and audit records.
ALTER TABLE "Device" ADD COLUMN "localLabel" VARCHAR(120);
ALTER TABLE "DeviceOperation"
  ADD COLUMN "requestFingerprint" VARCHAR(64),
  ADD COLUMN "verification" JSONB,
  ADD COLUMN "verificationTaskId" VARCHAR(255),
  ADD COLUMN "verificationRequestedAt" TIMESTAMPTZ(3),
  ADD COLUMN "expiresAt" TIMESTAMPTZ(3);
