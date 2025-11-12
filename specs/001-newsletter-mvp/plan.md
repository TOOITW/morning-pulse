# Implementation Plan: Financial Newsletter MVP (MorningPulse)

**Branch**: `001-newsletter-mvp` | **Date**: 2025-11-09 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-newsletter-mvp/spec.md`

## Summary

Deliver a production-ready financial newsletter system within 14 days that automatically curates, deduplicates, and sends personalized financial news to 10-20 beta users daily at 7:30 AM Taipei time. The system prioritizes legal data collection (RSS/API-first), quality over quantity (deduplication + credibility scoring), graceful degradation (fallback mechanisms at every stage), idempotency (content hash-based deduplication), and observability (full OpenTelemetry instrumentation).

**Core Technical Approach**: Monorepo architecture with Next.js BFF for web/email rendering, Python workers for NLP/deduplication, PostgreSQL for persistence, AWS SQS for async processing, and AWS SES for email delivery. Rule-based summarization with optional LLM enhancement ensures reliability with graceful degradation.

## Technical Context

**Language/Version**: TypeScript (Node.js 20+) for BFF/Ingest, Python 3.11+ for NLP/Deduplication workers  
**Primary Dependencies**: Next.js, rss-parser, MJML, Prisma, feedparser, datasketch, spaCy, nodemailer  
**Storage**: PostgreSQL 15+ (Docker local) OR SQLite for simplicity  
**Testing**: Jest/Vitest (TS), pytest (Python), contract tests for APIs  
**Target Platform**: 本地開發 (Local first) - Docker Compose for all services  
**Project Type**: Web application (Next.js BFF + Python workers)  
**Performance Goals**: 
- Newsletter generation: < 5 minutes end-to-end
- Article fetch: 50+ new articles/hour across all sources
- Deduplication: 1000 articles in < 30 seconds
- Email send: 10-20 recipients (beta) in < 30 seconds

**Constraints**:
- **💰 免費優先**: 完全使用免費服務和本地執行
- Single developer, 14-day timeline (2 weeks)
- Cost: **$0/month** (免費 email 額度 + 本地執行)
- Timezone: Asia/Taipei for scheduling
- Beta scope: 10-20 users maximum (符合免費 email 額度)

**Scale/Scope**: 
- V1: 1000 subscribers max
- 6+ data sources (≥3 RSS, ≥2 APIs, ≥1 web scraper)
- 100K articles retained in database
- 7-day article snapshots, 90-day audit logs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ I. Legal-First Data Collection
- **Requirement**: RSS/API primary sources, short excerpts only, no paywall circumvention
- **Plan Compliance**: ≥3 RSS + ≥2 API + ≥1 scraper; 2-sentence summaries with source attribution; explicit "no paywall bypass" in scope
- **Status**: ✅ PASS

### ✅ II. Quality Over Quantity
- **Requirement**: Credibility scoring, deduplication, representative article selection
- **Plan Compliance**: SourceTrust scoring (M1), SimHash deduplication ≥0.85 similarity (M2), ranking formula with trust weight (M4)
- **Status**: ✅ PASS

### ✅ III. Graceful Degradation (NON-NEGOTIABLE)
- **Requirement**: Fallback mechanisms for every failure mode
- **Plan Compliance**: 
  - NLP failure → rule-based summarization (M3)
  - Source failure → degraded marking + backup sources (M1)
  - Module failure → kill-switch to time-sorted + rule-based newsletter (M6)
  - API rate limits → SQS queue + exponential backoff (M1)
- **Status**: ✅ PASS

### ✅ IV. Idempotency & Deduplication
- **Requirement**: Content hash deduplication, no duplicate emails
- **Plan Compliance**: SHA256 content_hash (M1), 48h clustering window (M2), idempotent newsletter generation (M4)
- **Status**: ✅ PASS

### ✅ V. Observability-First Architecture
- **Requirement**: OpenTelemetry instrumentation, metrics, alerting
- **Plan Compliance**: OTel events for all stages (M5), Grafana dashboards (M1+M5), alerting for degraded sources/delays/bounces (M5)
- **Status**: ✅ PASS

**Constitution Check Result**: ✅ ALL PRINCIPLES SATISFIED - No complexity tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/001-newsletter-mvp/
├── plan.md              # This file
├── research.md          # Phase 0: Technology choices and tradeoffs
├── data-model.md        # Phase 1: Database schema and entity relationships
├── quickstart.md        # Phase 1: Development setup and deployment guide
├── contracts/           # Phase 1: API contracts and message formats
└── checklists/
    └── requirements.md  # Specification quality checklist (completed)
```

