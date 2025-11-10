# MorningPulse - Financial Newsletter MVP

自動化財經新聞電子報系統,每日 7:30 AM 發送精選去重的財經新聞。

## 🎯 專案特色

- **免費架構**: 完全使用免費服務,成本 $0/月
- **智能去重**: SimHash 演算法自動聚類相似新聞
- **AI 摘要**: 提取式摘要 + 數字驗證
- **個人化**: 支援股票代碼/產業關注清單

## 🏗️ 架構

```
morning-pulse/
├── apps/
│   └── web/              # Next.js BFF (email 渲染 + API)
├── services/
│   └── nlp-py/           # Python NLP workers (去重、摘要、NER)
└── specs/
    └── 001-newsletter-mvp/  # 功能規格文件
```

## 🚀 快速開始

### 前置需求

- Node.js 20+
- Python 3.11+
- Docker (for PostgreSQL)

### 設定步驟

```bash
# 1. 安裝根目錄依賴
npm install

# 2. 啟動資料庫
docker-compose up -d

# 3. 設定環境變數
cp .env.example .env
# 編輯 .env 填入 email 服務憑證

# 4. 安裝 Next.js 依賴
cd apps/web
npm install

# 5. 設定 Python 環境
cd ../../services/nlp-py
source venv/bin/activate
poetry install
python -m spacy download en_core_web_sm

# 6. 啟動開發伺服器
cd ../../
npm run dev
```

## 📦 技術棧

| 功能 | 技術 |
|------|------|
| **Web/API** | Next.js 16, TypeScript |
| **Email** | Nodemailer + Gmail SMTP / Resend |
| **資料庫** | PostgreSQL (Docker) |
| **ORM** | Prisma |
| **Queue** | SQLite-based job queue |
| **NLP** | spaCy, datasketch |
| **排程** | node-cron |
| **Logging** | Winston, structlog |

## 📝 開發任務

查看完整任務列表: [tasks.md](./specs/001-newsletter-mvp/tasks.md)

- ✅ T001-T003: Monorepo + Next.js + Python 設定完成
- 🔄 接下來: T004-T010 (Docker Compose, Prisma, Linters)

## 📄 License

MIT
