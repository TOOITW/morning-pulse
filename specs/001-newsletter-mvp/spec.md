# Feature Specification: Financial Newsletter MVP (MorningPulse)

**Feature Branch**: `001-newsletter-mvp`  
**Created**: 2025-11-09  
**Status**: Draft  
**Input**: User description: "財經新聞電子報 MVP - 每天07:30準時寄出去重、可信、可操作的財經電子報,支援台灣與國際市場,依使用者自選標的與主題客製化"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Daily Newsletter Delivery (Priority: P1)

As a busy investor, I want to receive a curated financial newsletter every morning at 7:30 AM (Taipei time) so that I can quickly review important market news before the trading day begins.

**Why this priority**: Core value proposition - delivering timely, deduplicated, and credible financial news is the foundation of the entire product.

**Independent Test**: Can be fully tested by subscribing with an email address, waiting for next day's 7:30 AM delivery, and verifying receipt of a properly formatted newsletter with deduplicated articles.

**Acceptance Scenarios**:

1. **Given** a user has subscribed with a valid email address, **When** 7:30 AM Taipei time arrives, **Then** the user receives a newsletter within 5 minutes
2. **Given** the newsletter generation completes successfully, **When** the email is sent, **Then** it includes proper SPF/DKIM/DMARC headers and List-Unsubscribe functionality
3. **Given** multiple articles about the same story exist, **When** the newsletter is generated, **Then** only one representative article per story cluster appears in the newsletter
4. **Given** the system encounters a temporary failure, **When** the scheduled send time is missed, **Then** the system retries with exponential backoff and alerts administrators

---

### User Story 2 - Personalized Content Ranking (Priority: P2)

As an investor focused on specific markets and stocks, I want to customize my watchlist (stocks, topics, regions) so that the most relevant news appears at the top of my newsletter.

**Why this priority**: Differentiation from generic newsletters - personalization increases engagement and perceived value.

**Independent Test**: Can be tested by configuring a watchlist with specific symbols (e.g., TSMC 2330, AAPL), receiving the next newsletter, and verifying that articles mentioning watchlist items are prioritized over generic news.

**Acceptance Scenarios**:

1. **Given** a user adds AAPL and 2330 to their watchlist, **When** the newsletter is generated, **Then** articles mentioning these symbols rank higher than articles without watchlist matches
2. **Given** a user subscribes to topics like #半導體 and #AI, **When** relevant articles are available, **Then** these topic-tagged articles appear prominently in the "Your Watchlist" section
3. **Given** a user's watchlist includes both Taiwan (TWSE/TPEx) and US (NYSE/NASDAQ) symbols, **When** the newsletter is generated, **Then** the "Market Overview" section includes relevant market summaries for both regions

---

### User Story 3 - Article Summary Quality (Priority: P2)

As a time-constrained reader, I want each article to have a concise 2-sentence summary so that I can quickly scan headlines and decide which articles deserve deeper reading via the source link.

**Why this priority**: Time-saving is a key value proposition - summaries enable rapid information triage.

**Independent Test**: Can be tested by reviewing a generated newsletter, reading each article's 2-sentence summary, and verifying that key facts (numbers, entities, events) are accurately preserved without editorial interpretation.

**Acceptance Scenarios**:

1. **Given** an article contains financial data (stock prices, earnings figures), **When** the summary is generated, **Then** critical numbers appear accurately in the summary text
2. **Given** NLP summarization fails for an article, **When** the fallback mechanism activates, **Then** the first paragraph is extracted as the summary
3. **Given** a summary is generated in Chinese, **When** the original article is in English, **Then** the summary preserves key financial terms and entity names without mistranslation
4. **Given** a summary is evaluated by human reviewers, **When** scored on a 5-point scale, **Then** the average score is ≥4.0

---

### User Story 4 - Source Credibility and Transparency (Priority: P1)

As a cautious investor, I want to see the original source for each article and understand its credibility so that I can make informed decisions about which information to trust.

**Why this priority**: Trust is foundational - without credible sources and transparency, the newsletter has no value.

**Independent Test**: Can be tested by reviewing the newsletter's article cards, clicking source links, and verifying that (1) links lead to original publishers, (2) source names are clearly displayed, and (3) low-credibility sources (trust score < 0.4) are filtered out.

