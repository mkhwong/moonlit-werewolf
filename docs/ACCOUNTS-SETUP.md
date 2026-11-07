# 個人帳戶設定（Google 登入 + Google Sheet）

未設定之前，遊戲照常運作（只有訪客）。設定好以下環境變數後，主頁會出現「用 Google 登入」。

## 1. 建立試算表
1. 喺 Google Drive 開一個新嘅 Google Sheet，例如「月夜狼人殺 帳戶」。
2. 由網址複製 ID：`https://docs.google.com/spreadsheets/d/<呢段就係ID>/edit`
3. 伺服器會自動開一個叫「帳戶」嘅分頁，欄位：Google ID｜Email｜暱稱｜個人簡介｜勝｜負｜總局數｜勝率｜最後遊戲｜建立日期。

## 2. Google Cloud（console.cloud.google.com）
1. 新增一個專案（例如 moonlit-werewolf）。
2. 「API 和服務 → 程式庫」：啟用 **Google Sheets API**。
3. 「OAuth 同意畫面」：選「外部」，填 App 名稱同你嘅電郵，發佈（Publish）。
4. 「憑證 → 建立憑證 → OAuth 用戶端 ID」：類型「網頁應用程式」。
   - 已授權的 JavaScript 來源：`https://moonlit-werewolf.onrender.com`（本機測試可加 `http://localhost:3000`）
   - 複製「用戶端 ID」（xxxx.apps.googleusercontent.com）。
5. 「憑證 → 建立憑證 → 服務帳戶」：建立後入去「金鑰 → 新增金鑰 → JSON」，下載 JSON 檔。
6. 返去個 Google Sheet → 共用 → 加入服務帳戶嘅 email（JSON 入面 `client_email`）做「編輯者」。

## 3. Render → moonlit-werewolf → Environment
| 變數 | 值 |
|---|---|
| `GOOGLE_CLIENT_ID` | 第 2.4 步嘅用戶端 ID |
| `GOOGLE_SHEET_ID` | 第 1 步嘅試算表 ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 第 2.5 步 JSON 檔嘅全部內容（成段貼上） |
| `SESSION_SECRET` | 任意一長串亂碼（令重啟後唔使重新登入） |

儲存後 Render 會自動重新部署。打開 `https://moonlit-werewolf.onrender.com/healthz`，`"accounts":"sheet"` 即代表成功（`memory` = 未連到試算表，`off` = 未設 Client ID）。

## 規則
- 每局完場，每個已登入嘅真人玩家記一勝或一負（情侶勝利只計第三方）。
- 測試模式（有電腦玩家）嘅局唔計。
- 你可以直接喺試算表改暱稱／簡介／勝負，伺服器每 5 分鐘重新讀取一次。
