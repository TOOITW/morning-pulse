# MorningPulse 專案架構分析報告

**分析日期**: 2024-11-14
**分析者**: Claude (Anthropic)
**專案版本**: 0.1.0 (MVP)

---

## 📋 執行摘要

MorningPulse 是一個**零成本**的自動化財經新聞電子報系統，採用 Monorepo 架構，核心價值在於：

1. **智能去重**: 使用 MinHash + SimHash 演算法自動聚類相似新聞
2. **自動化排程**: 每日 7:30 AM 自動發送精選新聞，整點 RSS 擷取
3. **完全免費**: 使用本地 PostgreSQL + 免費 SMTP，月成本 $0
4. **可觀測性**: 內建健康監控、去重率追蹤、摘要覆蓋度指標

---

## 🏗️ 專案架構概覽

### 1. Monorepo 結構

```
morning-pulse/
├── apps/
│   └── web/                    # Next.js 16 主應用
│       ├── src/
│       │   ├── lib/           # 核心業務邏輯
│       │   │   ├── ingest/    # RSS 擷取
│       │   │   ├── queue/     # 工作佇列
│       │   │   ├── ranking/   # 文章排序
│       │   │   ├── email/     # MJML 渲染與發送
│       │   │   ├── scheduler/ # Cron 排程
│       │   │   └── services/  # Builder, Sender 等服務
│       │   └── app/           # Next.js App Router
│       └── prisma/
│           └── schema.prisma  # 資料庫結構
│
├── services/
│   └── nlp-py/                # Python NLP 服務
│       ├── src/
│       │   ├── deduplicator/  # MinHash + SimHash 去重
│       │   └── summarizer/    # spaCy 摘要生成
│       └── scripts/           # Worker 腳本
│
├── scripts/
│   ├── etl/                   # 資料初始化腳本
│   │   ├── seed-sources.ts    # RSS 來源種子資料
│   │   └── fetch-articles.ts  # 手動擷取文章
│   └── ops/                   # 維運工具
│       └── metrics-logger.ts  # 指標監控
│
└── docs/
    ├── ARCHITECTURE.md         # 架構文件
    └── diagrams/              # Mermaid 流程圖
```

### 2. 技術堆疊

| 分類 | 技術 | 版本 | 用途 |
|------|------|------|------|
| **Web Framework** | Next.js | 16.0.1 | BFF + API + 排程主控 |
| **Frontend** | React | 19.2.0 | UI 介面 |
| **資料庫** | PostgreSQL | - | 本地 Docker 容器 |
| **ORM** | Prisma | 6.0.0 | 型別安全資料存取 |
| **NLP** | Python | 3.11 | 去重與摘要處理 |
| **去重演算法** | datasketch | 1.6.0 | MinHash + LSH |
| **NLP 引擎** | spaCy | 3.7.0 | 規則式句子萃取 |
| **Email 模板** | MJML | 4.15.0 | 響應式 Email HTML |
| **Email 發送** | Nodemailer | 6.9.0 | SMTP/Resend 整合 |
| **排程** | node-cron | 3.0.3 | 定時任務管理 |
| **日誌** | Winston | 3.11.0 | 結構化日誌 |
| **Monorepo** | Turbo | 2.0.0 | 建構與開發工具 |

---

## 🔄 核心資料流程

### 階段 1: RSS 擷取 (每小時)

```
Scheduler (Cron: 0 * * * *)
    ↓
RSS Adapter (rss-parser)
    ├── 讀取 Source 清單
    ├── 檢查 ETag/Last-Modified (避免重複抓取)
    ├── 解析 RSS Feed
    └── 正規化資料
        ↓
儲存到 Article 表
    ├── guid: 原始 ID
    ├── canonicalUrl: 正規化 URL
    ├── contentHash: SHA256 (防重複)
    ├── tsPublished: 發布時間
    └── 建立 dedupe Job
```