**Acceptance Scenarios**:

1. **Given** an article is included in the newsletter, **When** the user clicks the source link, **Then** they are directed to the original article on the publisher's website
2. **Given** a news source has a trust score below 0.4, **When** the ranking algorithm runs, **Then** articles from that source are excluded from the top 8 articles
3. **Given** an article appears in the newsletter, **When** viewed in the article card, **Then** the source name (e.g., "Reuters", "經濟日報") is prominently displayed

---

### User Story 5 - Subscription Management (Priority: P3)

As a user, I want to easily unsubscribe or adjust my preferences so that I maintain control over my inbox.

**Why this priority**: Regulatory compliance (CAN-SPAM, GDPR-like standards) and user trust - essential but not core to MVP value delivery.

**Independent Test**: Can be tested by clicking the unsubscribe link in a newsletter, confirming unsubscription, and verifying that no further newsletters are sent to that email address.

**Acceptance Scenarios**:

1. **Given** a user clicks the "Unsubscribe" link in the newsletter footer, **When** they confirm on the landing page, **Then** their email is marked as unsubscribed and no further emails are sent
2. **Given** a hard bounce is received (invalid email address), **When** the bounce notification is processed, **Then** the email address is immediately marked as inactive
3. **Given** a soft bounce occurs three times, **When** the third bounce is recorded, **Then** the email address is automatically unsubscribed

---

### Edge Cases

- **What happens when all configured data sources fail?** The system sends an alert to administrators and attempts to generate a newsletter from cached articles (up to 24 hours old) with a disclaimer noting the data freshness issue.
- **What happens when a single source dominates the feed (>50% of articles)?** The ranking algorithm applies a per-source cap, ensuring no single source contributes more than 3 articles to the top 8.
- **What happens when duplicate articles have different publication timestamps?** The system uses the earliest `ts_published` value as the canonical timestamp for ranking purposes.
- **What happens when an article URL returns 404 or paywall after initial fetch?** The article remains in the database with a flag, but source links are tested before inclusion in the newsletter; broken links are excluded.
- **What happens when a user's watchlist contains 50+ symbols?** The system prioritizes the top 20 symbols by user-defined order or recent market activity.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch articles from at least 6 data sources: ≥3 RSS feeds, ≥2 official/open APIs, ≥1 lightweight web scraper
- **FR-002**: System MUST respect source-defined refresh intervals (ttl_min) and use conditional requests (ETag/Last-Modified) to minimize bandwidth
- **FR-003**: System MUST implement exponential backoff (max 30 minutes) for HTTP 429/5xx errors and mark sources as degraded after 5 consecutive failures
- **FR-004**: System MUST normalize article URLs by removing tracking parameters, following 301/302 redirects, and respecting `<link rel="canonical">` tags
- **FR-005**: System MUST deduplicate articles using Shingling (n=3) and SimHash with a similarity threshold of ≥0.85 within a 48-hour window
- **FR-006**: System MUST select representative articles from clusters based on content length and source trust score
- **FR-007**: System MUST generate 2-sentence summaries using keyword extraction, optionally enhanced by LLM rewriting, with numerical fact verification against source text
- **FR-008**: System MUST fallback to first paragraph extraction when NLP summarization fails
- **FR-009**: System MUST extract entities (company names, stock symbols, industries, countries) and map them to standardized identifiers (e.g., AAPL, 2330, 半導體, US/TW)
- **FR-010**: System MUST rank articles using the formula: score = 0.35×Recency + 0.25×SourceTrust + 0.25×Relevance + 0.15×Heat
- **FR-011**: System MUST filter out articles from sources with trust score < 0.4
- **FR-012**: System MUST limit each source to contributing at most 3 articles to the top 8
- **FR-013**: System MUST send newsletters at 7:30 AM Taipei time daily via email with SPF/DKIM/DMARC authentication
- **FR-014**: System MUST include List-Unsubscribe headers in all outbound emails
- **FR-015**: System MUST handle hard bounces by immediately unsubscribing the email address
- **FR-016**: System MUST handle soft bounces by unsubscribing after 3 occurrences
- **FR-017**: System MUST emit telemetry events (ingest, normalize, dedupe, nlp, rank, build, send) with trace IDs for observability
- **FR-018**: System MUST track metrics: fetch duration, error rates, similarity distributions, summarization failure rates, open/click rates, end-to-end latency
- **FR-019**: System MUST store articles with fields: title, url, guid, source, ts_published (UTC), lang, summary_raw, categories, canonical_url, content_hash
- **FR-020**: System MUST store user preferences: email, watchlist_symbols, topics, locale, unsubscribed_at
- **FR-021**: System MUST retain article snapshots for 7 days and audit logs for 90 days for compliance and debugging