### Source Code (repository root)

```text
# Monorepo structure: Web application with Python workers

# BFF + Email Rendering (TypeScript/Next.js)
apps/
└── web/                 # Next.js application
    ├── src/
    │   ├── app/         # App router pages
    │   │   ├── api/     # API routes (unsubscribe, health)
    │   │   └── issues/  # Newsletter preview pages
    │   ├── lib/
    │   │   ├── db/      # Prisma client and queries
    │   │   ├── email/   # MJML templates and Nodemailer sender
    │   │   ├── ingest/  # RSS/API adapters
    │   │   ├── queue/   # Simple async job queue (SQLite-based)
    │   │   └── ranking/ # Scoring and filtering logic
    │   └── components/  # React components
    ├── prisma/
    │   └── schema.prisma
    └── tests/
        ├── integration/
        └── unit/

# NLP + Deduplication Workers (Python)
services/
└── nlp-py/             # Python workers
    ├── src/
    │   ├── workers/
    │   │   ├── summarizer.py    # 2-sentence summary generation
    │   │   ├── deduplicator.py  # SimHash clustering
    │   │   └── ner.py           # Entity extraction
    │   ├── lib/
    │   │   ├── job_processor.py # Simple job queue consumer
    │   │   └── db.py            # PostgreSQL connection
    │   └── models/              # NLP models (spaCy, etc.)
    └── tests/
        ├── integration/
        └── unit/

# Shared configuration and scripts
scripts/
├── etl/                 # CLI for one-time data import
├── migrations/          # Database migration scripts
└── ops/                 # Operational scripts (kill-switch, backfill)

# Root-level configuration
├── .github/
│   └── workflows/       # CI/CD pipelines (optional)
├── docker-compose.yml   # Local development environment (PostgreSQL only)
├── package.json         # Monorepo workspace config
└── README.md            # Quickstart and runbook
```

**Structure Decision**: Web application pattern selected due to BFF (Next.js) for email rendering and API endpoints, plus Python workers for computationally intensive NLP/deduplication tasks. Monorepo structure enables shared TypeScript types and streamlined deployment.

## Complexity Tracking

No violations detected - all design choices align with constitution principles.

## Milestones & Exit Criteria

### M1: Foundation & Ingestion (Days 1-2)

**Objective**: Establish infrastructure and reliable multi-source article ingestion.

**Tasks**:
1. Monorepo setup: Next.js app + Python workers (NO CDK)
2. PostgreSQL schema: `sources`, `articles`, `clusters`, `users`, `issues` tables with indexes (Docker Compose)
3. Migration framework (Prisma migrations)
4. RSS adapter ×3 sources: `rss-parser` with ETag/Last-Modified conditional requests
5. URL normalization: Remove UTM parameters, follow 301/302 redirects, extract `<link rel="canonical">`
6. Content hash: `SHA256(canonical_url + stripped_title)`
7. ETL CLI: Single-run and batch modes for backfill
8. **Cron scheduling: node-cron 或本地 cron job** (免費)
9. **基本 logging**: console + file-based logs (取代 Grafana)