**關鍵設計**:
- **ETag/Last-Modified 快取**: 減少不必要的網路請求
- **正規化 URL**: 移除追蹤參數 (utm_*, fbclid 等)
- **Content Hash**: SHA256 雜湊，DB 層級唯一約束

### 階段 2: 去重聚類 (Python Worker)

```
Job Queue 撿取 type="dedupe"
    ↓
NLP Worker (Python)
    ├── 內容正規化
    │   ├── 移除 HTML 標籤
    │   ├── 轉小寫
    │   └── 壓縮空白字元
    │
    ├── MinHash + LSH
    │   ├── 生成 MinHash 簽名
    │   ├── LSH 找候選相似文章
    │   └── Jaccard 相似度 > 0.7 視為候選
    │
    └── SimHash 精確比對
        ├── 生成 64-bit 指紋
        ├── 計算漢明距離
        └── 距離 ≤ 3 合併到同 Cluster
            ↓
更新 Article.clusterId
建立或更新 Cluster
```

**演算法選擇理由**:
- **MinHash + LSH**: O(1) 平均查找時間，可擴展到數百萬文章
- **SimHash**: 比特位元比對快速，漢明距離直觀
- **雙層策略**: LSH 粗篩 + SimHash 精確，平衡速度與準確度

### 階段 3: 摘要生成 (Python Worker)

```
Job Queue 撿取 type="summarize"
    ↓
Summarizer (spaCy)
    ├── 句子分割 (spaCy Sentencizer)
    ├── 候選句篩選
    │   ├── 長度 > 20 字元
    │   ├── 包含標點符號
    │   └── 非 URL/Code
    │
    ├── TF 計分 + 位置加權
    │   ├── 首段句子 +0.2
    │   └── 選取 Top 2 句
    │
    └── 數字一致性驗證
        ├── 抽取數字與百分比
        ├── 檢查是否在原文出現
        └── 不一致 → Fallback 截斷首段
            ↓
更新 Article.summary2
```

**關鍵機制**:
- **數字驗證**: 防止摘要產生錯誤數值 (金融新聞關鍵)
- **Fallback 機制**: 品質優先，寧可截斷也不產生不準確摘要

### 階段 4: 排序與篩選 (TypeScript)

```
Ranking Service
    ├── 查詢符合條件文章
    │   ├── tsPublished >= 昨日 00:00
    │   ├── summary2 IS NOT NULL
    │   └── source.status = "active"
    │
    ├── 計分 (Score = Σ 加權因子)
    │   ├── 時間新鮮度: e^(-λt) (指數衰減)
    │   ├── 來源信任度: source.trustScore (0.0-1.0)
    │   ├── Cluster 代表性: 文章數量加成
    │   └── 內容長度合理性: 懲罰過短/過長
    │
    └── 多樣性篩選
        ├── 每 Cluster 僅取 1 篇 (最高分)
        ├── 限制單一來源 ≤ 30%
        └── 輸出 Top 10-15 篇
```

**排序策略**:
```typescript
// 計分公式示例
score = 
  0.4 * timeFreshness     // 40% 權重給新鮮度
  + 0.3 * trustScore      // 30% 給來源可信度
  + 0.2 * clusterRep      // 20% 給代表性
  + 0.1 * lengthQuality   // 10% 給內容品質
```

### 階段 5: 電子報組裝 (每日 7:30)

```
Newsletter Builder
    ├── 呼叫 Ranking Service 取 Top N
    ├── 建立 Issue 紀錄
    │   ├── issueDate: YYYY-MM-DD
    │   ├── subject: "財經晨報 - {date}"
    │   ├── articleIds: [JSON Array]
    │   └── htmlContent: NULL (稍後渲染)
    │
    └── 建立 IssueDelivery 紀錄
        ├── 查詢 active users
        └── 為每位 user 建立 delivery row
            ↓
建立 render + send Jobs
```

### 階段 6: 渲染與發送

