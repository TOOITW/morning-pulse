# Tasks: Financial Newsletter MVP (MorningPulse)

**Input**: Design documents from `/specs/001-newsletter-mvp/`  
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md

**Tests**: Tests are OPTIONAL - only include them if explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `apps/web/`, `services/nlp-py/`, `infra/cdk/` at repository root
- Paths shown below follow the structure documented in plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure (免費版本)

- [ ] T001 Create monorepo structure with workspace configuration in package.json
- [ ] T002 Initialize Next.js app in apps/web/ with TypeScript and App Router
- [ ] T003 [P] Initialize Python project in services/nlp-py/ with pyproject.toml and virtual environment
- [ ] T004 [P] Configure Docker Compose for local development (PostgreSQL only) in docker-compose.yml
- [ ] T005 Create Prisma schema in apps/web/prisma/schema.prisma with base tables (sources, articles, clusters, users, issues, jobs)
- [ ] T006 Run Prisma migration to initialize PostgreSQL schema
- [ ] T007 [P] Configure ESLint and Prettier for TypeScript in apps/web/
- [ ] T008 [P] Configure Black and mypy for Python in services/nlp-py/
- [ ] T009 [P] Setup GitHub Actions CI workflow in .github/workflows/ci.yml (lint, typecheck, test) - OPTIONAL
- [ ] T010 [P] Configure environment variables template in .env.example (DB connection, email credentials, API keys)

**Checkpoint**: Development environment ready - can run `docker-compose up`, Prisma client generates types

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T011 Create Source model in apps/web/src/lib/db/models.ts with fields: id, name, type, url, trust_score, ttl_min, status
- [ ] T012 Create Article model in apps/web/src/lib/db/models.ts with fields: id, source_id, guid, canonical_url, content_hash, title, ts_published, summary_raw, symbols, topics, cluster_id
- [ ] T013 [P] Implement database connection helper in apps/web/src/lib/db/client.ts using Prisma
- [ ] T014 [P] Implement URL normalization utility in apps/web/src/lib/utils/url.ts (remove UTM params, follow redirects, extract canonical)
- [ ] T015 [P] Implement content hash generator in apps/web/src/lib/utils/hash.ts (SHA256 of canonical URL + stripped title)
- [ ] T016 Implement RSS adapter interface in apps/web/src/lib/ingest/rss-adapter.ts using rss-parser with ETag/Last-Modified support
- [ ] T017 [P] Implement HTTP retry logic with exponential backoff in apps/web/src/lib/utils/retry.ts for 429/5xx errors
- [ ] T018 [P] Create source health tracking service in apps/web/src/lib/services/source-health.ts (consecutive failure counter, degraded marking)
- [ ] T019 [P] Setup structured logging in apps/web/src/lib/observability/logger.ts with Winston/Pino (取代 OpenTelemetry)
- [ ] T020 [P] Setup structured logging in services/nlp-py/src/lib/logger.py with structlog
- [ ] T021 [P] Implement simple job queue (SQLite-based) in apps/web/src/lib/queue/job-queue.ts (取代 SQS)
- [ ] T022 [P] Implement job processor base class in services/nlp-py/src/lib/job_processor.py (取代 SQS consumer)
- [ ] T023 [P] Setup PostgreSQL connection in services/nlp-py/src/lib/db.py using psycopg2 with connection pooling

**Checkpoint**: Foundation ready - can fetch from one RSS source, store in DB with proper normalization and hashing

---

## Phase 3: User Story 1 - Daily Newsletter Delivery (Priority: P1) 🎯 MVP

**Goal**: Deliver a curated, deduplicated financial newsletter every morning at 7:30 AM Taipei time

**Independent Test**: Subscribe with test email, wait for next day 7:30 AM, verify newsletter received within 5 minutes with deduplicated articles

### Implementation for User Story 1

