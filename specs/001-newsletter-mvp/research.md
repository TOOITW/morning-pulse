# Research: Technology Choices & Tradeoffs

**Feature**: Financial Newsletter MVP (MorningPulse)  
**Date**: 2025-11-09  
**Phase**: 0 (Pre-implementation Research)

## Purpose

This document captures the research and decision-making process for technology choices in the MorningPulse project. Each decision is evaluated against the project's core principles (Legal-First, Quality Over Quantity, Graceful Degradation, Idempotency, Observability-First) and constraints (14-day timeline, single developer, <$100/month budget).

---

## 1. Architecture Pattern: Monorepo vs Polyrepo

### Options Evaluated

| Pattern | Pros | Cons |
|---------|------|------|
| **Monorepo** (Selected) | Shared TypeScript types, unified CI/CD, easier refactoring | Larger repo size, complex build config |
| Polyrepo | Independent versioning, clear boundaries | Type duplication, complex cross-repo changes |

### Decision: Monorepo

**Rationale**:
- Single developer benefits from unified workspace (less context switching)
- Shared types between BFF and workers reduce errors
- Simplified deployment (single CI/CD pipeline)
- Tools like Turborepo/Nx handle build complexity well

**Alignment with Constitution**:
- **Observability**: Unified tracing across all services in one codebase
- **Idempotency**: Shared utility functions for hash generation, deduplication logic

---

## 2. BFF Language: TypeScript (Node.js) vs Python

### Options Evaluated

| Language | Pros | Cons |
|----------|------|------|
| **TypeScript/Node.js** (Selected) | Fast HTTP, MJML support, Next.js ecosystem, type safety | Less mature NLP libraries |
| Python | Excellent NLP libraries (spaCy, NLTK), data processing | Slower HTTP, async complexity |

### Decision: TypeScript for BFF, Python for NLP Workers

**Rationale**:
- **TypeScript** excels at HTTP APIs, email rendering (MJML), and async I/O (RSS fetching)
- **Python** excels at NLP (spaCy), deduplication (datasketch), data science tasks
- Hybrid approach leverages strengths of both
- SQS queue decouples services cleanly

**Alignment with Constitution**:
- **Graceful Degradation**: Python worker failure doesn't block TypeScript BFF (fallback to rule-based summarization)
- **Observability**: Both languages have mature OpenTelemetry SDKs

---

## 3. RSS Parsing: rss-parser (Node.js) vs feedparser (Python)

### Options Evaluated

| Library | Language | Pros | Cons |
|---------|----------|------|------|
| **rss-parser** (Selected) | TypeScript | Simple API, good TypeScript types, handles RSS/Atom | Less battle-tested than feedparser |
| feedparser | Python | Mature, handles edge cases well | Requires Python runtime in BFF |

### Decision: rss-parser

**Rationale**:
- Native TypeScript library fits BFF architecture
- Conditional request support (ETag/Last-Modified) well-documented
- Sufficient for 6 RSS sources in V1
- If parsing issues arise, can add Python fallback worker

**Fallback Plan**:
- If rss-parser fails for specific feeds, create Python worker with feedparser
- SQS message: `{feed_url, last_etag}` → worker fetches → returns normalized articles

**Alignment with Constitution**:
- **Graceful Degradation**: Fallback to Python worker if TypeScript parser fails
- **Legal-First**: Proper ETag/Last-Modified handling respects server resources

---

## 4. Deduplication Algorithm: SimHash vs MinHash

### Options Evaluated

| Algorithm | Pros | Cons |
|-----------|------|------|
| **SimHash** (Selected) | Fast similarity calculation (Hamming distance), good for near-duplicates | Requires tuning of shingle size |
| MinHash | Efficient for large-scale deduplication, Locality-Sensitive Hashing (LSH) | More complex implementation, overkill for <10K articles/day |

### Decision: SimHash with n=3 Shingling

**Rationale**:
- V1 scale (~1000 articles/day) doesn't require LSH complexity
- SimHash Hamming distance threshold (e.g., ≤5 bits different) maps well to similarity ≥0.85
- Python `datasketch` library provides clean implementation
- 48-hour rolling window keeps comparison set manageable

**Implementation Details**:
```python
from datasketch import MinHash

def compute_simhash(text: str, num_perm=128) -> int:
    shingles = [text[i:i+3] for i in range(len(text)-2)]
    mh = MinHash(num_perm=num_perm)
    for shingle in shingles:
        mh.update(shingle.encode('utf8'))
    return mh.hashvalues.tobytes()
```

**Alignment with Constitution**:
- **Quality Over Quantity**: Accurate deduplication prevents duplicate content
- **Idempotency**: Content hash + SimHash together ensure consistent clustering

---

## 5. NLP Summarization: Extractive vs Abstractive