```
MJML Renderer
    ├── 載入 Issue + Articles
    ├── 套用 MJML Template
    │   ├── Header: Logo + 日期
    │   ├── Body: 文章列表
    │   │   ├── 標題 (可點擊)
    │   │   ├── 摘要 (summary2)
    │   │   ├── 來源 + 時間
    │   │   └── 閱讀更多按鈕
    │   └── Footer: 取消訂閱連結
    │
    └── 轉換 MJML → HTML
        ↓
Email Sender (Nodemailer)
    ├── SMTP 認證 (Gmail/其他)
    ├── 批次發送 (避免速率限制)
    │   ├── 每批 10 封
    │   └── 間隔 1 秒
    │
    └── 更新 IssueDelivery
        ├── status = "sent"
        ├── sentAt = now()
        └── 錯誤處理 → status = "failed"
```

---

## 💾 資料庫設計

### 核心表結構

#### 1. sources - RSS 來源管理
```prisma
- id: 唯一識別碼
- name: 來源名稱 (e.g., "Reuters", "CNBC")
- type: "rss" | "api" | "scraper"
- url: Feed URL
- trustScore: 0.0-1.0 (手動維護)
- status: "active" | "degraded" | "inactive"
- consecutiveFailures: 連續失敗次數
- lastFetchAt: 最近擷取時間
- lastSuccessAt: 最近成功時間
```

**健康判斷邏輯**:
```typescript
if (consecutiveFailures >= 3) {
  status = "degraded"
}
if (consecutiveFailures >= 5) {
  status = "inactive"
}
if (now - lastSuccessAt > 24小時) {
  // 發出告警
}
```

#### 2. articles - 文章內容
```prisma
- id: CUID
- sourceId: 外鍵 → sources
- guid: RSS 原始 ID
- canonicalUrl: 正規化後 URL
- contentHash: SHA256 (唯一約束)
- title: 標題
- summaryRaw: RSS description
- summary2: 生成的 2 句摘要
- tsPublished: 發布時間戳
- clusterId: 外鍵 → clusters (可為 NULL)
- simhash: 64-bit 指紋 (字串存儲)
```

**索引策略**:
```sql
CREATE INDEX idx_ts_published ON articles(ts_published);
CREATE INDEX idx_cluster_id ON articles(cluster_id);
CREATE INDEX idx_source_id ON articles(source_id);
CREATE UNIQUE INDEX idx_content_hash ON articles(content_hash);
```

#### 3. clusters - 相似文章群組
```prisma
- id: CUID
- repArticleId: 代表文章 ID (最高分)
- simAvg: 群組內平均相似度
- simMax: 群組內最大相似度
```

**代表文章選擇邏輯**:
```typescript
選擇條件 (優先級):
1. source.trustScore 最高
2. 內容長度最長
3. 最早發布
```

#### 4. issues - 電子報期刊
```prisma
- id: CUID
- issueDate: DATE (唯一，e.g., 2024-11-14)
- subject: Email 主旨
- articleIds: JSON Array [id1, id2, ...]
- htmlContent: 渲染後 HTML (TEXT)
- totalSent: 發送總數
- totalOpened: 開信數 (未來功能)
- sentAt: 發送完成時間
```

#### 5. issue_deliveries - 個人發送追蹤
```prisma
- id: CUID
- issueId: 外鍵 → issues
- userId: 外鍵 → users
- status: "pending" | "sent" | "bounced" | "failed"
- sentAt: 實際發送時間
- openedAt: 開信時間 (需要追蹤像素)
- errorMessage: 失敗原因
```

#### 6. jobs - 工作佇列
```prisma
- id: CUID
- type: "dedupe" | "summarize" | "ner" | "send_newsletter"
- status: "pending" | "processing" | "completed" | "failed"
- payload: JSON (任務參數)
- result: JSON (執行結果)
- attempts: 已重試次數
- maxAttempts: 最大重試次數 (預設 3)
- scheduledFor: 預計執行時間
- startedAt: 實際開始時間
- completedAt: 完成時間
```