- [ ] T024 [P] [US1] Implement RSS ingestion for 3 initial sources (Reuters, CNBC, Yahoo Finance) in apps/web/src/lib/ingest/sources/
- [ ] T025 [US1] Create ETL CLI command in scripts/etl/fetch-articles.ts to manually trigger fetch for all active sources
- [ ] T026 [US1] Implement batch article insertion with upsert logic in apps/web/src/lib/db/repositories/articles.ts (deduplication by content_hash)
- [ ] T027 [P] [US1] Implement SimHash algorithm in services/nlp-py/src/workers/deduplicator.py using datasketch library
- [ ] T028 [US1] Create clustering service in services/nlp-py/src/workers/deduplicator.py to group articles with similarity ≥0.85 within 48h window
- [ ] T029 [US1] Implement representative article selection logic (longest content + highest trust score) in services/nlp-py/src/workers/deduplicator.py
- [ ] T030 [US1] Create job handler for deduplication tasks in services/nlp-py/src/workers/deduplicator.py (取代 SQS handler)
- [ ] T031 [P] [US1] Implement rule-based summarization in services/nlp-py/src/workers/summarizer.py (extract first paragraph + key sentences)
- [ ] T032 [P] [US1] Implement numerical fact verification in services/nlp-py/src/workers/summarizer.py (compare extracted numbers with source text)
- [ ] T033 [US1] Create job handler for summarization tasks in services/nlp-py/src/workers/summarizer.py
- [ ] T034 [P] [US1] Implement basic ranking algorithm in apps/web/src/lib/ranking/scorer.ts: score = 0.35×Recency + 0.25×SourceTrust + 0.25×Relevance + 0.15×Heat
- [ ] T035 [P] [US1] Implement filtering guardrails in apps/web/src/lib/ranking/filter.ts (SourceTrust <0.4, same source max 3, same cluster only 1)
- [ ] T036 [P] [US1] Create MJML email template in apps/web/src/lib/email/templates/daily-newsletter.mjml with sections: Market Overview, Top Stories (5-8 cards)
- [ ] T037 [US1] Implement MJML to HTML compilation in apps/web/src/lib/email/renderer.ts
- [ ] T038 [P] [US1] Implement Nodemailer sender in apps/web/src/lib/email/nodemailer-sender.ts with Gmail SMTP or Resend.com integration (取代 AWS SES)
- [ ] T039 [US1] Create bounce/complaint webhook handler in apps/web/src/app/api/email-webhook/route.ts (hard bounce → immediate unsub, soft ×3 → unsub)
- [ ] T040 [US1] Implement newsletter generation pipeline in apps/web/src/lib/services/newsletter-builder.ts (fetch ranked articles → render MJML → send via Nodemailer)
- [ ] T041 [US1] Create node-cron scheduled job in apps/web/src/lib/scheduler/cron-jobs.ts to trigger newsletter at 7:30 AM Taipei time (取代 EventBridge)
- [ ] T042 [US1] Implement idempotency check in newsletter service (query issues table to ensure not already sent today)
- [ ] T043 [P] [US1] Create simple metrics logging in scripts/ops/metrics-logger.ts for: source health, article ingestion rate, deduplication metrics, email delivery rate (取代 Grafana)
- [ ] T044 [US1] Add structured log events for all pipeline stages: ingest, normalize, dedupe, nlp, rank, build, send with correlation_id

**Checkpoint**: At this point, User Story 1 should be fully functional - daily newsletter sends at 7:30 AM with deduplicated, summarized articles

---

## Phase 4: User Story 4 - Source Credibility and Transparency (Priority: P1) 

**Goal**: Display source names and trust scores, filter low-credibility sources

**Independent Test**: Review newsletter article cards, verify source names displayed, check that sources with trust <0.4 are excluded

### Implementation for User Story 4

- [ ] T045 [P] [US4] Add trust_score initialization script in scripts/etl/seed-sources.ts with initial scores for Reuters (0.9), CNBC (0.8), Yahoo Finance (0.7)
- [ ] T046 [P] [US4] Update MJML template in apps/web/src/lib/email/templates/daily-newsletter.mjml to include prominent source name in article cards
- [ ] T047 [P] [US4] Ensure original article URL is clickable in email template
- [ ] T048 [US4] Verify filtering logic in apps/web/src/lib/ranking/filter.ts excludes sources with trust_score < 0.4 from top 8 articles

**Checkpoint**: User Story 4 complete - newsletter displays source names, links to originals, filters low-credibility sources

---

## Phase 5: User Story 2 - Personalized Content Ranking (Priority: P2)

**Goal**: Allow users to customize watchlists (symbols, topics) to personalize newsletter content

