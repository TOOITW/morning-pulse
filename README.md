# MorningPulse - Financial Newsletter MVP

自動化財經新聞電子報系統，每日 7:30 AM 發送精選去重的財經新聞。支援 RSS 擷取、相似分群、摘要、排名、多樣性篩選、MJML 渲染與 Email 寄送，全部採用 $0 成本本地免費架構。

## 🎯 專案特色

- **免費架構**: 完全使用免費服務，成本 $0/月
- **智能去重**: MinHash + SimHash 演算法自動聚類相似新聞
- **摘要**: 規則式提取 + 數字驗證 (避免錯誤數值)
- **多樣性**: 排名/篩選過濾重複 Cluster 與來源集中
- **排程自動化**: 整點擷取、每日寄送、工作清理
- **可觀測性**: 指標與來源健康、去重率、摘要覆蓋度

## 🏗️ 目錄結構 (Simplified)

```
morning-pulse/
├── apps/
│   └── web/                  # Next.js BFF + 排程 + 排序/篩選 + Email
├── services/
│   └── nlp-py/               # Python 去重 / 摘要 Workers
├── scripts/                  # seed、metrics 等輔助腳本
├── docs/                     # 架構文件與圖表
└── specs/                    # MVP 規格與任務
```

更多細節請見 `docs/ARCHITECTURE.md`。

### � 資料流程圖 / 排程圖

- 序列流程: `docs/diagrams/architecture-sequence.mmd`
- 排程與控制流程: `docs/diagrams/architecture-flow.mmd`

## �🚀 快速開始 (Quickstart)

### 前置需求

- Node.js 20+
- Python 3.11+
- Docker (for PostgreSQL)

### 設定步驟

```bash
# 1. 安裝根目錄依賴 (Workspace packages)
npm install

# 2. 啟動 PostgreSQL
docker-compose up -d

# 3. 建立 .env 並填入 EMAIL/SMTP / RESEND_KEY 等憑證
cp .env.example .env

# 4. 進入 Web 套件安裝前端 / 服務端依賴
cd apps/web && npm install && cd -

# 5. 執行 Prisma Migrate (若已有 migration)
cd apps/web && npx prisma migrate dev && cd -

# 6. 設定 Python NLP 環境（重要：需使用 Python 3.11）
cd services/nlp-py
# 若系統 Python 為 3.13+ 會遇到 spaCy 依賴編譯問題，需先安裝 Python 3.11
# brew install python@3.11
poetry env use python3.11  # 指定使用 Python 3.11
poetry lock                # 生成 poetry.lock
poetry install             # 安裝依賴
poetry run python -m spacy download en_core_web_sm  # 下載 spaCy 模型
cd -

# 7. 種子來源資料 (RSS Sources)
# 你可以使用 npm script 快捷指令：
npm run seed:sources

# 或仍可直接使用 tsx：
npx tsx scripts/etl/seed-sources.ts

# 8. 啟動開發 (Turbo 同時啟動 Next.js 等)
npm run dev
```

### 常用操作指令 (Ops)

```bash
# 手動觸發 RSS 擷取 (使用 npm script 快捷)
npm run ingest:rss

# 或直接以 tsx 執行原始腳本：
npx tsx scripts/etl/fetch-articles.ts

# 查看 Metrics (來源健康 / 去重率 / 摘要覆蓋)
npx tsx scripts/ops/metrics-logger.ts

# 手動生成今日電子報 (若排程尚未觸發)
# 可在 web layer 暫時建立一個 dev route 或直接呼叫 builder service

# 清理舊 jobs (若尚未啟動自動清理 cron)
# 直接撰寫腳本或在排程檔案加入清理函式呼叫
```

### 環境變數 (部分)

| Name | 說明 |
|------|------|
| SMTP_HOST / SMTP_USER / SMTP_PASS | 寄送信件所需，使用 Gmail 或其他免費 SMTP |
| RESEND_API_KEY | (可選) 使用 Resend 服務時填入 |
| NEWSLETTER_DAILY_CRON | 預設 `0 7 * * *` |
| NEWSLETTER_INGEST_CRON | 預設 `0 * * * *` |