**Job Queue 處理邏輯**:
```typescript
// 撿取待執行任務
SELECT * FROM jobs 
WHERE status = 'pending' 
  AND scheduled_for <= NOW()
  AND attempts < max_attempts
ORDER BY scheduled_for ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

// 樂觀鎖避免重複處理
UPDATE jobs 
SET status = 'processing', 
    started_at = NOW()
WHERE id = ? AND status = 'pending';
```

---

## 📊 效能與可擴展性

### 當前效能指標 (MVP)

| 指標 | 當前值 | 目標值 | 備註 |
|------|--------|--------|------|
| RSS 來源數量 | ~10-20 | 50+ | 手動維護清單 |
| 每日文章量 | ~200-500 | 2000+ | 取決於來源活躍度 |
| 去重準確率 | ~85-90% | 95%+ | MinHash 閾值可調 |
| 摘要覆蓋率 | ~70-80% | 90%+ | 依賴原文品質 |
| Email 發送時間 | ~5-10 分鐘 | <5 分鐘 | 批次發送優化 |
| 資料庫大小 (月) | ~100 MB | <1 GB | 定期清理舊資料 |

### 瓶頸分析

#### 1. RSS 擷取速度
**問題**: 序列擷取 20 個來源需 30-60 秒
**解決方案**:
```typescript
// 改用並行擷取
await Promise.allSettled(
  sources.map(source => fetchRSS(source))
);
```

#### 2. Python Worker 冷啟動
**問題**: spaCy 模型載入需 2-3 秒
**解決方案**:
```python
# 使用常駐 Worker + Job Queue
# 或改用輕量級模型 (en_core_web_sm)
```

#### 3. 資料庫查詢效能
**問題**: 排序時需掃描大量文章
**解決方案**:
```sql
-- 增加複合索引
CREATE INDEX idx_ranking 
ON articles(ts_published, cluster_id, source_id) 
WHERE summary2 IS NOT NULL;
```

### 水平擴展計畫

```
階段 1: Monolith (當前)
- Next.js + PostgreSQL + Python Workers
- 單機部署，適用 <1000 用戶

階段 2: 分散式 Queue
- 改用 Redis + BullMQ
- Python Workers 可獨立擴展
- 適用 1000-10000 用戶

階段 3: 微服務拆分
- Ingest Service (獨立 API)
- NLP Service (gRPC)
- Email Service (SQS + Lambda)
- 適用 10000+ 用戶
```

---

## 🔐 安全性設計

### 1. 認證與授權 (未來功能)
```typescript
// 當前: 無認證 (內部工具)
// 計畫: JWT + NextAuth.js

middleware.ts:
- 檢查 session token
- Role-based access control
- API rate limiting
```

### 2. Email 安全
```typescript
// SMTP 設定
{
  secure: true,        // TLS
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS  // 從 .env 讀取
  }
}

// 取消訂閱 Token
const unsubToken = crypto
  .createHmac('sha256', SECRET_KEY)
  .update(userId + email)
  .digest('hex');
```

### 3. XSS 防護
```typescript
// MJML 模板自動 HTML escape
<mj-text>
  {sanitize(article.title)}
</mj-text>

// 外部連結加 rel="noopener"
<a href="${url}" rel="noopener noreferrer">
```

### 4. SQL Injection 防護
```typescript
// Prisma 自動參數化查詢
await prisma.article.findMany({
  where: {
    tsPublished: {
      gte: new Date(yesterday)
    }
  }
});
// 生成: SELECT * FROM articles WHERE ts_published >= $1
```

---

## 🧪 測試策略

### 單元測試覆蓋