**Independent Test**: Configure test user with watchlist [AAPL, 2330, #AI], receive newsletter, verify articles mentioning these items rank higher

### Implementation for User Story 2

- [ ] T049 [P] [US2] Implement entity extraction (NER) in services/nlp-py/src/workers/ner.py using spaCy for company names, stock symbols, industries, countries
- [ ] T050 [P] [US2] Create dictionary-based matching for top 200 Taiwan/US stocks in services/nlp-py/src/workers/ner.py
- [ ] T051 [P] [US2] Implement regex patterns for stock symbol detection in services/nlp-py/src/workers/ner.py (e.g., [A-Z]{1,5}, \d{4}\.TW)
- [ ] T052 [P] [US2] Create disambiguation table for ambiguous entities (e.g., "IT" company vs pronoun) in services/nlp-py/src/workers/ner.py
- [ ] T053 [US2] Create job handler for NER tasks in services/nlp-py/src/workers/ner.py
- [ ] T054 [P] [US2] Add watchlist_symbols and topics fields to User model in apps/web/prisma/schema.prisma
- [ ] T055 [P] [US2] Implement watchlist CRUD API endpoints in apps/web/src/app/api/users/[id]/watchlist/route.ts
- [ ] T056 [US2] Update relevance scoring in apps/web/src/lib/ranking/scorer.ts to weight articles matching user's watchlist symbols/topics higher
- [ ] T057 [P] [US2] Add "Your Watchlist" section to MJML template in apps/web/src/lib/email/templates/daily-newsletter.mjml
- [ ] T058 [US2] Implement personalized newsletter generation in apps/web/src/lib/services/newsletter-builder.ts (fetch user preferences, apply relevance scoring)
- [ ] T059 [P] [US2] Add Market Overview section logic in apps/web/src/lib/services/market-overview.ts to include Taiwan/US summaries based on user watchlist

**Checkpoint**: User Story 2 complete - users can configure watchlists, newsletter prioritizes relevant articles

---

## Phase 6: User Story 3 - Article Summary Quality (Priority: P2)

**Goal**: Generate accurate 2-sentence summaries preserving key financial data

**Independent Test**: Review 50 newsletter summaries, verify critical numbers (prices, percentages) match source articles, check average human rating ≥4/5

### Implementation for User Story 3

- [ ] T060 [P] [US3] Enhance numerical extraction in services/nlp-py/src/workers/summarizer.py with regex for currency ($123.45), percentages (12.3%), dates
- [ ] T061 [P] [US3] Implement cross-validation logic in services/nlp-py/src/workers/summarizer.py to compare summary numbers against original article numbers
- [ ] T062 [P] [US3] Add fallback hierarchy in services/nlp-py/src/workers/summarizer.py: NLP summary → rule-based → first paragraph truncated
- [ ] T063 [P] [US3] Create human QA sampling script in scripts/ops/qa-summaries.py to randomly select 50 summaries for manual review
- [ ] T064 [US3] Implement summary quality metrics tracking in apps/web/src/lib/observability/metrics.ts (summarization success rate, fallback usage rate)
- [ ] T065 [P] [US3] (Optional) Add OpenAI API integration in services/nlp-py/src/workers/summarizer.py for LLM-based rewriting with numerical validation

**Checkpoint**: User Story 3 complete - summaries are accurate, preserve key numbers, have fallback mechanisms

---

## Phase 7: User Story 5 - Subscription Management (Priority: P3)

**Goal**: Implement unsubscribe flow and bounce handling

**Independent Test**: Click unsubscribe link in newsletter, verify no further emails sent, test hard/soft bounce handling

### Implementation for User Story 5

- [ ] T066 [P] [US5] Add unsubscribed_at field to User model in apps/web/prisma/schema.prisma
- [ ] T067 [P] [US5] Create /api/unsubscribe API endpoint in apps/web/src/app/api/unsubscribe/route.ts with CSRF token validation
- [ ] T068 [P] [US5] Create unsubscribe confirmation page in apps/web/src/app/unsubscribe/page.tsx
- [ ] T069 [US5] Update newsletter sending logic in apps/web/src/lib/email/nodemailer-sender.ts to exclude users where unsubscribed_at IS NOT NULL
- [ ] T070 [P] [US5] Enhance bounce webhook handler in apps/web/src/app/api/email-webhook/route.ts to implement soft bounce counter (3 strikes)
- [ ] T071 [P] [US5] Add suppression list management in apps/web/src/lib/email/suppression.ts (track bounced/complained emails)
- [ ] T072 [US5] Add unsubscribe link to email footer in apps/web/src/lib/email/templates/daily-newsletter.mjml

**Checkpoint**: User Story 5 complete - users can unsubscribe easily, bounce handling prevents repeated failures

---

## Phase 8: Observability & Compliance (Cross-Cutting Concerns)

**Purpose**: Basic logging, alerting, legal compliance, operational readiness (免費方案)

- [ ] T073 [P] Add end-to-end latency tracking in apps/web/src/lib/observability/metrics.ts using structured logs (fetch → send duration)
- [ ] T074 [P] Create simple alerting script in scripts/ops/check-health.ts for: source degraded (5 failures), cron missed (>15min), bounce spike (>5%/hour)
- [ ] T075 [P] Implement data retention cron job in scripts/ops/data-retention.ts (delete article snapshots >7 days, audit logs >90 days)
- [ ] T076 [P] Create privacy policy snippet in apps/web/src/lib/email/templates/privacy-footer.mjml
- [ ] T077 [P] Add source attribution rendering in apps/web/src/lib/email/renderer.ts (prominent source name + original URL)
- [ ] T078 [P] Create incident response runbook in docs/RUNBOOK.md (rollback procedures, kill-switch activation)
- [ ] T079 [P] Create compliance checklist script in scripts/ops/compliance-check.ts to verify: unsubscribe link, source attribution, data retention policies
- [ ] T080 [P] Implement kill-switch in apps/web/src/lib/services/newsletter-builder.ts (fallback to time-sorted + rule-based version if modules fail)
- [ ] T081 [P] Create simple metrics dashboard script in scripts/ops/show-metrics.ts to display daily stats from SQLite (取代 staging environment)

**Checkpoint**: Observability and compliance ready - structured logging, basic alerts configured, legal requirements met

---

## Phase 9: Beta Launch Preparation

**Purpose**: Final polish, beta user onboarding, monitoring setup (免費方案)

- [ ] T082 [P] Create beta user onboarding script in scripts/ops/onboard-beta-users.ts (collect emails, initialize preferences)
- [ ] T083 [P] Implement open/click tracking in apps/web/src/app/api/track/route.ts (1x1 pixel + redirect URLs → log to DB)
- [ ] T084 [P] Create daily report generation script in scripts/ops/daily-report.ts (duplicate rate, summarization failures, delivery success, CTR)
- [ ] T085 [P] Add feedback collection form link to newsletter footer in apps/web/src/lib/email/templates/daily-newsletter.mjml
- [ ] T086 Test node-cron scheduled job triggers newsletter at correct time (7:30 AM Taipei)
- [ ] T087 [P] Create smoke test suite in apps/web/tests/integration/newsletter-e2e.test.ts (full pipeline: fetch → dedupe → summarize → send)
- [ ] T088 [P] Document deployment process in README.md (local dev setup, environment variables)
- [ ] T089 [P] Document email service setup in docs/EMAIL-SETUP.md (Gmail SMTP / Resend.com configuration)
- [ ] T090 Run load test with 1000 articles to verify deduplication completes within 30 seconds

**Checkpoint**: Ready for beta launch - 10-20 users onboarded, monitoring live, documentation complete

---

## Dependencies & Critical Path

### Story Completion Order

```
Foundation (Phase 2) MUST complete before any user stories
    ↓
User Story 1 (P1) - Daily Newsletter Delivery [REQUIRED FOR MVP]
    ↓
User Story 4 (P1) - Source Credibility [ENHANCES US1]
    ↓
┌─────────────────────────────┐
│ Can be implemented in parallel:
│ - User Story 2 (P2) - Personalized Ranking
│ - User Story 3 (P2) - Summary Quality
│ - User Story 5 (P3) - Subscription Management
└─────────────────────────────┘
    ↓
Observability & Compliance (Phase 8) [MUST complete before beta]
    ↓
Beta Launch (Phase 9)
```

### Parallel Execution Opportunities

**During Foundation (Phase 2)**:
- T014-T016 (DB utilities) can run in parallel
- T017-T019 (RSS adapter + retry + health) can run in parallel
- T020-T023 (OpenTelemetry + SQS + Python DB) can run in parallel

**During User Story 1 (Phase 3)**:
- T024 (RSS ingestion) + T027-T029 (deduplication) + T031-T032 (summarization) can run in parallel (different files)
- T034-T035 (ranking + filtering) + T036-T038 (email template + rendering + SES) can run in parallel

**During User Story 2 (Phase 5)**:
- T049-T053 (NER implementation) + T054-T055 (watchlist API) can run in parallel
- T057 (MJML section) + T059 (market overview) can run in parallel

**During User Story 3 (Phase 6)**:
- T060-T062 (numerical extraction + validation + fallback) can run in parallel
- T063 (QA script) + T064 (metrics) can run in parallel

**During Observability (Phase 8)**:
- T073-T079 (all can run in parallel - different concerns)

---

## MVP Scope Recommendation

**Minimal Viable Product = User Story 1 + Foundation**

For fastest time-to-value, implement:
- Phase 1: Setup (T001-T011)
- Phase 2: Foundational (T012-T023)
- Phase 3: User Story 1 (T024-T044)
- Phase 8: Observability basics (T073, T078, T080)

This delivers: Daily newsletter at 7:30 AM with deduplicated articles, summaries, and proper email delivery.

**MVP+ = Add User Story 4 for credibility transparency**
- Phase 4: User Story 4 (T045-T048)

**Full V1 = All user stories + compliance**
- All phases (T001-T090)

---

## Task Statistics

- **Total Tasks**: 90 → **87 tasks** (移除 3 個 AWS CDK/雲服務相關任務)
- **Setup & Foundation**: 23 → **20 tasks** (T001-T020) - 移除 CDK, 調整 logging
- **User Story 1 (P1)**: 21 tasks (T024-T044) - 核心改為免費方案
- **User Story 4 (P1)**: 4 tasks (T045-T048)
- **User Story 2 (P2)**: 11 tasks (T049-T059)
- **User Story 3 (P2)**: 6 tasks (T060-T065)
- **User Story 5 (P3)**: 7 tasks (T066-T072)
- **Observability & Compliance**: 9 tasks (T073-T081) - 簡化為免費方案
- **Beta Launch**: 9 tasks (T082-T090) - 調整為免費追蹤

**免費方案關鍵技術**:
- **Email**: Nodemailer + Gmail SMTP (500封/日) 或 Resend.com (3000封/月)
- **Queue**: SQLite-based job queue (取代 AWS SQS)
- **Database**: Docker PostgreSQL (本地執行)
- **Logging**: Winston/Pino + structlog (取代 OpenTelemetry + Grafana)
- **Scheduling**: node-cron (取代 AWS EventBridge)
- **Secrets**: .env 檔案 + dotenv (取代 AWS SSM)
- **Tracking**: Next.js API routes (取代 SNS/Lambda)

**Parallelizable Tasks**: 45 tasks marked with [P] (52% of total)

**Estimated Timeline** (assuming single developer):
- Setup & Foundation: 2-3 days
- User Story 1 (MVP Core): 5-6 days
- User Story 4: 1 day
- User Stories 2, 3, 5 (in parallel): 3-4 days
- Observability & Compliance: 2 days
- Beta Launch Prep: 1 day

**Total: 14-17 days** (維持原計畫,但成本從 $100/月 → **$0/月**)

**免費額度限制**:
- **Gmail SMTP**: 500 封/日 (足夠 10-20 beta users)
- **Resend.com**: 3,000 封/月 + 100 封/日 (推薦選項)
- **PostgreSQL**: 無限制 (本地 Docker)
- **Storage**: 本地硬碟 (無限制)

**擴展路徑** (未來需要時):
- 100+ users: 升級到 Resend Pro ($20/月,50K封) 或 SendGrid
- 1000+ users: 考慮 Railway ($5/月起) 部署
- 進階監控: 加入免費 Grafana Cloud 額度

---

## Format Validation

✅ All tasks follow checklist format: `- [ ] [TaskID] [P?] [Story?] Description with file path`  
✅ Task IDs sequential (T001-T090)  
✅ [P] markers applied to parallelizable tasks (47 tasks)  
✅ [US1]-[US5] story labels applied to user story phases  
✅ File paths included in all implementation tasks  
✅ Dependencies documented in Critical Path section  
✅ Independent test criteria defined for each user story phase  
✅ MVP scope clearly recommended (Foundation + US1)

**Status**: ✅ READY FOR IMPLEMENTATION - Tasks are immediately executable
