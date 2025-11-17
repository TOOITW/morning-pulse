# Agent SDD 指示：URL 正規化 & 內容雜湊實現

**任務編號**: T014, T015  
**優先級**: 🔴 Critical  
**預期工作量**: 2-3 小時  
**目標交付**: 完整通過所有測試的生產級實現

---

## 🎯 任務目標

實現 MorningPulse 的 **URL 正規化工具** 和 **內容雜湊生成器**，使系統能夠正確去重相似文章。

### 核心需求

1. **URL 正規化 (T014)**
   - 移除所有追蹤參數 (UTM, fbclid, gclid, _ga 等)
   - 標準化 URL 結構 (小寫 domain、排序 query 參數、移除 fragment)
   - 提取 Canonical URL (從 HTML meta 標籤)
   - 跟隨 HTTP 重定向到最終 URL
   - 邊界情況處理 (無效 URL、相對 URL 等)

2. **內容雜湊生成 (T015)**
   - 生成 SHA256 hash 用於精確去重
   - 雜湊輸入：規範化 URL + 清理後的標題
   - 標題清理：移除特殊字符、統一空白、轉小寫
   - 提供簽名方法供其他模塊使用

### 成功標準

- ✅ 所有 18+ 個測試用例通過
- ✅ 程式碼覆蓋率 ≥ 95%
- ✅ 支持邊界情況（無效 URL、國際化域名等）
- ✅ 效能達標：單個 URL 處理 < 10ms

---

## 📁 現狀分析

### 已存在檔案

```
apps/web/src/lib/utils/
├── url.ts          # ✅ 已有基礎實現 (removeTrackingParams, normalizeUrl 等)
├── hash.ts         # ✅ 已有基礎實現 (generateContentHash)
└── retry.ts        # ⚠️ 需檢查是否有 HTTP retry 機制
```

### 現有實現的檢查清單

**url.ts 現況**:
- ✅ `removeTrackingParams()` - 已實現
- ✅ `normalizeUrl()` - 已實現
- ✅ `normalizeArticleUrl()` - 已實現（組合上述兩者）
- ✅ `extractCanonicalUrl()` - 已實現
- ✅ `followRedirects()` - 已實現

**hash.ts 現況**:
- ✅ `stripTitle()` - 已實現
- ✅ `generateContentHash()` - 已實現

### 需要補強的地方

1. **url.ts 增強**
   - [ ] 添加 **IDN (國際化域名)** 支持
   - [ ] 添加 **URL 驗證工具** 函數
   - [ ] 改進 **followRedirects** 的 timeout 設定
   - [ ] 添加 **重複參數去重** (e.g., `?a=1&a=2` → `?a=1`)

2. **hash.ts 增強**
   - [ ] 添加 **多種 hash 方法** 支持 (MD5 用於快速比對，SHA256 用於驗證)
   - [ ] 添加 **確定性驗證** (同輸入必然同輸出)

3. **新增測試檔案**
   - [ ] `apps/web/src/lib/utils/__tests__/url.test.ts` - 完整單元測試
   - [ ] `apps/web/src/lib/utils/__tests__/hash.test.ts` - 完整單元測試

4. **集成點**
   - [ ] 檢查 `apps/web/prisma/schema.prisma` 是否有 `contentHash` 欄位 (應已有)
   - [ ] 驗證 RSS adapter 會呼叫這些函數

---

## 🔧 詳細實現規格

### Part 1: URL 正規化增強 (url.ts)

#### 1.1 添加 URL 驗證函數

```typescript
/**
 * Validate if URL is well-formed and safe to process
 * @returns true if valid HTTP(S) URL, false otherwise
 */
export function isValidUrl(url: string): boolean
```

**需求**:
- 只接受 `http://` 和 `https://` 協議
- 拒絕 `javascript:`, `data:`, `file://` 等危險協議
- 檢查 URL 長度 ≤ 2048 字符
- 返回 boolean

**邊界情況**:
- 空字符串 → false
- `http://` 只有協議 → false
- 特殊字符編碼 → true (正常)

#### 1.2 改進 removeTrackingParams

```typescript
/**
 * Remove and deduplicate query parameters
 * @returns URL without tracking params and deduplicated query strings
 */
export function removeTrackingParams(url: string): string
```

**增強**:
- 擴展追蹤參數列表：
  ```
  utm_*, fbclid, gclid, msclkid, _ga, mc_*, 
  igshid, sa_*, rss_*, ref, ref_src, t, 
  twclid, wbraid, gbraid, smart_id, smart_param
  ```