**Exit Criteria**:
- ✅ 24-hour continuous operation with 3 RSS sources successfully ingesting
- ✅ Source failure rate < 5%
- ✅ ETag/Last-Modified 304 hit rate visible in logs
- ✅ Manual ETL CLI re-run succeeds without duplicates
- ✅ Logs show real-time fetch metrics

---

### M2: Deduplication & Clustering (Days 3-4)

**Objective**: Identify and group duplicate/similar articles, select representative articles.

**Tasks**:
1. Shingling implementation (n=3 character shingles)
2. SimHash similarity calculation
3. Clustering algorithm: Group articles with similarity ≥0.85 within 48-hour window
4. Representative article selection: Longest content + highest SourceTrust score
5. `clusters` table population with `rep_article_id`, `sim_avg`, `sim_max`
6. **Simple stats logging** (取代 Grafana visualization)
7. Human sampling script: Randomly select 100 articles, flag duplicates

**Exit Criteria**:
- ✅ Manual sampling of 100 articles shows duplicate rate < 3%
- ✅ Representative article selection is auditable (logged with reasoning)
- ✅ Similarity score distribution visible in logs
- ✅ Clustering completes within 30 seconds for 1000 articles

---

### M3: NLP Summarization & Entity Extraction (Days 5-6)

**Objective**: Generate reliable 2-sentence summaries and extract financial entities.

**Tasks**:
1. Rule-based summarization: Extract first paragraph + key sentences (extractive approach)
2. Numerical fact verification: Compare extracted numbers against source text
3. Entity extraction (NER):
   - Company names, stock symbols (AAPL, 2330), industries (半導體, AI), countries (US, TW)
   - Dictionary-based matching for top 200 Taiwan/US stocks
   - Regex patterns for stock symbols (e.g., `[A-Z]{1,5}`, `\d{4}\.TW`)
   - Disambiguation table for common errors
4. **Python async job processor**: 使用簡單的 SQLite job queue (取代 SQS)
5. (Optional) LLM rewriting: If time permits, add OpenAI API for summary polishing with numerical validation

**Exit Criteria**:
- ✅ Human reviewers rate summaries ≥4.0/5.0 on average (sample size: 50)
- ✅ Key financial figures (prices, percentages, dates) have < 10% error/omission rate
- ✅ Entity extraction: ≥90% hit rate for top 200 stocks, < 5% misidentification rate
- ✅ Job processor handles 100 articles in < 5 minutes

---

### M4: Ranking, Templating & Sending (Days 7-9)

**Objective**: Implement personalized ranking, generate HTML newsletter, and send via free email service.

**Tasks**:
1. Scoring algorithm implementation:
   ```
   score = 0.35 × Recency + 0.25 × SourceTrust + 0.25 × Relevance + 0.15 × Heat
   ```
   - Recency: `1 - (hours_since_publish / 48)`
   - SourceTrust: `sources.trust_score` (0..1)
   - Relevance: Watchlist match score (symbol/topic overlap)
   - Heat: Cluster size as proxy for story importance
2. Filtering guardrails:
   - SourceTrust < 0.4 → exclude or downrank
   - Same source: max 3 articles in top 8
   - Same cluster: only 1 representative article
3. MJML template design:
   - Today's Macro (3 bullet points)
   - Market Overview (US/Taiwan/FX/Commodities)
   - Top Stories (5-8 article cards with 2-sentence summaries)
   - Your Watchlist (personalized section)
   - Event Radar (upcoming earnings/economic data)
4. **Email 服務配置 (三選一)**:
   - **Option 1**: Gmail SMTP (免費,每日 500 封限制) - 最簡單
   - **Option 2**: Resend.com (免費額度 3,000封/月) - 推薦
   - **Option 3**: Brevo/SendGrid 免費額度
   - 使用 **nodemailer** 整合
   - Return-Path and List-Unsubscribe headers
   - Bounce handling: Hard bounce → immediate unsubscribe, Soft bounce ×3 → unsubscribe
