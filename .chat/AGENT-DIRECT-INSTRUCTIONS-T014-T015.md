# 🤖 給 Claude Agent 的直接指示

**任務**: 實現 MorningPulse 的 URL 正規化與內容雜湊功能 (T014, T015)

---

## 📌 快速摘要

你的任務是在現有的基礎上，**增強和測試** URL 正規化和內容雜湊工具，使 MorningPulse 能夠正確進行文章去重。

**預期時間**: 2-3 小時  
**成功標準**: 所有測試通過 + 95%+ 程式碼覆蓋率 + npm run lint/typecheck 無錯誤

---

## 🔍 Step 1: 檢查現狀 (5 分鐘)

進入專案目錄：
```bash
cd /Users/chenyuan.chang/Workspace/morning-pulse
```

讀取現有檔案：
1. `apps/web/src/lib/utils/url.ts` - 檢查現有 URL 處理函數
2. `apps/web/src/lib/utils/hash.ts` - 檢查現有 hash 函數
3. `apps/web/prisma/schema.prisma` - 確認 contentHash 欄位存在

---

## 🛠️ Step 2: 補強實現 (60-90 分鐘)

### 2.1 增強 `apps/web/src/lib/utils/url.ts`

添加以下函數到現有程式碼中：

1. **`isValidUrl(url: string): boolean`**
   - 檢查 URL 是否為有效的 HTTP/HTTPS URL
   - 拒絕 javascript:, data:, file:// 等危險協議
   - 檢查 URL 長度 ≤ 2048 字符
   
2. **增強 `removeTrackingParams(url: string): string`**
   - 現有程式碼已有基礎，擴展追蹤參數列表至 20+：
     ```
     utm_*, fbclid, gclid, msclkid, _ga, mc_*, 
     igshid, sa_*, rss_*, ref, ref_src, t, 
     twclid, wbraid, gbraid, smart_id, smart_param
     ```
   - 添加重複參數去重邏輯 (e.g., `?a=1&a=2` → `?a=1`)

3. **`normalizeInternationalDomain(url: string): string`**
   - 使用 `URL` API 的 `toASCII()` 轉換國際化域名
   - 保持路徑與查詢字符串不變

4. **改進 `followRedirects(url: string, maxRedirects?: number, timeoutMs?: number): Promise<string>`**
   - 添加可配置 timeout（預設 5000ms）
   - 添加 User-Agent header
   - 處理循環重定向（相同 URL 出現 2 次則停止）
   - 返回 original URL 如果無法跟隨

所有函數都要加完整的 JSDoc 註解。

---

### 2.2 增強 `apps/web/src/lib/utils/hash.ts`

1. **改進 `stripTitle(title: string): string`**
   - 去除 HTML 實體 (`&amp;` → `&`)
   - 去除多語言特殊字符但保留意義
   - 去除常見新聞標題冗餘詞 ("新聞", "快訊", "[速報]" 等)

2. **`verifyHashDeterminism(url: string, title: string, iterations?: number): boolean`**
   - 驗證同輸入是否產生相同 hash（應有 100% 相同）

3. **`createArticleSignature(url: string, title: string, publishDate?: Date)`**
   - 返回物件包含：
     - `contentHash`: SHA256 雜湊 (64 字符)
     - `quickHash`: MD5 雜湊 (32 字符，用於快速比對)
     - `signature`: 合併的唯一識別符

所有函數都要加完整的 JSDoc 註解。

---

## 🧪 Step 3: 編寫測試 (30-40 分鐘)

### 3.1 創建 `apps/web/src/lib/utils/__tests__/url.test.ts`

編寫至少 18 個測試用例，測試覆蓋以下場景：

1. ✅ removeTrackingParams 移除 UTM 參數
2. ✅ removeTrackingParams 移除 fbclid
3. ✅ removeTrackingParams 移除 gclid
4. ✅ removeTrackingParams 保留合法參數
5. ✅ normalizeUrl 轉小寫 domain
6. ✅ normalizeUrl 移除 fragment
7. ✅ normalizeUrl 排序查詢參數
8. ✅ normalizeArticleUrl 完整管道
9. ✅ extractCanonicalUrl 從 link tag
10. ✅ extractCanonicalUrl 從 og:url
11. ✅ extractCanonicalUrl fallback
12. ✅ isValidUrl 接受有效 HTTP(S) URL
13. ✅ isValidUrl 拒絕 javascript:
14. ✅ isValidUrl 拒絕空字符串
15. ✅ normalizeInternationalDomain IDN 轉換
16. ✅ followRedirects 跟隨單一重定向（使用 mock）
17. ✅ followRedirects 停止循環重定向（使用 mock）
18. ✅ followRedirects timeout 返回原 URL（使用 mock）