- 處理重複參數 (保留第一個，移除其餘)

**範例**:
```
Input:  https://example.com?a=1&utm_source=fb&a=2&gclid=123
Output: https://example.com?a=1
```

#### 1.3 添加 IDN 支持

```typescript
/**
 * Convert international domain names to ASCII
 * @returns URL with ASCII-encoded domain
 */
export function normalizeInternationalDomain(url: string): string
```

**需求**:
- 使用 `toASCII()` 轉換國際化域名
- 保持路徑與查詢字符串不變

**範例**:
```
Input:  https://日本.jp/news?id=1
Output: https://xn--wgv71a.jp/news?id=1
```

#### 1.4 改進 followRedirects 穩定性

```typescript
export async function followRedirects(
  url: string,
  maxRedirects?: number,
  timeoutMs?: number
): Promise<string>
```

**增強**:
- 添加可配置的 **timeout (預設 5000ms)**
- 添加 **User-Agent** header (防止被拒)
- 處理循環重定向 (相同 URL 出現 2 次 → 停止)
- 返回 original URL 如果無法跟隨

---

### Part 2: 內容雜湊增強 (hash.ts)

#### 2.1 改進 stripTitle

```typescript
export function stripTitle(title: string): string
```

**增強**:
- 去除 HTML 實體 (`&amp;` → `&`)
- 去除多語言特殊字符但保留意義
- 去除常見新聞標題冗餘詞 (例如 "新聞", "快訊", "[速報]" 等)

**範例**:
```
Input:  "Reuters: Breaking &amp; News - [速報] US Markets"
Output: "reuters breaking news us markets"
```

#### 2.2 添加 Determinism 測試

```typescript
/**
 * Verify hash generation is deterministic
 * @returns true if multiple calls with same input produce identical hash
 */
export function verifyHashDeterminism(
  url: string,
  title: string,
  iterations?: number
): boolean
```

**需求**:
- 同一 URL + 標題，100 次調用應產生相同 hash
- 用於測試環境驗證

#### 2.3 提供 hash 簽名方法

```typescript
/**
 * Create hashable signature from article data
 * Can be used for quick comparison before full hash
 */
export function createArticleSignature(
  url: string,
  title: string,
  publishDate?: Date
): { 
  contentHash: string      // SHA256
  quickHash: string        // MD5 for fast pre-filtering
  signature: string        // Combined unique identifier
}
```

---

### Part 3: 單元測試 (NEW FILES)

#### 3.1 URL 測試檔案路徑

```
apps/web/src/lib/utils/__tests__/url.test.ts
```

**測試用例清單** (最少 18 個):

1. ✅ `removeTrackingParams` 移除 UTM 參數
2. ✅ `removeTrackingParams` 移除 fbclid
3. ✅ `removeTrackingParams` 移除 gclid
4. ✅ `removeTrackingParams` 保留合法參數
5. ✅ `normalizeUrl` 轉小寫 domain
6. ✅ `normalizeUrl` 移除 fragment
7. ✅ `normalizeUrl` 排序查詢參數
8. ✅ `normalizeArticleUrl` 完整管道
9. ✅ `extractCanonicalUrl` 從 link tag
10. ✅ `extractCanonicalUrl` 從 og:url
11. ✅ `extractCanonicalUrl` fallback
12. ✅ `isValidUrl` 接受有效 HTTP(S) URL
13. ✅ `isValidUrl` 拒絕 javascript:
14. ✅ `isValidUrl` 拒絕空字符串
15. ✅ `normalizeInternationalDomain` IDN 轉換
16. ✅ `followRedirects` 跟隨單一重定向
17. ✅ `followRedirects` 停止循環重定向
18. ✅ `followRedirects` timeout 返回原 URL

#### 3.2 Hash 測試檔案路徑

```
apps/web/src/lib/utils/__tests__/hash.test.ts
```

**測試用例清單** (最少 12 個):

1. ✅ `stripTitle` 移除特殊字符
2. ✅ `stripTitle` 轉小寫
3. ✅ `stripTitle` 統一空白
4. ✅ `generateContentHash` 返回 64 字符 hex 字符串 (SHA256)
5. ✅ `generateContentHash` 確定性 (同輸入 = 同輸出)
6. ✅ `generateContentHash` 不同輸入 = 不同輸出
7. ✅ `generateContentHash` 大小寫不敏感 (標題大小寫異同結果相同)
8. ✅ `createArticleSignature` 返回所有三個 hash
9. ✅ `createArticleSignature` contentHash 是 SHA256
10. ✅ `createArticleSignature` quickHash 是 MD5 (32 字符)
11. ✅ `verifyHashDeterminism` 100 次迭代相同
12. ✅ 邊界情況：空 URL、空標題、特殊字符

