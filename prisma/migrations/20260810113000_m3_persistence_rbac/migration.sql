-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'NOC', 'SUPPORT_L2', 'SUPPORT_L1', 'FIELD_TECHNICIAN', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "CapabilityState" AS ENUM ('supported', 'unsupported', 'unknown', 'read_only', 'experimental');

-- CreateEnum
CREATE TYPE "DeviceOnlineState" AS ENUM ('online', 'stale', 'offline', 'unknown');

-- CreateEnum
CREATE TYPE "DeviceOperationState" AS ENUM ('executed', 'queued', 'failed', 'timed_out');

-- CreateEnum
CREATE TYPE "DeviceBindingMethod" AS ENUM ('pppoe', 'mac', 'manual', 'import');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'READ_ONLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "genieAcsId" VARCHAR(255) NOT NULL,
    "serialNumber" VARCHAR(255) NOT NULL,
    "manufacturer" VARCHAR(120),
    "model" VARCHAR(120),
    "productClass" VARCHAR(120),
    "oui" VARCHAR(16),
    "hardwareVersion" VARCHAR(120),
    "softwareVersion" VARCHAR(120),
    "macAddress" VARCHAR(17),
    "pppoeUsername" VARCHAR(255),
    "onlineState" "DeviceOnlineState" NOT NULL DEFAULT 'unknown',
    "lastInformAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCapability" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "state" "CapabilityState" NOT NULL DEFAULT 'unknown',
    "source" VARCHAR(80) NOT NULL,
    "evidence" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceOperation" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "actorId" UUID,
    "type" VARCHAR(100) NOT NULL,
    "state" "DeviceOperationState" NOT NULL,
    "correlationId" VARCHAR(100) NOT NULL,
    "genieAcsTaskId" VARCHAR(255),
    "safeRequestSummary" JSONB,
    "errorCode" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeviceOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentifier" (
    "id" UUID NOT NULL,
    "system" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceBinding" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "externalIdentifierId" UUID NOT NULL,
    "method" "DeviceBindingMethod" NOT NULL,
    "createdById" UUID,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "note" VARCHAR(500),

    CONSTRAINT "DeviceBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "deviceId" UUID,
    "externalIdentifierId" UUID,
    "operationId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "beforeSummary" JSONB,
    "afterSummary" JSONB,
    "correlationId" VARCHAR(100) NOT NULL,
    "result" VARCHAR(40) NOT NULL,
    "genieAcsTaskId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Device_genieAcsId_key" ON "Device"("genieAcsId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_macAddress_key" ON "Device"("macAddress");

-- CreateIndex
CREATE INDEX "Device_manufacturer_model_idx" ON "Device"("manufacturer", "model");

-- CreateIndex
CREATE INDEX "Device_serialNumber_idx" ON "Device"("serialNumber");

-- CreateIndex
CREATE INDEX "Device_pppoeUsername_idx" ON "Device"("pppoeUsername");

-- CreateIndex
CREATE INDEX "Device_lastInformAt_idx" ON "Device"("lastInformAt");

-- CreateIndex
CREATE INDEX "DeviceCapability_name_state_idx" ON "DeviceCapability"("name", "state");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCapability_deviceId_name_key" ON "DeviceCapability"("deviceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceOperation_correlationId_key" ON "DeviceOperation"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceOperation_genieAcsTaskId_key" ON "DeviceOperation"("genieAcsTaskId");

-- CreateIndex
CREATE INDEX "DeviceOperation_deviceId_createdAt_idx" ON "DeviceOperation"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceOperation_actorId_createdAt_idx" ON "DeviceOperation"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceOperation_state_createdAt_idx" ON "DeviceOperation"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentifier_system_entityType_value_key" ON "ExternalIdentifier"("system", "entityType", "value");

-- CreateIndex
CREATE INDEX "DeviceBinding_deviceId_endedAt_idx" ON "DeviceBinding"("deviceId", "endedAt");

-- CreateIndex
CREATE INDEX "DeviceBinding_externalIdentifierId_endedAt_idx" ON "DeviceBinding"("externalIdentifierId", "endedAt");

-- CreateIndex
CREATE INDEX "DeviceBinding_createdById_startedAt_idx" ON "DeviceBinding"("createdById", "startedAt");

-- CreateIndex
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_deviceId_createdAt_idx" ON "AuditLog"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "DeviceCapability" ADD CONSTRAINT "DeviceCapability_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceOperation" ADD CONSTRAINT "DeviceOperation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceOperation" ADD CONSTRAINT "DeviceOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceBinding" ADD CONSTRAINT "DeviceBinding_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceBinding" ADD CONSTRAINT "DeviceBinding_externalIdentifierId_fkey" FOREIGN KEY ("externalIdentifierId") REFERENCES "ExternalIdentifier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceBinding" ADD CONSTRAINT "DeviceBinding_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_externalIdentifierId_fkey" FOREIGN KEY ("externalIdentifierId") REFERENCES "ExternalIdentifier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "DeviceOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