### Options Evaluated

| Approach | Pros | Cons |
|----------|------|------|
| **Extractive (Rule-based)** (Primary) | No hallucinations, fast, deterministic, low cost | Less fluent, may miss nuance |
| Abstractive (LLM) | More natural language, can rephrase complex sentences | Risk of factual errors, API cost, latency |

### Decision: Extractive Primary + Optional LLM Enhancement

**Rationale**:
- **Primary**: Rule-based extractive (first paragraph + key sentences)
  - Extract sentences with financial keywords (price, earnings, revenue, etc.)
  - Truncate to 2 sentences (~50-100 words)
  - Verify numbers against source text (regex extraction + comparison)
- **Optional**: OpenAI API for rewriting (if time permits in M3)
  - Prompt: "Rewrite this as 2 concise sentences, preserving all numbers exactly"
  - Validate output against source numbers before accepting

**Fallback Hierarchy**:
1. LLM summary (if enabled and succeeds)
2. Rule-based extractive summary (always available)
3. First paragraph truncated to 2 sentences (worst case)

**Alignment with Constitution**:
- **Graceful Degradation**: Three-level fallback ensures always getting a summary
- **Quality Over Quantity**: Number verification prevents misinformation

---

## 6. Entity Extraction: spaCy NER vs Dictionary Lookup

### Options Evaluated

| Approach | Pros | Cons |
|----------|------|------|
| **Hybrid (Selected)** | High recall (dictionary) + high precision (NER) | Requires maintenance of dictionary |
| spaCy NER only | Handles unseen entities | Lower precision for stock symbols (e.g., "IT" company vs pronoun) |
| Dictionary only | Perfect precision for known symbols | Misses new IPOs, typos |

### Decision: Dictionary-First + spaCy NER + Disambiguation

**Pipeline**:
1. **Dictionary Lookup**: Match against top 200 Taiwan/US stocks (AAPL, 2330, TSLA, etc.)
2. **Regex Patterns**: Extract ticker symbols (e.g., `[A-Z]{2,5}`, `\d{4}\.TW`)
3. **spaCy NER**: Extract `ORG` entities (company names)
4. **Disambiguation Table**: Resolve conflicts (e.g., "IT" → exclude if not Information Technology context)

**Example**:
```python
# Dictionary (cached in memory)
STOCK_DICT = {"AAPL": "Apple Inc.", "2330": "台積電", ...}

# Regex for symbols
SYMBOL_REGEX = r'\b[A-Z]{1,5}\b|\b\d{4}\.TW\b'

# spaCy NER
doc = nlp(article_text)
companies = [ent.text for ent in doc.ents if ent.label_ == "ORG"]
```

**Alignment with Constitution**:
- **Quality Over Quantity**: High-precision entity extraction improves relevance scoring
- **Observability**: Track entity extraction hit rate (known symbols vs unknowns)

---

## 7. Email Delivery: AWS SES vs SendGrid vs Mailgun

### Options Evaluated

| Service | Pros | Cons |
|---------|------|------|
| **AWS SES** (Selected) | Cheap ($0.10/1000 emails), native AWS integration, sandbox for testing | Requires IP/domain warmup, complex bounce handling |
| SendGrid | Generous free tier (100 emails/day), good deliverability, easy setup | Vendor lock-in, rate limits |
| Mailgun | EU data residency, good API | More expensive ($0.80/1000 emails) |

### Decision: AWS SES

**Rationale**:
- **Cost**: $0.10/1000 emails far below budget
- **Integration**: Already using AWS (SQS, RDS, SSM) → unified billing/auth
- **Sandbox Mode**: Perfect for 10-20 beta users (no IP warmup needed initially)
- **Control**: Full access to bounce/complaint events via SNS

**Setup Requirements**:
1. Verify sender domain (e.g., `news@morningpulse.io`)
2. Configure SPF record: `"v=spf1 include:amazonses.com ~all"`
3. Set up DKIM via SES console (automatic DNS records)
4. Add DMARC record: `"v=DMARC1; p=quarantine; rua=mailto:dmarc@morningpulse.io"`
5. Create SNS topic for bounce/complaint events → Lambda handler

**Alignment with Constitution**:
- **Observability**: SNS events enable tracking delivery rates, bounces, complaints
- **Idempotency**: SES MessageId prevents accidental duplicate sends

---

## 8. Database: PostgreSQL vs MongoDB vs SQLite

### Options Evaluated

| Database | Pros | Cons |
|----------|------|------|
| **PostgreSQL** (Selected) | ACID compliance, JSON support (JSONB), full-text search, mature ORM (Prisma) | Requires managed service or self-hosting |
| MongoDB | Flexible schema, horizontal scaling | No transactions (in older versions), less mature for time-series queries |
| SQLite | Zero config, perfect for dev | Single-writer limit, not suitable for production with multiple workers |