使用 jest.mock 或 nock 來 mock HTTP 呼叫。

### 3.2 創建 `apps/web/src/lib/utils/__tests__/hash.test.ts`

編寫至少 12 個測試用例，測試覆蓋以下場景：

1. ✅ stripTitle 移除特殊字符
2. ✅ stripTitle 轉小寫
3. ✅ stripTitle 統一空白
4. ✅ generateContentHash 返回 64 字符 hex 字符串
5. ✅ generateContentHash 確定性（同輸入 = 同輸出）
6. ✅ generateContentHash 不同輸入 = 不同輸出
7. ✅ generateContentHash 大小寫不敏感
8. ✅ createArticleSignature 返回所有三個 hash
9. ✅ createArticleSignature contentHash 是 SHA256
10. ✅ createArticleSignature quickHash 是 MD5 (32 字符)
11. ✅ verifyHashDeterminism 100 次迭代相同
12. ✅ 邊界情況：空 URL、空標題、特殊字符

---

## ✅ Step 4: 驗證與測試 (20-30 分鐘)

執行以下命令確保所有通過：

```bash
# 執行所有相關測試
npm run test -- --testPathPattern="(url|hash)" --coverage

# Lint 檢查
npm run lint

# TypeScript 檢查
npm run typecheck

# 手動集成測試（確認能正常抓取）
npm run seed:sources
npm run ingest:rss
```

**成功標準**：
- ✅ 所有測試通過
- ✅ 覆蓋率 ≥ 95%
- ✅ 無 lint 錯誤
- ✅ 無 TypeScript 錯誤
- ✅ RSS ingest 無錯誤執行

---

## 📋 完成檢查清單

完成後，確認以下項目都是 ✅ 狀態：

### 功能實現
- [ ] ✅ isValidUrl() 已實現
- [ ] ✅ removeTrackingParams() 已增強至 20+ 參數
- [ ] ✅ normalizeInternationalDomain() 已實現
- [ ] ✅ followRedirects() 已改進（有 timeout、User-Agent、循環檢測）
- [ ] ✅ stripTitle() 已改進
- [ ] ✅ verifyHashDeterminism() 已實現
- [ ] ✅ createArticleSignature() 已實現

### 測試覆蓋
- [ ] ✅ url.test.ts 有 18+ 個通過的測試
- [ ] ✅ hash.test.ts 有 12+ 個通過的測試
- [ ] ✅ 總覆蓋率 ≥ 95%

### 程式碼品質
- [ ] ✅ npm run lint 無錯誤
- [ ] ✅ npm run typecheck 無錯誤
- [ ] ✅ 所有函數都有完整 JSDoc 註解

### 集成測試
- [ ] ✅ npm run test 所有測試通過
- [ ] ✅ npm run seed:sources 成功
- [ ] ✅ npm run ingest:rss 成功（無錯誤）

### 交付物
- [ ] ✅ apps/web/src/lib/utils/url.ts (已修改)
- [ ] ✅ apps/web/src/lib/utils/hash.ts (已修改)
- [ ] ✅ apps/web/src/lib/utils/__tests__/url.test.ts (新建)
- [ ] ✅ apps/web/src/lib/utils/__tests__/hash.test.ts (新建)

---

## 💡 提示與注意事項

1. **HTTP Redirect 測試**: 使用 jest.mock 模擬 fetch，不要實際發送網路請求
2. **IDN 轉換**: JavaScript URL API 原生支持，直接使用即可
3. **效能目標**: 單次 normalizeArticleUrl() < 5ms，generateContentHash() < 2ms
4. **雜湊確定性**: 這是 Critical！必須確保同輸入 = 同輸出
5. **參數去重**: 重複的查詢參數（如 `?a=1&a=2`）應保留第一個，移除其餘

---

## 🎯 如果遇到困難

1. **無法找到檔案**: 從 `/Users/chenyuan.chang/Workspace/morning-pulse` 開始
2. **測試 mock 問題**: 參考 Jest 官方文檔關於 `jest.mock` 和 `jest.spyOn`
3. **TypeScript 型別錯誤**: 檢查 `tsconfig.json` 配置，確保 lib 包含適當版本

---

## 📞 最終檢查

完成後，執行最終驗證：

```bash
# 完整測試套
npm run test -- --coverage --testPathPattern="(url|hash)"

# 確認品質
npm run lint && npm run typecheck

# 確認集成
npm run seed:sources && npm run ingest:rss

echo "✅ All checks passed! Ready to move to T016 (RSS Adapter)"
```

如果所有檢查都通過，🎉 任務完成！接下來可以進行 T016-T018（RSS 適配器）。