> 安全：請勿提交實際密碼到版本控制；使用 `.env` 並在 `.gitignore` 已忽略。

## 📦 技術棧

| 分類 | 技術 | 說明 |
|------|------|------|
| Web / API | Next.js 16, TypeScript | BFF + 排程 + 排序/篩選 |
| Email | Nodemailer / Resend | MJML 轉 HTML 並寄送 |
| 資料庫 | PostgreSQL (Docker) | 永久儲存模型 |
| ORM | Prisma v6 | 型別安全存取 |
| Queue | Job Table (DB) | 低成本簡易工作佇列 |
| NLP | spaCy, datasketch (MinHash), SimHash | 去重與摘要 |
| 排程 | node-cron | 整點 ingest & 每日 newsletter |
| Logging | winston / structlog | 分層結構化日誌 |
| Template | MJML | Email 可維護模板 |
| Metrics | 自訂腳本 | 顯示健康 / 效能指標 |

## 📝 進度與任務

完整任務: [tasks.md](./specs/001-newsletter-mvp/tasks.md)

| 階段 | 狀態 | 摘要 |
|------|------|------|
| Phase 1 - 基礎環境 | ✅ | Monorepo, Next.js, Python, DB, Prisma |
| Phase 2 - 核心功能 | ✅ | Ingest, Queue, 去重, 摘要, Ranking, Builder |
| Phase 3 - US1 Daily Newsletter | ✅ | MJML, Sender, Scheduler, Metrics |
| Docs & Diagrams | 🚧 | README / ARCHITECTURE / Mermaid |

> 後續可擴充：真正分散式 Queue、LLM 摘要、使用者偏好、來源自動管理。

## 🛠️ 測試與品質

執行：
```bash
npm run lint
npm test
```
或針對 web 套件：
```bash
cd apps/web && npm run lint && npm test && cd -
```

## 🧪 回滾策略 (簡述)

- 停用 cron (註解或環境變數) → 避免持續產生 Issue
- 清除 queued/processing jobs (保留 failed 供除錯)
- 刪除當日 Issue + deliveries 後重新生成寄送

## ⚠️ 常見問題 (Troubleshooting)

### Python 環境問題

**問題**: `poetry install` 時出現 `srsly` 或 `spaCy` 編譯錯誤
```
error: use of undeclared identifier 'PyObject_AsReadBuffer'
```

**原因**: Python 3.13+ 移除了部分舊 C API，spaCy 依賴的 `srsly` 套件尚未完全支援

**解決方案**:
```bash
# 1. 安裝 Python 3.11
brew install python@3.11

# 2. 清除舊環境
cd services/nlp-py
poetry env remove --all

# 3. 指定使用 Python 3.11
poetry env use python3.11

# 4. 重新安裝
poetry lock
poetry install
poetry run python -m spacy download en_core_web_sm

# 5. 驗證
poetry run python -c "import spacy; nlp = spacy.load('en_core_web_sm'); print('✅ OK')"
```

### Poetry 找不到

**問題**: `zsh: command not found: poetry`

**解決方案**: Poetry 應全域安裝，而非在虛擬環境內
```bash
# 官方安裝方式
curl -sSL https://install.python-poetry.org | python3 -

# 或使用 Homebrew
brew install poetry

# 重新載入 shell 設定
source ~/.zshrc
```

### TypeScript 腳本執行問題

**問題**: 執行 `npx ts-node scripts/...` 時出現 ES Module 錯誤
```
SyntaxError: Cannot use import statement outside a module
```

**原因**: `ts-node` 對 ES Module 支援不完整，現代專案建議使用 `tsx`

**解決方案**:
```bash
# 安裝 tsx（已包含在專案中）
npm install --save-dev tsx

# 使用 tsx 執行 TypeScript 腳本
npx tsx scripts/etl/seed-sources.ts
npx tsx scripts/ops/metrics-logger.ts
```

## 📄 License

MIT