### Decision: PostgreSQL 15+

**Rationale**:
- **Structured Data**: Articles, sources, users fit relational model well
- **JSON Support**: `JSONB` columns for `symbols[]`, `topics[]`, metadata
- **Full-Text Search**: `tsvector` for article content (future feature)
- **Prisma ORM**: Type-safe queries, automatic migrations
- **RDS Free Tier**: t3.micro eligible for 12 months free

**Schema Highlights**:
```sql
CREATE TABLE articles (
    id SERIAL PRIMARY KEY,
    source_id INT NOT NULL REFERENCES sources(id),
    guid VARCHAR(512) UNIQUE NOT NULL,
    canonical_url TEXT NOT NULL,
    content_hash CHAR(64) NOT NULL, -- SHA256 hex
    title TEXT NOT NULL,
    ts_published TIMESTAMPTZ NOT NULL,
    summary_raw TEXT,
    summary2 TEXT, -- 2-sentence summary
    symbols JSONB DEFAULT '[]', -- ["AAPL", "2330"]
    topics JSONB DEFAULT '[]', -- ["AI", "半導體"]
    cluster_id INT REFERENCES clusters(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_articles_ts_published ON articles(ts_published DESC);
CREATE INDEX idx_articles_content_hash ON articles(content_hash);
CREATE INDEX idx_articles_cluster ON articles(cluster_id);
```

**Alignment with Constitution**:
- **Idempotency**: `content_hash` enables deduplication
- **Observability**: Indexed timestamps for fast time-range queries

---

## 9. Task Queue: AWS SQS vs RabbitMQ vs Redis Queue

### Options Evaluated

| Queue | Pros | Cons |
|-------|------|------|
| **AWS SQS** (Selected) | Managed, cheap ($0.40/million requests), no ops overhead, dead-letter queues | ~1 second delivery latency, no priority queues |
| RabbitMQ | Low latency, priority queues, rich routing | Requires management (clustering, disk space) |
| Redis Queue (e.g., Bull) | Fast, Node.js native libraries | Requires Redis instance, less durable than SQS |

### Decision: AWS SQS Standard Queue

**Rationale**:
- **Managed Service**: Zero ops overhead (critical for solo developer)
- **Cost**: Far below budget (~10K messages/day = $0.004/day)
- **Durability**: Messages persisted across AZ failures
- **Dead-Letter Queue**: Failed NLP tasks automatically retry then move to DLQ for investigation

**Message Format** (JSON):
```json
{
  "task_type": "summarize",
  "article_id": 12345,
  "title": "Apple Reports Record Q4 Earnings",
  "summary_raw": "First paragraph of article...",
  "trace_id": "abc123-def456-...",
  "timestamp": "2025-11-09T07:30:00Z"
}
```

**Alignment with Constitution**:
- **Graceful Degradation**: DLQ ensures failed tasks don't block queue
- **Observability**: `trace_id` links SQS message to OTel traces

---

## 10. Observability Stack: Grafana + Prometheus vs DataDog vs New Relic

### Options Evaluated

| Stack | Pros | Cons |
|-------|------|------|
| **Grafana + Prometheus** (Selected) | Open source, full control, no per-user cost, rich visualization | Requires self-hosting or Grafana Cloud (free tier: 10K series) |
| DataDog | Easy setup, APM included, mobile app | Expensive ($15/host/month), vendor lock-in |
| New Relic | Generous free tier (100GB/month), good UX | Complex pricing, less customizable |

### Decision: Grafana Cloud (Free Tier) + OpenTelemetry

**Rationale**:
- **Cost**: Grafana Cloud free tier covers 10K metrics series (sufficient for V1)
- **Standards**: OpenTelemetry SDK ensures vendor neutrality (can switch to DataDog later)
- **Flexibility**: Custom dashboards for domain-specific metrics (deduplication rate, source health)

**Instrumentation Plan**:
1. **TypeScript (BFF)**: `@opentelemetry/sdk-node` with auto-instrumentation (Express, Prisma)
2. **Python (Workers)**: `opentelemetry-api` + manual span creation for SQS tasks
3. **Metrics Exported**: Prometheus format → Grafana Cloud
4. **Traces**: OTLP exporter → Grafana Tempo (included in free tier)

**Dashboard Panels**:
- Source health grid (active/degraded/inactive, last successful fetch)
- Article ingestion rate (articles/hour per source)
- Deduplication metrics (cluster count, duplicate rate, similarity distribution)
- NLP metrics (summarization success rate, entity extraction hit rate)
- Email metrics (delivery rate, bounce rate, open rate, CTR)
- End-to-end latency (fetch → process → send)

