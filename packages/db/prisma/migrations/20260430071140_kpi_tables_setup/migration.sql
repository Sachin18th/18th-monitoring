-- CreateTable
CREATE TABLE "Tenant" (
    "id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "plan" VARCHAR(50) NOT NULL DEFAULT 'FREE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" VARCHAR(255) NOT NULL,
    "tenantId" VARCHAR(36) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "environment" VARCHAR(50) NOT NULL DEFAULT 'production',
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "activeVersionId" VARCHAR(36),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" VARCHAR(36) NOT NULL,
    "tenantId" VARCHAR(36) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "mfaEnabled" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProjectAccess" (
    "userId" VARCHAR(36) NOT NULL,
    "projectId" VARCHAR(255) NOT NULL,
    "roleOverride" VARCHAR(50),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProjectAccess_pkey" PRIMARY KEY ("userId","projectId")
);

-- CreateTable
CREATE TABLE "ConfigVersion" (
    "versionId" VARCHAR(36) NOT NULL,
    "siteId" VARCHAR(255) NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "kpiDefinitionBlob" JSONB NOT NULL DEFAULT '{}',
    "widgetDefinitionBlob" JSONB NOT NULL DEFAULT '{}',
    "connectorDefinitionBlob" JSONB NOT NULL DEFAULT '{}',
    "createdBy" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigVersion_pkey" PRIMARY KEY ("versionId")
);

-- CreateTable
CREATE TABLE "IamAuditLog" (
    "id" SERIAL NOT NULL,
    "tenantId" VARCHAR(36) NOT NULL,
    "actorId" VARCHAR(255) NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "targetType" VARCHAR(255) NOT NULL,
    "targetId" VARCHAR(255) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IamAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "idx_project_tenant" ON "Project"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "idx_user_tenant" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "idx_iam_audit_tenant_ts" ON "IamAuditLog"("tenantId", "timestamp");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectAccess" ADD CONSTRAINT "UserProjectAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectAccess" ADD CONSTRAINT "UserProjectAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigVersion" ADD CONSTRAINT "ConfigVersion_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IamAuditLog" ADD CONSTRAINT "IamAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
