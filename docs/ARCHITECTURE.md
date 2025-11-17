# Architecture Overview

MorningPulse MVP 在 $0 成本條件下實作每日自動產生與寄送財經精選新聞電子報的資料流。核心流程：RSS 擷取 → 正規化與儲存 → 相似分群/去重 → 摘要 → 排序/篩選 → 組裝電子報 → 渲染 + 發送 → 指標追蹤。

## 1. 元件 (Components)

| Layer | Component | Tech | Purpose |
|-------|-----------|------|---------|
| Ingestion | RSS Adapter | TypeScript (rss-parser) | 依據 Source 清單抓取 RSS，套用 ETag/Last-Modified 快取與錯誤回退 | 
| Storage | PostgreSQL + Prisma | Prisma Client | 儲存 sources, articles, clusters, issues, deliveries, jobs |
| Queue | Job Table | Prisma / TS | 以資料庫模擬簡易工作佇列 (狀態、可重試、延遲) |
| NLP Workers | Deduplicator | Python (datasketch, SimHash) | 以 MinHash + SimHash 建構相似度並建立 Cluster |
| NLP Workers | Summarizer | Python (spaCy) | 規則式/關鍵句抽取與數字一致性檢查 |
| Ranking | Scorer + Filter | TypeScript | 多權重計分與品質/多樣性約束 (來源、Cluster) |
| Newsletter | Builder | TypeScript | 選出 top N 文章並建立 Issue 紀錄、delivery 列表 |
| Rendering | MJML Renderer | mjml + nodemailer | 轉換 MJML → HTML 並寄送/測試預覽 |
| Scheduling | Cron Jobs | node-cron | 每日 07:30 發送、整點 RSS 擷取、清理舊 jobs |
| Observability | Logging / Metrics Logger | Winston, structlog | 統一結構化日誌 + 指標輸出 (sources 健康、去重率) |

## 2. 資料模型 (Simplified)

- Source(id, url, lastFetchAt, etag, lastModified, status, failureCount)
- Article(id, sourceId, guid, urlNorm, tsPublished, title, contentRaw, summaryRaw, summary2, simhash, clusterId)
- Cluster(id, createdAt)
- Issue(id, issueDate, subject, articleIds[JSON], createdAt)
- IssueDelivery(id, issueId, email, status, sentAt)
- Job(id, type, payload JSON, runAt, status, attempts, lastError)

## 3. 核心序列流程

見 `docs/diagrams/architecture-sequence.mmd`：涵蓋 ingest→dedupe→summarize→rank→build→render→send。

## 4. Scheduler / Control Flow

見 `docs/diagrams/architecture-flow.mmd`：描述每日與整點排程、錯誤回復與健康更新。

## 5. 去重與聚類策略

1. 文章內容正規化 (移除 HTML, 壓縮空白)
2. MinHash + LSH 初步找候選集合 (快速、可擴充)
3. SimHash 產生 64-bit 指紋，設定漢明距離閾值 (預設 ≤ 3 視為同群)
4. 既有 Cluster 合併或建立新 Cluster
5. 更新 article.simhash 與 clusterId，供後續 ranking 避免重複

## 6. 摘要策略

- 萃取候選句 (標點/長度門檻)
- TF/位置簡易打分取前 K
- 數字/百分比在原文出現校驗 (避免失真)
- Fallback: 若句子不足或格式不佳 → 截斷首段

## 7. 排序/篩選

計分因子 (可調整): 新聞新鮮度 (time decay), Cluster 代表性, 來源信任度 (手動維護), 文字長度合理性。篩選則保證：
- 每 Cluster 只取 1 篇 (多樣性)
- 避免過度集中單一來源

## 8. 電子報組裝與寄送

- Builder 查詢排名後清單 → 建 Issue(含 articleIds JSON) → 建 delivery rows (之後可支援多 user/email)
- MJML Template 以 sections 呈現標題 + 摘要 + 原始連結
- Sender: Nodemailer SMTP (Gmail) 或 Resend API (切換取決於環境變數)

## 9. Scheduling 與重試

- node-cron：
  - 0 7 * * * → 產生 + 寄送每日 Issue
  - 0 * * * * → RSS 擷取 job
  - 每 10 分鐘 (可選) → 清除完成/失敗超時 jobs
- Job 執行：根據 runAt ≤ now & status=queued 抓取，樂觀鎖避免重複
- 重試策略：指數退避 (attempts 增加後延遲)，達上限標記 failed

## 10. 健康與可觀測

- Source 失敗次數與最近成功時間 → 來源健康判斷 (可在 metrics logger 顯示)
- 去重率 = (原始文章數 - Cluster 後代表數)/原始文章數
- Summarization coverage、平均處理延遲

## 11. 本地開發與測試策略

| 目的 | 指令 (概念) |
|------|-------------|
| 初始化 DB | docker-compose up -d → prisma migrate dev |
| 填充預設 Sources | ts-node scripts/etl/seed-sources.ts |
| 手動觸發 ingest | 直接呼叫 service 或建一個 ingest job |
| 檢視 metrics | ts-node scripts/ops/metrics-logger.ts |
| 產生電子報 (手動) | 呼叫 builder service, 或暫時 expose API route |

## 12. 未來擴充點

- 改用真正的分散式 Queue (e.g. Redis + BullMQ)
- 引入向量嵌入 + 更精細語意聚類
- 使用 LLM 精煉摘要 (增加成本前先 A/B 評估)
- Multi-tenant / 使用者偏好 (watchlist, 行業優先)
- 來源自動健康降權與自動補充新來源

## 13. 安全/成本考量

- 所有 secrets 僅存在本地 .env，不上傳 Git
- 無外部付費雲資源；SMTP 使用 Gmail (低流量) 或免費 Resend 方案
- 以資料庫 queue 減少額外基礎建設成本

## 14. 回滾策略 (若排程出錯)

- 停止 cron 啟動 (註解或環境旗標)
- 清空 queued jobs (保留 failed 以利除錯)
- 刪除當日 Issue (若尚未寄送或寄送錯誤) 重建後再寄送

---
參考圖表：
- [Sequence Flow](./diagrams/architecture-sequence.mmd)
- [Scheduler Flow](./diagrams/architecture-flow.mmd)
