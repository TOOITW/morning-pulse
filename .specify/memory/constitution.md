<!--
Sync Impact Report:
- Version: 0.0.0 → 1.0.0
- Initial constitution creation for Morning Pulse project
- Principles established: 5 core principles aligned with project vision
- Added sections: Development Standards, Non-Goals
- Templates: ✅ Validated against plan-template.md, spec-template.md, tasks-template.md
- No deferred TODOs
-->

# Morning Pulse Constitution

## Core Principles

### I. Legal-First Data Collection

**Rule**: All data collection MUST use legal, structured sources (RSS/API) with proper attribution.

- RSS feeds and public APIs are the PRIMARY data sources
- robots.txt MUST be respected for all web scraping
- Only short excerpts (2-sentence summaries) with source links are allowed
- Full article copying is PROHIBITED
- Paywall circumvention is PROHIBITED

**Rationale**: Ensures long-term sustainability, respects content creators' rights, and avoids legal risks that could shut down the service.

### II. Quality Over Quantity

**Rule**: Content ranking MUST prioritize credibility, freshness, and relevance over volume.

- Source credibility scoring is MANDATORY
- Deduplication and clustering MUST occur before delivery
- Articles are ranked by: credibility score + freshness + user relevance
- Two-sentence summaries MUST be generated for each article cluster
- Representative articles are selected from clusters; duplicates are discarded

**Rationale**: Users value curated, trustworthy information over overwhelming volume. Quality filtering is the core value proposition.

### III. Graceful Degradation (NON-NEGOTIABLE)

**Rule**: System MUST continue operating with reduced functionality when components fail.

- NLP summarization failure → fallback to first paragraph extraction
- Source unavailable → use backup/alternative sources
- API rate limits → queue and retry with backoff
- Database issues → graceful error reporting, no silent failures
- Each component MUST define its failure mode and fallback strategy

**Rationale**: Reliability is critical for a daily automated service. Users depend on receiving their newsletter even if some features are impaired.

### IV. Idempotency & Deduplication

**Rule**: All operations MUST be idempotent; duplicate content MUST be prevented.

- Articles are deduplicated by GUID/URL hash
- Newsletter delivery is idempotent (no duplicate emails for same content)
- Pipeline reruns produce consistent results
- State changes are atomic and traceable
- Database operations use upsert patterns where appropriate

**Rationale**: Prevents user annoyance from duplicate emails and ensures system predictability during failures and retries.

### V. Observability-First Architecture

**Rule**: Every pipeline stage MUST emit telemetry for monitoring and debugging.

- OpenTelemetry instrumentation is MANDATORY for all services
- Metrics required: processing time, success/failure rates, source health
- Distributed tracing across all pipeline stages
- Grafana dashboard provides single-pane visibility
- Log levels: ERROR for failures, INFO for key events, DEBUG for troubleshooting
- Quality metrics: deduplication rate, summarization accuracy, delivery success rate

**Rationale**: Enables rapid debugging, performance optimization, and quality assessment. Essential for maintaining service reliability.

## Development Standards

### Personalization Engine

- Watchlist entities (stocks, crypto, topics) are user-configurable
- Ranking algorithm weights: relevance to watchlist > credibility > freshness
- Support for Taiwan market (TWSE/TPEx) and international markets (NYSE, NASDAQ, etc.)
- Topic tags (e.g., #半導體, #AI, #能源) enhance content filtering

### Technology Constraints

- Python 3.11+ for backend services
- RSS parsing: feedparser library
- NLP summarization: Hugging Face Transformers or OpenAI API (with fallback)
- Storage: PostgreSQL for article metadata and user preferences
- Queue: Redis or RabbitMQ for async processing
- Monitoring: OpenTelemetry + Prometheus + Grafana stack

### Performance Targets

- Newsletter generation: < 5 minutes for up to 100 sources
- API response time: < 200ms p95 for watchlist queries
- Deduplication accuracy: > 95% for same-story articles
- System uptime: > 99.5% (allowing for brief maintenance windows)

## Non-Goals (V1 Scope)

The following features are explicitly OUT OF SCOPE for the initial version:

- Real-time push notifications (daily batch delivery only)
- Quantitative trading recommendations
- Sentiment analysis and multi-market backtesting
- Full-text article copying
- Social media sentiment tracking
- Mobile app (web-based email delivery)

**Rationale**: Focus on core value (curated daily digest) before expanding scope. These features require significant additional complexity and legal considerations.

## Governance

### Amendment Process

1. Proposed changes MUST be documented with rationale
2. Impact assessment on existing features is REQUIRED
3. Version bump follows semantic versioning:
   - MAJOR: Breaking changes to core principles
   - MINOR: New principles or significant expansions
   - PATCH: Clarifications or minor refinements
4. All amendments require migration plan for affected code

### Compliance

- All feature specifications MUST reference relevant constitution principles
- Code reviews MUST verify constitutional compliance
- Complexity that violates principles requires explicit justification
- Constitution supersedes all other development practices

### Version Control

**Version**: 1.0.0 | **Ratified**: 2025-11-08 | **Last Amended**: 2025-11-08