---

## 📋 驗收清單 (Agent 完成後檢查)

### 功能驗收

- [ ] **url.ts 完整度**
  - [ ] ✅ isValidUrl() 實現並通過邊界測試
  - [ ] ✅ removeTrackingParams() 支持 20+ 追蹤參數
  - [ ] ✅ normalizeInternationalDomain() 支持 IDN
  - [ ] ✅ followRedirects() 有 timeout 與 User-Agent
  - [ ] ✅ 所有函數有 JSDoc 註解

- [ ] **hash.ts 完整度**
  - [ ] ✅ stripTitle() 移除 HTML 實體與特殊字符
  - [ ] ✅ generateContentHash() 確定性驗證通過
  - [ ] ✅ createArticleSignature() 返回三個 hash
  - [ ] ✅ verifyHashDeterminism() 實現並返回 boolean
  - [ ] ✅ 所有函數有 JSDoc 註解

### 測試驗收

- [ ] **url.test.ts**
  - [ ] ✅ 18+ 個測試用例全部通過
  - [ ] ✅ 覆蓋率 ≥ 95%
  - [ ] npm run test --testPathPattern=url

- [ ] **hash.test.ts**
  - [ ] ✅ 12+ 個測試用例全部通過
  - [ ] ✅ 覆蓋率 ≥ 95%
  - [ ] ✅ npm run test --testPathPattern=hash

### 效能驗收

- [ ] **效能基準** (可用 jest.bench 或手動計時)
  - [ ] ✅ normalizeArticleUrl() < 5ms (1000 個 URL)
  - [ ] ✅ generateContentHash() < 2ms (1000 個呼叫)
  - [ ] ⚠️ followRedirects() 取決於網路 (通常 100-500ms)

### 集成驗收

- [ ] **與現有系統集成**
  - [ ] ✅ RSS adapter 能夠調用 normalizeArticleUrl()
  - [ ] ✅ RSS adapter 能夠調用 generateContentHash()
  - [ ] ✅ contentHash 正確儲存到資料庫
  - [ ] ✅ 手動測試：執行 `npm run seed:sources && npm run ingest:rss` 確認無錯誤

### 程式碼品質

- [ ] **TypeScript 品質**
  - [ ] ✅ 無 `any` 型別 (除非有正當理由且加 @ts-expect-error)
  - [ ] ✅ 通過 `npm run lint`
  - [ ] ✅ 通過 `npm run typecheck`

- [ ] **文件品質**
  - [ ] ✅ 所有函數有 JSDoc (含參數、返回值、用例)
  - [ ] ✅ 邊界情況都有文件說明
  - [ ] ✅ 範例程式碼正確可執行

---

## 🚀 執行流程 (Agent 應遵循)

### Step 1: 分析現狀 (5 分鐘)

```bash
# Agent 應先檢查：
1. cd /Users/chenyuan.chang/Workspace/morning-pulse
2. 讀取 apps/web/src/lib/utils/url.ts - 理解現有實現
3. 讀取 apps/web/src/lib/utils/hash.ts - 理解現有實現
4. 檢查是否已有測試檔案
5. 檢查 apps/web/prisma/schema.prisma 確認 contentHash 欄位存在
```

### Step 2: 補強實現 (60-90 分鐘)

**優先順序**:

1. **第一階段** (20-30 分鐘):
   - 修改 `url.ts`: 添加 `isValidUrl()`, 增強 `removeTrackingParams()`, 添加 `normalizeInternationalDomain()`
   - 修改 `hash.ts`: 改進 `stripTitle()`, 添加 `createArticleSignature()`, 添加 `verifyHashDeterminism()`
   - 確保所有函數都有完整 JSDoc

2. **第二階段** (30-40 分鐘):
   - 建立 `apps/web/src/lib/utils/__tests__/url.test.ts`
   - 建立 `apps/web/src/lib/utils/__tests__/hash.test.ts`
   - 編寫所有必要的測試用例

3. **第三階段** (10-20 分鐘):
   - 執行 `npm run test` 確保所有測試通過
   - 執行 `npm run lint` 和 `npm run typecheck`
   - 驗收清單檢查

