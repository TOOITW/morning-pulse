# 📋 T014 & T015 Agent 任務發起摘要

**準備時間**: 2025-11-17  
**任務**: URL 正規化 & 內容雜湊完整實現  
**預期工作量**: 2-3 小時  
**優先級**: 🔴 Critical (MVP 必要)

---

## 🎯 任務總結

實現 MorningPulse 的 **URL 正規化工具** 和 **內容雜湊生成器**，使系統能夠正確去重相似文章，邁向完整自動化。

---

## 📂 已準備的資源

在 `.chat` 資料夾中已生成 4 份完整文檔：

### 1. **SDD-T014-T015-URL-Hash-Agent-Prompt.md** (完整規格，~5000 字)
- 詳細的需求規格 (Part 1-3)
- 100+ 項實現要求
- 7 個完整的驗收檢查清單
- 常見問題與故障排除
- **適用**: 第一次使用，需要深度理解

### 2. **AGENT-DIRECT-INSTRUCTIONS-T014-T015.md** (快速指示，~2000 字)
- 4 個主要執行步驟
- 30 個測試場景清單
- 20 項完成檢查清單
- 關鍵提示與注意事項
- **適用**: 快速開始，複製貼上使用

### 3. **HOW-TO-USE-AGENT-INSTRUCTIONS.md** (使用指南，~1500 字)
- 3 種 Agent 指示方法
- 4 種文檔使用場景
- 交付物驗收清單
- 時間線與常見問題
- **適用**: 了解如何有效使用這些文檔

### 4. **TASK-SUMMARY-T014-T015.md** (本文件)
- 任務快速參考
- 文件清單與使用方式

---

## 🚀 立即開始方式

### Option A: 完整規格方式 (推薦)

```
直接複製 SDD-T014-T015-URL-Hash-Agent-Prompt.md 的內容到 Claude 對話
↓
Agent 獲得完整的需求理解和背景
↓
按照 "執行流程" 的 3 個步驟進行
↓
2-3 小時內完成
```

### Option B: 快速指示方式

```
直接複製 AGENT-DIRECT-INSTRUCTIONS-T014-T015.md 的內容到 Claude 對話
↓
Agent 快速開始 4 個主要步驟
↓
遇到問題時查詢完整版 SDD
↓
1.5-2 小時內完成
```

### Option C: 檔案路徑方式

```
告訴 Agent 去讀取:
/Users/chenyuan.chang/Workspace/morning-pulse/.chat/AGENT-DIRECT-INSTRUCTIONS-T014-T015.md
↓
Agent 自行獲取並執行
↓
需要時參考其他文檔
```

---

## ✅ 預期交付物

Agent 完成後應提交：

```
modified:   apps/web/src/lib/utils/url.ts
modified:   apps/web/src/lib/utils/hash.ts
new file:   apps/web/src/lib/utils/__tests__/url.test.ts
new file:   apps/web/src/lib/utils/__tests__/hash.test.ts
```

**驗證命令**:
```bash
npm run test -- --testPathPattern="(url|hash)" --coverage
npm run lint && npm run typecheck
npm run seed:sources && npm run ingest:rss
```

---

## 📊 成功標準

- ✅ 所有測試通過 (18+ URL tests + 12+ hash tests)
- ✅ 程式碼覆蓋率 ≥ 95%
- ✅ npm run lint 無錯誤
- ✅ npm run typecheck 無錯誤
- ✅ npm run ingest:rss 正常執行

---

## ⏱️ 時間表

| 階段 | 預期時間 |
|------|---------|
| Step 1: 檢查現狀 | 5 分鐘 |
| Step 2: 增強實現 | 60-90 分鐘 |
| Step 3: 編寫測試 | 30-40 分鐘 |
| Step 4: 驗證 | 20-30 分鐘 |
| **總計** | **2-3 小時** |

---

## 🎁 已包含在文檔中

✅ 現狀分析 - 檔案已存在，需要什麼補強
✅ 詳細規格 - 7 個新增函數的完整規格
✅ 測試計劃 - 30 個測試場景 (不會遺漏)
✅ 驗收清單 - 20+ 項確認要點
✅ 故障排除 - 常見問題與解決方案
✅ 效能基準 - URL 正規化 < 5ms 等目標
✅ 執行流程 - Step by step 清單
✅ 交付物清單 - 確切知道要提交什麼

---

## 🔍 快速檢查：現有代碼狀態

**url.ts**: ✅ 已有基礎實現
- removeTrackingParams() ✓
- normalizeUrl() ✓
- extractCanonicalUrl() ✓
- followRedirects() ✓
- **缺**: isValidUrl(), normalizeInternationalDomain(), 增強去重邏輯, timeout 處理

**hash.ts**: ✅ 已有基礎實現
- stripTitle() ✓
- generateContentHash() ✓
- **缺**: verifyHashDeterminism(), createArticleSignature(), HTML 實體去除

**測試**: ❌ 尚無完整測試檔案
- 需要 url.test.ts (18+ 用例)
- 需要 hash.test.ts (12+ 用例)

---

## 💡 給 Agent 的推薦給法

**推薦用語**：

```
我有一個 Specification Driven Development (SDD) 風格的任務要給你。

我需要你實現 MorningPulse 的 URL 正規化與內容雜湊功能 (T014 & T015)。

以下是完整的任務規格文檔，請按照其中的執行流程完成：

[複製 SDD 文檔或簡化版指示]

如果有任何不清楚的地方，可以參考同文檔中的 "常見問題" 或 "特殊注意事項" 部分。

預期完成時間：2-3 小時
```

---

## 📞 後續支持

如果 Agent 遇到問題：

1. **檢查完整 SDD**: `SDD-T014-T015-URL-Hash-Agent-Prompt.md`
   - "常見問題 & 故障排除" 段落
   - "特殊注意事項" 段落

2. **查詢快速指示**: `AGENT-DIRECT-INSTRUCTIONS-T014-T015.md`
   - "提示與注意事項" 段落
   - "如果遇到困難" 段落

3. **確認理解**: 用 `HOW-TO-USE-AGENT-INSTRUCTIONS.md` 的常見問題回答

---

## 🎯 完成後的下一步

Task T014 & T015 完成後：

✅ URL 正規化完全可用
✅ 內容雜湊完全可用
✅ 為 T016-T018 (RSS Adapter) 奠定基礎

**預計可進行**:
- T016-T018: RSS 適配器實現 (3-4 天)
- T021-T023: Job Queue 系統 (2-3 天)
- T027-T033: 去重與摘要算法 (3-4 天)

---

## 📋 檔案清單

```
.chat/
├── project-analysis-2024-11-14.md              # 舊檔：完整專案分析
├── SDD-T014-T015-URL-Hash-Agent-Prompt.md     # ✅ 新增：完整規格書
├── AGENT-DIRECT-INSTRUCTIONS-T014-T015.md     # ✅ 新增：快速指示
├── HOW-TO-USE-AGENT-INSTRUCTIONS.md            # ✅ 新增：使用指南
└── TASK-SUMMARY-T014-T015.md                   # ✅ 新增：本文件
```

---

## 🎉 準備就緒！

所有必要的文檔和規格都已準備完成。

**現在可以立即給 Agent 指示開始開發 T014 & T015！**

選擇上面的 Option A/B/C 任選一種方式即可開始。