```typescript
// Ingest Service
describe('RSS Adapter', () => {
  it('should normalize URLs correctly')
  it('should handle malformed RSS gracefully')
  it('should dedupe by content hash')
})

// Ranking Service
describe('Article Scorer', () => {
  it('should apply time decay correctly')
  it('should respect trust scores')
  it('should enforce diversity constraints')
})

// Python NLP
def test_minhash_similarity():
    # 測試相似文章偵測
    
def test_summary_number_validation():
    # 測試數字一致性
```

### 整合測試

```typescript
// End-to-End Newsletter Flow
describe('Daily Newsletter', () => {
  it('should fetch -> dedupe -> rank -> send', async () => {
    // 1. Seed test articles
    // 2. Trigger scheduler
    // 3. Verify issue created
    // 4. Check email delivery
  })
})
```

### 手動測試清單

- [ ] RSS 來源新增/移除
- [ ] 相似文章正確聚類
- [ ] Email 在各客戶端渲染正常 (Gmail, Outlook, Apple Mail)
- [ ] 取消訂閱功能運作
- [ ] 錯誤重試機制
- [ ] 指標數據準確性

---

## 📈 可觀測性

### 日誌架構

```typescript
// Winston 結構化日誌
logger.info('RSS fetch completed', {
  sourceId,
  articlesCount: 15,
  duration: 3200,  // ms
  errors: []
});

// 日誌等級
- error: 系統錯誤，需立即處理
- warn: 異常但可恢復
- info: 正常業務事件
- debug: 除錯資訊 (生產關閉)
```

### 指標監控

```typescript
// metrics-logger.ts 輸出
=== Source Health ===
Reuters:   ✅ Active (last success: 2 min ago)
CNBC:      ⚠️ Degraded (2 failures)
Bloomberg: ❌ Inactive (5 failures)

=== Deduplication Stats ===
Total articles: 487
Unique clusters: 312
Dedup rate: 35.9%

=== Summarization Coverage ===
Articles with summary: 391/487 (80.3%)
Avg summary length: 2.1 sentences

=== Newsletter Performance ===
Last issue: 2024-11-14
Articles included: 12
Delivery success: 98.5% (197/200)
```

### 告警規則 (未來)

```typescript
// 告警條件
if (source.consecutiveFailures >= 3) {
  sendAlert('Source degraded: ' + source.name)
}

if (dedupRate < 0.2) {
  sendAlert('Low dedup rate, possible config issue')
}

if (deliverySuccessRate < 0.9) {
  sendAlert('High email bounce rate')
}
```

---

## 🚀 部署架構

### 當前: 本地開發環境

```
┌─────────────────────────────────┐
│   Developer Machine             │
│                                 │
│  ┌──────────┐  ┌─────────────┐ │
│  │ Next.js  │  │ PostgreSQL  │ │
│  │  :3000   │  │   :5432     │ │
│  └──────────┘  └─────────────┘ │
│       │              │          │
│  ┌────▼─────────────▼────────┐ │
│  │  Python Workers (Poetry) │ │
│  └──────────────────────────┘ │
└─────────────────────────────────┘
```

### 未來: Docker Compose 部署

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
  
  web:
    build: ./apps/web
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgresql://...
  
  nlp-worker:
    build: ./services/nlp-py
    depends_on:
      - postgres
    command: python -m src.workers.dedupe
```

### 生產環境建議 (AWS)

```
┌───────────────────────────────────────┐
│          AWS Account                  │
│                                       │
│  ┌─────────────┐    ┌──────────────┐ │
│  │   ECS       │───▶│   RDS        │ │
│  │  (Fargate)  │    │ (PostgreSQL) │ │
│  └─────────────┘    └──────────────┘ │
│         │                             │
│         │ Trigger                     │
│  ┌──────▼────────┐                   │
│  │  EventBridge  │                   │
│  │  (Scheduler)  │                   │
│  └───────────────┘                   │
│                                       │
│  ┌───────────────┐                   │
│  │  SES / SQS    │                   │
│  │  (Email)      │                   │
│  └───────────────┘                   │
└───────────────────────────────────────┘