**Alignment with Constitution**:
- **Observability-First**: Comprehensive instrumentation across all services
- **Graceful Degradation**: Metrics expose failure modes (e.g., spike in fallback summaries)

---

## 11. Scheduling: Cron vs AWS EventBridge vs Temporal

### Options Evaluated

| Scheduler | Pros | Cons |
|-----------|------|------|
| Cron (systemd/local) | Simple, zero cost | No visibility, manual failure handling |
| **AWS EventBridge** (Selected) | Managed, timezone-aware, CloudWatch integration | Slight complexity (IAM roles) |
| Temporal | Durable workflow engine, retry logic built-in | Overkill for simple daily schedule |

### Decision: AWS EventBridge Scheduled Rule

**Rationale**:
- **Timezone Support**: Cron expression `cron(30 23 * * ? *)` UTC = 7:30 AM Taipei (UTC+8)
- **Managed**: No EC2 instance required for cron daemon
- **Observability**: CloudWatch Events logs all invocations
- **Scalability**: Can add multiple schedules (e.g., hourly fetch, daily send)

**Rule Configuration**:
```json
{
  "ScheduleExpression": "cron(30 23 * * ? *)",
  "State": "ENABLED",
  "Targets": [
    {
      "Arn": "arn:aws:lambda:region:account:function:SendNewsletter",
      "Input": "{\"dry_run\": false}"
    }
  ]
}
```

**Alignment with Constitution**:
- **Observability**: EventBridge logs + CloudWatch metrics track schedule reliability
- **Idempotency**: Lambda function checks if newsletter already sent for today (query `issues` table)

---

## 12. Deployment: Docker + ECS Fargate vs EC2 vs Lambda

### Options Evaluated

| Platform | Pros | Cons |
|----------|------|------|
| **Docker + EC2** (Selected for V1) | Full control, cost-effective (t3.micro), easy local dev | Manual scaling, ops overhead |
| ECS Fargate | Serverless containers, auto-scaling | More expensive ($0.04/vCPU-hour), overkill for low traffic |
| Lambda | Pay-per-invocation, zero idle cost | 15-minute timeout (insufficient for newsletter generation) |

### Decision: Docker + EC2 t3.micro (Spot Instance)

**Rationale**:
- **Cost**: t3.micro spot = ~$3/month (vs $10/month on-demand)
- **Flexibility**: Can run multiple containers (BFF + Python worker) on single instance
- **Dev-Prod Parity**: Same Docker Compose used locally and in production
- **Timeline**: Simpler than Fargate for solo developer (less IAM complexity)

**Future Migration Path**:
- If traffic grows beyond 1000 users → move to ECS Fargate for auto-scaling
- Lambda for email sending only (triggered by EventBridge, reads pre-rendered HTML from S3)

**Alignment with Constitution**:
- **Graceful Degradation**: Health checks + CloudWatch alarms restart unhealthy containers
- **Observability**: Docker logs → CloudWatch Logs for centralized viewing

---

## Research Summary

| Decision Area | Choice | Primary Rationale |
|---------------|--------|-------------------|
| Architecture | Monorepo | Simplified development for solo developer |
| BFF Language | TypeScript | Fast HTTP, MJML support, type safety |
| Worker Language | Python | Superior NLP libraries (spaCy, datasketch) |
| RSS Parser | rss-parser | Native TypeScript, ETag/Last-Modified support |
| Deduplication | SimHash | Sufficient for V1 scale, simpler than MinHash |
| Summarization | Extractive + Optional LLM | Graceful degradation, no hallucinations |
| Entity Extraction | Dictionary + spaCy NER | High precision + recall hybrid approach |
| Email Delivery | AWS SES | Cost-effective, AWS-native, sandbox for beta |
| Database | PostgreSQL 15+ | ACID + JSONB, Prisma ORM, RDS free tier |
| Task Queue | AWS SQS | Managed, cheap, durable, DLQ support |
| Observability | Grafana + OTel | Open source, vendor-neutral, free tier |
| Scheduling | AWS EventBridge | Managed, timezone-aware, CloudWatch integration |
| Deployment | Docker + EC2 | Cost-effective, full control, spot instances |

---

## Open Questions & Future Research

1. **LLM Provider**: If adding abstractive summarization, compare OpenAI GPT-4 vs Anthropic Claude vs open-source models (Llama 3)
2. **Email Template Testing**: Evaluate Litmus vs Email on Acid for cross-client rendering tests
3. **Load Testing**: At what article volume does SimHash become a bottleneck? (Likely >10K articles)
4. **Cache Layer**: Would Redis cache for ranked articles reduce DB load? (Defer to V2 if P95 latency exceeds 10min)

---

**Next Steps**: Proceed to Phase 1 (Design) → Generate `data-model.md`, `quickstart.md`, `contracts/`