5. Newsletter generation pipeline: Fetch ranked articles → render MJML → send via nodemailer
6. A/B test setup (small sample): Time-sorted vs scored ranking, measure CTR

**Exit Criteria**:
- ✅ 免費 email 服務成功發送 ≥10 test emails
- ✅ HTML renders correctly in Gmail, Outlook, Apple Mail (manual verification)
- ✅ Top 8 articles achieve ≥20% higher CTR vs time-sorted baseline (measured in internal test)
- ✅ Bounce handling logic verified with test emails

---

### M5: Observability & Compliance (Days 10-11)

**Objective**: Basic logging, alerting, and legal compliance (免費方案).

**Tasks**:
1. **簡化的 Observability** (取代 OpenTelemetry):
   - Structured logging: Winston/Pino (TypeScript), structlog (Python)
   - Events: `ingest`, `normalize`, `dedupe`, `nlp`, `rank`, `build`, `send`
   - 每個 event 記錄: timestamp, stage, duration_ms, error_type, article_count
   - Log rotation (winston-daily-rotate-file)
2. **基本監控** (取代 Grafana):
   - 寫入 SQLite metrics table: daily stats (articles_fetched, emails_sent, errors)
   - 簡單的 dashboard script: 讀取 SQLite → console.table() 輸出
3. **簡化告警** (取代 PagerDuty):
   - 檢查 script: 如果錯誤率 >10% → 發 email/Telegram 通知給自己
4. `/api/unsubscribe` endpoint + landing page
5. Legal compliance artifacts:
   - Privacy policy snippet in email footer
   - Source attribution in article cards
   - Data retention cron job: Delete article snapshots >7 days, audit logs >90 days
6. Runbook documentation: Incident response, rollback procedures

**Exit Criteria**:
- ✅ p95 end-to-end latency < 5 minutes (measured from logs)
- ✅ Compliance checklist 100% complete (privacy, attribution, retention, unsubscribe)
- ✅ Unsubscribe flow tested: Click link → confirm → no further emails
- ✅ Error alerting works (simulate failure → receive notification)

---

### M6: Beta Launch (Days 12-14)

**Objective**: Stable daily newsletter delivery to 10-20 beta users with monitoring and feedback collection.

**Tasks**:
1. Beta user onboarding: Collect emails, preferences (watchlist symbols/topics)
2. **Daily 7:30 AM send (Taipei time) via node-cron** (取代 EventBridge)
3. **簡化追蹤** (取代 SNS/Lambda):
   - Open tracking: 1x1 pixel image → Next.js API route → log to DB
   - Click tracking: redirect URLs → Next.js API route → log to DB
4. Monitoring dashboard: 從 SQLite 讀取 open rate, CTR, bounce rate, delivery success rate
5. Feedback collection: Google Form link in newsletter footer
6. Kill-switch implementation: If any module fails, fallback to "time-sorted + representative article + rule-based summary" version
7. Daily report generation:
   - Duplicate rate (expected < 3%)
   - Summarization failure rate (expected < 10% with fallback)
   - Delivery success rate (expected ≥98%)
   - CTR comparison (scored ranking vs baseline)
   - Source health status

**Exit Criteria**:
- ✅ 2 consecutive weekdays with successful 7:30 AM delivery
- ✅ Bounce rate < 0.3% of total sends
- ✅ Open rate and CTR metrics collected for all sends
- ✅ Kill-switch successfully tested in staging environment
- ✅ At least 5 beta users provide qualitative feedback

---

## Work Breakdown (By Module)

### Ingest Module (TypeScript)
- RSS adapter interface with ETag/Last-Modified support
- HTTP retry with exponential backoff (429/5xx errors)
- URL canonicalization (remove UTM, follow redirects, extract canonical link)
- Content hash generation (SHA256)
- Source health tracking (consecutive failure counter)
- Batch processing for backfill scenarios