估計成本: ~$20-50/月
- RDS t4g.micro: $15/月
- ECS Fargate: $10/月 (最小配置)
- SES: $0.10/千封 (幾乎免費)
```

---

## 🔧 維運手冊

### 常用操作指令

```bash
# 1. 初始化專案
npm install
docker-compose up -d
cd apps/web && npx prisma migrate dev

# 2. 安裝 Python 依賴
cd services/nlp-py
poetry env use python3.11
poetry install
poetry run python -m spacy download en_core_web_sm

# 3. 種子資料
npm run seed:sources

# 4. 開發模式
npm run dev  # 啟動 Next.js + 所有服務

# 5. 手動觸發擷取
npm run ingest:rss

# 6. 查看指標
npx tsx scripts/ops/metrics-logger.ts

# 7. 清理資料庫 (謹慎使用)
cd apps/web
npx prisma db push --force-reset
```

### 故障排除

#### 問題 1: PostgreSQL 連線失敗
```bash
# 檢查容器狀態
docker ps

# 查看日誌
docker logs morning-pulse-postgres-1

# 重啟容器
docker-compose restart postgres
```

#### 問題 2: Python spaCy 模型未安裝
```bash
cd services/nlp-py
poetry run python -m spacy download en_core_web_sm

# 驗證
poetry run python -c "import spacy; nlp = spacy.load('en_core_web_sm')"
```

#### 問題 3: Email 發送失敗
```bash
# 檢查 SMTP 設定
echo $SMTP_HOST
echo $SMTP_USER

# 測試 SMTP 連線 (使用 telnet 或 openssl)
openssl s_client -connect smtp.gmail.com:465

# 查看發送日誌
tail -f apps/web/logs/combined.log | grep "email"
```

#### 問題 4: Job 卡在 processing 狀態
```sql
-- 查看卡住的 Job
SELECT id, type, status, attempts, started_at 
FROM jobs 
WHERE status = 'processing' 
  AND started_at < NOW() - INTERVAL '1 hour';

-- 重置為 pending (謹慎使用)
UPDATE jobs 
SET status = 'pending', 
    started_at = NULL 
WHERE id = 'xxx';
```

### 資料清理策略

```typescript
// 定期清理腳本 (建議每週執行)

// 1. 刪除 30 天前的文章
await prisma.article.deleteMany({
  where: {
    tsPublished: {
      lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }
  }
});

// 2. 刪除已完成的 Job (保留 7 天)
await prisma.job.deleteMany({
  where: {
    status: { in: ['completed', 'failed'] },
    completedAt: {
      lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }
  }
});

