-- CreateTable
CREATE TABLE "discovered_page_urls" (
    "id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "page_type" VARCHAR(20) NOT NULL,
    "resolved_url" VARCHAR(1024) NOT NULL,
    "url_resolution_method" VARCHAR(20) NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovered_page_urls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_discovered_page_url" ON "discovered_page_urls"("connector_instance_id", "page_type", "resolved_url");

-- CreateIndex
CREATE INDEX "idx_discovered_connector_pagetype" ON "discovered_page_urls"("connector_instance_id", "page_type");

-- AddForeignKey
ALTER TABLE "discovered_page_urls" ADD CONSTRAINT "discovered_page_urls_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