### Deduplication Module (Python/TypeScript)
- Shingling algorithm (n=3 character shingles)
- SimHash/MinHash implementation
- 48-hour rolling window for clustering
- Representative article selection logic (content length + trust score)
- Cluster metadata storage (similarity scores, language variants)

### NLP Module (Python)
- Extractive summarization (first paragraph + key sentences)
- Numerical fact verification (regex + fuzzy matching against source)
- NER for financial entities (dictionary + regex + spaCy)
- SQS task consumer (poll, process, ack/nack)
- Optional: LLM API integration with fallback

### BFF / Templating Module (TypeScript/Next.js)
- MJML template → HTML compilation
- `/api/issues/[date]` preview endpoint
- `/api/unsubscribe` endpoint with CSRF protection
- User preference management (watchlist CRUD)
- Newsletter metadata storage (issues table)

### Email Sending Module (TypeScript)
- AWS SES integration (SendEmail API)
- Bounce/complaint webhook handler (SNS → Lambda)
- Suppression list management (hard/soft bounce logic)
- Batch sending with rate limiting (respect SES quotas)

### Observability Module (TypeScript/Python)
- OpenTelemetry SDK setup (tracer, meter, logger)
- Custom events for pipeline stages
- Grafana dashboard provisioning (JSON configs)
- Alert rule definitions (Prometheus/Grafana Alerting)

### Compliance Module (Cross-cutting)
- Legal disclaimer text generation
- Source attribution rendering in email
- Data retention cron jobs (S3 lifecycle policies + DB cleanup)
- PII deletion API endpoint (GDPR-style right to be forgotten)

---

## Deliverables

1. **Deployable Services**:
   - Next.js BFF (Docker image or standalone deployment)
   - Python NLP worker (Docker image)
   - CDK infrastructure stack (deployable to AWS)

2. **Database Assets**:
   - Prisma schema with migrations
   - Seed data script (initial sources with trust scores)
   - Grafana dashboard JSON exports

3. **Operational Scripts**:
   - ETL CLI for manual backfill
   - Kill-switch script (fallback newsletter generation)
   - Data retention cleanup cron job

4. **Documentation**:
   - `README.md`: Quickstart (local dev → staging → prod)
   - `RUNBOOK.md`: Operations guide (deployment, rollback, incident response)
   - `SECRETS.md`: SSM Parameter Store structure
   - `COMPLIANCE.md`: Legal requirements and data handling policies

---

## SLO & Alerting Thresholds

### Service Level Objectives

| Metric | Target | Measurement Window |
|--------|--------|-------------------|
| Article fetch p95 latency | < 5 minutes | 24 hours |
| Fetch failure rate | < 2% | 24 hours |
| Deduplication error rate | < 1% | 24 hours |
| Summarization failure rate | < 10% (with fallback) | 24 hours |
| Email delivery success rate | ≥ 98% | Per send batch |
| Bounce rate | < 0.3% | 7 days |
| End-to-end newsletter generation | p95 < 10 minutes | Per newsletter |

### Alert Conditions

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Source degraded | 3 consecutive failures | Warning | Check adapter, robots.txt, rate limits |
| Cron job timeout | No completion within 15 min | Critical | Manually trigger ETL, check logs |
| Bounce rate spike | > 5% in 1 hour | Critical | Pause sending, investigate email content/reputation |
| Unsubscribe rate spike | > 20% in 24 hours | Warning | Review newsletter quality, check for spam complaints |
| CTR below baseline | < 50% of expected CTR | Warning | Review ranking algorithm, article quality |

---

## Risk Register

### Risk 1: Data Source Blocking or Format Changes
- **Probability**: Medium (RSS feeds are stable, but scraping targets may change)
- **Impact**: High (missing sources → incomplete newsletter)
- **Mitigation**:
  - Multi-source redundancy (6+ sources)
  - Monitor 4xx/5xx error rates per source
  - Quick adapter hotfix deployment (feature flag for source disable)
  - User-Agent rotation for scrapers
