-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "ttl_min" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'active',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_fetch_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary_raw" TEXT,
    "summary_2" TEXT,
    "content" TEXT,
    "ts_published" TIMESTAMP(3) NOT NULL,
    "author" TEXT,
    "image_url" TEXT,
    "symbols" JSONB,
    "topics" JSONB,
    "entities" JSONB,
    "cluster_id" TEXT,
    "simhash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL,
    "rep_article_id" TEXT,
    "sim_avg" DOUBLE PRECISION,
    "sim_max" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "watchlist_symbols" JSONB,
    "topics" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribed_at" TIMESTAMP(3),
    "bounce_count" INTEGER NOT NULL DEFAULT 0,
    "last_bounce_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "article_ids" JSONB NOT NULL,
    "html_content" TEXT,
    "total_sent" INTEGER NOT NULL DEFAULT 0,
    "total_opened" INTEGER NOT NULL DEFAULT 0,
    "total_clicked" INTEGER NOT NULL DEFAULT 0,
    "total_bounced" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_deliveries" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sources_status_idx" ON "sources"("status");

-- CreateIndex
CREATE INDEX "articles_ts_published_idx" ON "articles"("ts_published");

-- CreateIndex
CREATE INDEX "articles_cluster_id_idx" ON "articles"("cluster_id");

-- CreateIndex
CREATE INDEX "articles_source_id_idx" ON "articles"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "articles_source_id_guid_key" ON "articles"("source_id", "guid");

-- CreateIndex
CREATE UNIQUE INDEX "articles_content_hash_key" ON "articles"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "issues_issue_date_idx" ON "issues"("issue_date");

-- CreateIndex
CREATE UNIQUE INDEX "issues_issue_date_key" ON "issues"("issue_date");

-- CreateIndex
CREATE INDEX "issue_deliveries_user_id_idx" ON "issue_deliveries"("user_id");

-- CreateIndex
CREATE INDEX "issue_deliveries_status_idx" ON "issue_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "issue_deliveries_issue_id_user_id_key" ON "issue_deliveries"("issue_id", "user_id");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- CreateIndex
CREATE INDEX "jobs_scheduled_for_idx" ON "jobs"("scheduled_for");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_deliveries" ADD CONSTRAINT "issue_deliveries_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_deliveries" ADD CONSTRAINT "issue_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