### Key Entities

- **Source**: Represents a data feed (RSS, API, or scraper) with attributes: id, name, type, url, trust_score (0..1), ttl_min, status (active/degraded/inactive)
- **Article**: Represents a news article with attributes: id, source_id, guid, url, canonical_url, title, ts_published, lang, summary_raw, content_hash, symbols (array), topics (array), cluster_id
- **Cluster**: Represents a group of similar articles with attributes: id, article_ids (array), rep_article_id (representative article), sim_avg (average similarity), sim_max (max similarity), lang_variants (array of language codes)
- **User**: Represents a subscriber with attributes: id, email, watchlist_symbols (array), topics (array), locale, unsubscribed_at (nullable timestamp)
- **Issue**: Represents a sent newsletter with attributes: id, date, html (rendered content), sent_count, open_rate, click_rate, build_trace_id

### Data Sources (V1 Scope)

**Taiwan Sources**:
- TWSE/TPEx announcements (official APIs)
- MOPS (Market Observation Post System) public filings (RSS/API)
- Central Bank of Taiwan / DGBAS economic data (official pages with structured data)
- 經濟日報 (Economic Daily News) RSS
- 工商時報 (Commercial Times) RSS

**Global Sources**:
- Reuters RSS
- CNBC RSS
- Yahoo Finance RSS
- MarketWatch RSS
- US Bureau of Labor Statistics (BLS) official data
- US Bureau of Economic Analysis (BEA) official data
- Federal Reserve economic releases (official pages)

**Principles**: Prioritize RSS/API sources. Use lightweight web scraping only when necessary for high-value sources without feeds.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users receive their newsletter within 5 minutes of 7:30 AM Taipei time on ≥99% of weekdays
- **SC-002**: Newsletter delivery success rate is ≥98% (successfully delivered / total attempted sends)
- **SC-003**: Bounce rate is <0.3% of total emails sent
- **SC-004**: Manual sampling of 100 articles shows duplicate rate <3%
- **SC-005**: Human reviewers rate article summaries ≥4.0 out of 5.0 on average
- **SC-006**: Key financial figures (prices, percentages, dates) in summaries have <10% error/omission rate when compared to source articles
- **SC-007**: Entity extraction achieves ≥90% hit rate for the top 200 Taiwan and US stocks
- **SC-008**: Entity extraction misidentification rate is <5%
- **SC-009**: First-screen articles (top 8) achieve ≥20% higher click-through rate (CTR) compared to chronological sorting baseline (measured during beta testing)
- **SC-010**: System fetches ≥50 new articles per hour across all sources
- **SC-011**: 95th percentile end-to-end latency (fetch → send) is <5 minutes
- **SC-012**: Source health dashboard is accessible and shows real-time status for all configured sources
- **SC-013**: Users successfully complete unsubscribe flow in <30 seconds

### Assumptions

- **Email delivery infrastructure**: Cloud-based email service is available and configured with sufficient sending quota for V1 user base (estimated <1000 subscribers in beta)
- **NLP model availability**: Modern NLP models or APIs are accessible for summarization; fallback to rule-based extraction is acceptable
- **Market hours**: Newsletter is primarily targeted at users interested in APAC/US market hours; 7:30 AM Taipei time precedes Taiwan market open (9:00 AM) and follows US market close (previous day)
- **Language support**: Primary language is Traditional Chinese; English summaries are supplementary (bilingual support is nice-to-have, not mandatory for MVP)
- **User base**: Initial rollout is to <1000 beta users; scalability beyond 10,000 users is not a V1 requirement
- **Content licensing**: Short excerpts (2 sentences) + source links comply with fair use and do not require licensing agreements with publishers
- **Infrastructure cost**: V1 operates within modest infrastructure budget (approx. $50-100/month)