- **Contingency**: Exclude degraded sources, rely on remaining sources

### Risk 2: Legal Disputes from Publishers
- **Probability**: Low (short excerpts + attribution generally acceptable)
- **Impact**: High (could force shutdown)
- **Mitigation**:
  - Strict 2-sentence limit on excerpts
  - Prominent source attribution with original URL
  - Blacklist mechanism to exclude specific publishers on request
  - Legal review of fair use compliance before launch
- **Contingency**: Remove disputed sources immediately, document compliance efforts

### Risk 3: NLP Model Hallucinations or Errors
- **Probability**: Medium (LLMs can introduce factual errors)
- **Impact**: Medium (damages credibility)
- **Mitigation**:
  - Rule-based summarization as primary method (no LLM in V1)
  - Numerical fact verification (extract numbers, cross-check with source)
  - Human QA sampling (50 summaries per week)
- **Contingency**: Disable LLM rewriting, use extractive summaries only

### Risk 4: Email Deliverability / Sender Reputation
- **Probability**: Medium (cold start sender reputation)
- **Impact**: High (emails land in spam → no users)
- **Mitigation**:
  - SPF/DKIM/DMARC fully configured
  - Gradual send volume ramp-up (start with 10 users)
  - Monitor bounce/complaint rates closely
  - Seed beta group with engaged users (lower spam report risk)
- **Contingency**: Use transactional email fallback (SendGrid), warm up new IP

### Risk 5: Cost Overruns
- **Probability**: Low (V1 scoped for minimal infrastructure)
- **Impact**: Medium (budget constraint for solo developer)
- **Mitigation**:
  - Limit fetch frequency via `sources.ttl_min`
  - Prioritize high-value sources (drop low-quality feeds)
  - Implement DB/S3 retention policies (auto-delete old data)
  - Use SES sandbox mode (free tier)
- **Contingency**: Reduce source count, extend fetch intervals, use managed services with free tiers

---

## CI/CD & Quality Gates

### Continuous Integration (GitHub Actions)
1. **Lint & Type Check**: ESLint, Prettier, TypeScript compiler for TS; Black, mypy for Python
2. **Unit Tests**: Jest (TS), pytest (Python) with coverage thresholds (>70%)
3. **Integration Tests**: API contract tests, DB migration tests
4. **Migration Safety**: Prisma migration check (no destructive changes without approval)
5. **Security Scan**: Dependency vulnerability check (npm audit, safety)

### Continuous Deployment
1. **Staging Deployment**: Auto-deploy main branch to staging environment
2. **Production Deployment**: Manual approval after staging verification
3. **Blue-Green Strategy**: Zero-downtime deployment for BFF
4. **Feature Flags**: Gradual rollout for new features (newsletter algorithm changes)
5. **Dry-Run Mode**: Newsletter generation writes to S3 (not sent) for validation

### Definition of Done (DoD)
- ✅ All tests pass (unit + integration)
- ✅ OpenTelemetry metrics visible in Grafana
- ✅ Documentation updated (README, runbook)
- ✅ Rollback procedure tested in staging
- ✅ Constitution compliance verified

---

## Technology Stack (Minimal Set)

### TypeScript (Node.js 20+)
- **rss-parser**: RSS/Atom feed parsing
- **undici** (or node-fetch): HTTP client with retry logic
- **mjml**: Email template compilation
- **zod**: Schema validation
- **prisma**: Type-safe database ORM
- **pino**: Structured logging
- **@opentelemetry/api** + **@opentelemetry/sdk-node**: Distributed tracing

### Python 3.11+
- **feedparser**: Alternative RSS parser (if rss-parser insufficient)
- **datasketch**: SimHash/MinHash for deduplication
- **rapidfuzz**: Fuzzy string matching for entity disambiguation
- **spacy** + model (e.g., `en_core_web_sm`): NER for entities
- **boto3**: AWS SDK (SQS, SES, SSM)
- **psycopg2**: PostgreSQL driver