// 3. 清理空 Cluster
await prisma.cluster.deleteMany({
  where: {
    articles: { none: {} }
  }
});
```

---

## 📝 未來發展路線圖

### Phase 1: MVP 完成 ✅
- [x] RSS 擷取與正規化
- [x] MinHash + SimHash 去重
- [x] 規則式摘要生成
- [x] 排序與篩選
- [x] MJML Email 渲染
- [x] Nodemailer 發送
- [x] Cron 排程
- [x] 基礎指標監控

### Phase 2: 增強功能 (Q1 2025)
- [ ] 使用者認證系統 (NextAuth.js)
- [ ] Web UI 管理介面
  - [ ] Source CRUD
  - [ ] 即時預覽電子報
  - [ ] 指標儀表板
- [ ] 改用 BullMQ + Redis Queue
- [ ] Email 開信追蹤 (追蹤像素)
- [ ] 取消訂閱頁面

### Phase 3: AI 增強 (Q2 2025)
- [ ] 整合 OpenAI API 生成摘要
  - [ ] Fallback 機制: OpenAI → 規則式
  - [ ] 成本控制: 每日預算上限
- [ ] 向量相似度搜尋 (Pinecone)
- [ ] 主題分類模型 (FinBERT)
- [ ] 情感分析 (正面/負面/中性)

### Phase 4: 個人化 (Q3 2025)
- [ ] 使用者偏好設定
  - [ ] 關注股票代碼
  - [ ] 感興趣主題
  - [ ] 發送頻率 (每日/每週)
- [ ] A/B 測試框架
- [ ] 點擊率優化

### Phase 5: 商業化 (Q4 2025)
- [ ] 多層級訂閱方案
  - [ ] Free: 每日 10 篇
  - [ ] Pro: 完整版 + 即時推送
  - [ ] Enterprise: API 存取
- [ ] 廣告系統 (贊助文章標記)
- [ ] Analytics API

---

## 🎯 關鍵成功指標 (KPIs)

### 技術指標
- **系統可用性**: >99.5%
- **RSS 擷取成功率**: >95%
- **Email 發送成功率**: >98%
- **去重準確率**: >90%
- **摘要覆蓋率**: >85%

### 業務指標 (未來)
- **每日活躍用戶 (DAU)**: 目標 1000+
- **Email 開信率**: 目標 30%+
- **點擊率 (CTR)**: 目標 5%+
- **訂閱轉換率**: 目標 10%
- **流失率**: <5% 每月

---

## 💡 最佳實踐建議

### 1. 程式碼品質
```typescript
// ✅ 好的做法: 型別安全
interface RankingResult {
  articleId: string;
  score: number;
  metadata: {
    sourceName: string;
    clusterSize: number;
  };
}

// ❌ 避免: any 類型
function rankArticles(): any[] { ... }
```

### 2. 錯誤處理
```typescript
// ✅ 完整的錯誤處理
try {
  await sendEmail(user, issue);
} catch (error) {
  if (error instanceof SMTPError) {
    // 記錄 bounce
    await updateDeliveryStatus(delivery.id, 'bounced');
  } else {
    // 可重試的錯誤
    await requeueJob(job.id);
  }
  logger.error('Email send failed', { error, userId: user.id });
}
```

### 3. 效能優化
```typescript
// ✅ 批次查詢
const articles = await prisma.article.findMany({
  where: { id: { in: articleIds } },
  include: { source: true }
});

// ❌ N+1 查詢
for (const id of articleIds) {
  const article = await prisma.article.findUnique({
    where: { id },
    include: { source: true }
  });
}
```

### 4. 安全性
```typescript
// ✅ 環境變數管理
const SMTP_PASS = process.env.SMTP_PASS;
if (!SMTP_PASS) {
  throw new Error('SMTP_PASS not configured');
}

// ❌ 硬編碼密碼
const SMTP_PASS = 'my-secret-password';
```

---

## 📚 相關文件連結

- **專案 README**: `/README.md`
- **架構文件**: `/docs/ARCHITECTURE.md`
- **任務清單**: `/specs/001-newsletter-mvp/tasks.md`
- **API 文件**: (待建立)
- **部署指南**: (待建立)

---

## 🤝 貢獻指南

### Git Workflow

```bash
# 1. 建立功能分支
git checkout -b feature/user-preferences

# 2. 開發並提交
git add .
git commit -m "feat: add user preference settings"

# 3. 推送並建立 PR
git push origin feature/user-preferences
```

### Commit Message 規範

```
格式: <type>(<scope>): <subject>

type:
- feat: 新功能
- fix: Bug 修復
- docs: 文件更新
- style: 程式碼格式
- refactor: 重構
- test: 測試
- chore: 建構/工具

範例:
feat(ranking): add trust score weighting
fix(email): handle SMTP timeout gracefully
docs(readme): update installation steps
```

---

## 📞 聯絡資訊

- **專案負責人**: [待填寫]
- **技術支援**: [待填寫]
- **問題回報**: GitHub Issues

---

## 📄 授權

MIT License - 詳見 `LICENSE` 檔案

---

**文件版本**: 1.0.0
**最後更新**: 2024-11-14
**下次審查**: 2025-01-14 (每季更新)