### Step 3: 驗證與交付 (30-45 分鐘)

```bash
# Agent 應執行：
npm run test -- --testPathPattern="(url|hash)" --coverage
npm run lint
npm run typecheck

# 驗證集成：
npm run seed:sources
npm run ingest:rss  # 確認能正常執行
```

---

## 📊 成功指標

完成後，系統應能達到：

| 指標 | 目標 | 驗證方法 |
|------|------|---------|
| 測試通過率 | 100% | npm run test |
| 程式碼覆蓋 | ≥95% | npm run test -- --coverage |
| TypeScript 無誤 | 0 errors | npm run typecheck |
| Lint 無誤 | 0 errors | npm run lint |
| 效能 | URL 正規化 < 5ms | jest.bench 或手動計時 |
| 集成正常 | RSS ingest 無錯誤 | npm run ingest:rss |

---

## 💡 Agent 可用的工具與資源

### 可用命令

```bash
npm run dev              # 啟動開發伺服器
npm run test             # 執行所有測試
npm run lint             # Lint 檢查
npm run typecheck        # TypeScript 檢查
npm run seed:sources     # 填充測試 RSS 來源
npm run ingest:rss       # 手動觸發 RSS 擷取

cd apps/web && npx jest --testPathPattern="url|hash" --watch
```

### 參考資源

- 現有 URL 處理函數：`apps/web/src/lib/utils/url.ts`
- 現有 Hash 函數：`apps/web/src/lib/utils/hash.ts`
- Jest 測試範例：查看其他 `__tests__` 目錄
- Prisma Schema：`apps/web/prisma/schema.prisma` (確認 contentHash 欄位)
- RSS Adapter：`apps/web/src/lib/ingest/` (檢查如何呼叫這些函數)

---

## ⚠️ 特殊注意事項

1. **HTTP Redirect 處理**: `followRedirects()` 涉及網路呼叫，應該：
   - 添加 timeout 防止卡住
   - 添加 User-Agent 防止被拒絕
   - 在測試中 mock 網路呼叫 (使用 jest.mock 或 nock)

2. **IDN 轉換**: 使用原生 JavaScript `URL` API 的 `toASCII()` (或 `punycode` 模組)

3. **雜湊確定性**: 重點！必須確保同輸入 = 同輸出，用於資料庫去重

4. **效能考慮**: 這些函數會被 RSS adapter 頻繁呼叫（每次抓取可能 100+ 文章），需要確保快速

---

## 🎁 交付檔案清單

完成後應提交：

```
modified:   apps/web/src/lib/utils/url.ts (增強版本)
modified:   apps/web/src/lib/utils/hash.ts (增強版本)
new file:   apps/web/src/lib/utils/__tests__/url.test.ts
new file:   apps/web/src/lib/utils/__tests__/hash.test.ts
(可選) updated: apps/web/src/lib/ingest/rss-adapter.ts (如果需要整合)
```

---

## 📞 常見問題 & 故障排除

**Q: 我需要追蹤哪些參數？**  
A: 至少這些：`utm_*`, `fbclid`, `gclid`, `msclkid`, `_ga`, `mc_*`, `igshid`, `rss_*`。見上面的完整列表。

**Q: 我應該跟隨所有重定向嗎？**  
A: 是的，但要設定 maxRedirects=5 與 timeout=5000ms 防止無限循環。

**Q: 我應該在客戶端還是伺服器端執行 followRedirects？**  
A: 伺服器端 (Next.js API route 或 server action)。客戶端無法執行因為跨域限制。

**Q: Hash 需要多長？**  
A: SHA256 = 64 字符 (16 進位)。MD5 = 32 字符。通常 SHA256 用於主要存儲。

---

## 🏁 最後檢查清單

Agent 完成前，請確認：

- [ ] 所有 url.ts 函數實現完成
- [ ] 所有 hash.ts 函數實現完成
- [ ] url.test.ts 有 18+ 個通過的測試
- [ ] hash.test.ts 有 12+ 個通過的測試
- [ ] 程式碼覆蓋率 ≥ 95%
- [ ] npm run lint 無錯誤
- [ ] npm run typecheck 無錯誤
- [ ] npm run test 所有測試通過
- [ ] npm run ingest:rss 能夠正常執行
- [ ] 所有函數都有完整的 JSDoc 文件
- [ ] 提交 git commit 並準備好 PR