## Non-Functional Requirements *(mandatory)*

### Performance

- **NFR-001**: Newsletter generation pipeline completes within 5 minutes for up to 100 active sources
- **NFR-002**: Article deduplication processing handles 1000 articles in <30 seconds
- **NFR-003**: Email rendering and send queue processing handles 1000 recipients in <2 minutes

### Reliability

- **NFR-004**: System achieves ≥99% on-time newsletter delivery during weekdays
- **NFR-005**: Individual source failures do not block newsletter generation (graceful degradation)
- **NFR-006**: System recovers automatically from transient failures (network errors, API rate limits)

### Scalability

- **NFR-007**: System supports up to 1000 concurrent subscribers in V1 without performance degradation
- **NFR-008**: Database schema supports growth to 10,000 subscribers and 100,000 articles without major refactoring

### Security & Privacy

- **NFR-009**: User emails and preferences are encrypted at rest
- **NFR-010**: User data deletion requests are fulfilled within 7 days
- **NFR-011**: Article snapshots are retained for 7 days only; audit logs are retained for 90 days
- **NFR-012**: System does not store or log sensitive user browsing behavior beyond open/click metrics

### Compliance

- **NFR-013**: Newsletter includes List-Unsubscribe header compliant with RFC 8058
- **NFR-014**: System respects robots.txt directives for all crawled sources
- **NFR-015**: System does not bypass paywalls or authentication mechanisms
- **NFR-016**: Short excerpts (≤2 sentences) plus source attribution comply with fair use principles

### Observability

- **NFR-017**: All pipeline stages emit structured logs with trace IDs for distributed tracing
- **NFR-018**: Metrics dashboard provides real-time visibility into source health, processing times, and delivery rates
- **NFR-019**: Alerting is configured for: source failures (>3 consecutive errors), processing delays (>10 minutes), delivery failures (>5% bounce rate)

## Out of Scope (V1)

The following features are explicitly excluded from the MVP:

- Real-time push notifications (daily batch delivery only)
- Quantitative trading recommendations or target prices
- Sentiment analysis and multi-market quantitative backtesting
- Full-text article copying or archival
- Social media sentiment tracking (Twitter, Reddit, etc.)
- Mobile native app (web-based email delivery is sufficient)
- Multi-language newsletters beyond Traditional Chinese + English
- Historical newsletter archive UI (users receive emails only)
- Advanced personalization (ML-based recommendation beyond rule-based ranking)

## Technical Assumptions & Suggested Dependencies

The following technical choices are suggested based on the project requirements. These represent reasonable defaults but can be substituted with equivalent technologies:

- **Email delivery**: Cloud email service with API support (e.g., AWS SES, SendGrid, Mailgun)
- **Data storage**: Relational database supporting JSON fields and full-text search (e.g., PostgreSQL, MySQL 8+)
- **Task queue**: Message broker for async processing (e.g., Redis + Celery, RabbitMQ, AWS SQS)
- **Observability**: Distributed tracing and metrics stack (e.g., OpenTelemetry + Prometheus + Grafana, DataDog, New Relic)
- **RSS parsing**: Standard RSS/Atom feed parser library for chosen language
- **Web scraping**: Headless browser automation tool for JavaScript-heavy sites (e.g., Playwright, Puppeteer, Selenium)
- **NLP summarization**: Pre-trained models or API service (e.g., Hugging Face Transformers, OpenAI API, Anthropic Claude) with extractive fallback

## Risks

- **Content licensing**: Short excerpts may face legal challenges from publishers; mitigation: include prominent attribution and source links
- **API rate limits**: Third-party APIs (Yahoo Finance, etc.) may impose strict rate limits; mitigation: implement caching and respect TTL values
- **Email deliverability**: ISPs may flag newsletters as spam; mitigation: proper authentication (SPF/DKIM/DMARC), gradual sender reputation building
- **Summarization accuracy**: NLP models may generate misleading summaries; mitigation: numerical fact verification + fallback to extractive summarization
- **Source reliability**: Data sources may become unavailable or change formats; mitigation: multi-source strategy + graceful degradation