### Infrastructure & Operations
- **PostgreSQL 15+**: Primary datastore
- **AWS SQS**: Async task queue (NLP jobs)
- **AWS SES**: Email delivery
- **AWS SSM Parameter Store / Secrets Manager**: Secret management
- **Grafana + Prometheus**: Metrics and dashboards
- **AWS EventBridge**: Cron scheduling (7:30 AM daily)

---

## Cost & Quotas (V1 Constraints)

### AWS SES
- **Mode**: Sandbox (requires recipient whitelist)
- **Daily Send Limit**: 200 emails/day in sandbox (sufficient for 10-20 users)
- **Rate Limit**: 1 email/second
- **Bounce Events**: SNS topic + Lambda for processing (minimal cost)

### Database (PostgreSQL)
- **Instance**: RDS t3.micro or t4g.micro (free tier eligible for 1 year)
- **Storage**: 20GB SSD (articles + metadata)
- **Backups**: Automated daily snapshots (7-day retention)

### Storage (S3)
- **Use Case**: Article snapshots (7-day TTL), newsletter HTML archives
- **Cost**: ~$1/month for 10GB storage + lifecycle policies

### Fetch Rate Limiting
- **Control Mechanism**: `sources.ttl_min` field (per-source minimum interval)
- **Optimization**: ETag/Last-Modified for 304 responses (bandwidth savings)
- **Fallback**: Disable low-value sources if quota exceeded

---

## Timeline (14-Day Sprint)

### Week 1 (Days 1-7)
- **Day 1-2**: M1 (Foundation & Ingestion) → 3 RSS sources live
- **Day 3-4**: M2 (Deduplication & Clustering) → Duplicate rate < 3%
- **Day 5-6**: M3 (NLP Summarization & Entity Extraction) → Summaries rated ≥4/5
- **Day 7**: M4 Start (Ranking algorithm implementation)

### Week 2 (Days 8-14)
- **Day 8-9**: M4 Finish (Templating & Sending) → First test emails sent
- **Day 10-11**: M5 (Observability & Compliance) → Full tracing + alerts
- **Day 12-14**: M6 (Beta Launch) → 2 consecutive days of 7:30 AM sends

### Critical Path
**M1 → M2 → M4 → M6** (blocking dependencies)  
**M3 can run in parallel with M2** (NLP setup while deduplication is being validated)  
**M5 must complete before M6** (observability required for production monitoring)

---

## Exit Criteria for Plan Phase

This plan is considered complete and ready for `/speckit.tasks` generation when:

1. ✅ All milestones have clearly defined exit criteria
2. ✅ Constitution check passes for all 5 principles
3. ✅ Project structure is documented with concrete directory paths
4. ✅ Technology choices are justified and aligned with constraints
5. ✅ Risk mitigation strategies are defined for top 5 risks
6. ✅ Timeline fits within 14-day constraint with identified critical path
7. ✅ SLO/alert thresholds are measurable and reasonable
8. ✅ Cost estimates stay within $100/month budget

**Status**: ✅ READY FOR TASK GENERATION

---

## Next Steps

1. **Generate `research.md`** (Phase 0): Document technology tradeoffs, RSS parser comparison, NLP library evaluation
2. **Generate `data-model.md`** (Phase 1): Detailed PostgreSQL schema with indexes, relationships, and sample queries
3. **Generate `quickstart.md`** (Phase 1): Step-by-step setup guide (Docker Compose → local dev → AWS deploy)
4. **Generate `contracts/`** (Phase 1): SQS message schemas, API endpoint contracts (OpenAPI specs)
5. **Run `/speckit.tasks`**: Break down milestones into 0.5-1 day tasks with clear dependencies
