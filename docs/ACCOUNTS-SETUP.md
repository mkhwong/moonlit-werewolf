# 個人帳戶設定（Google 登入 + Google Drive 資料夾）

未設定之前，遊戲照常運作（只有訪客）。設定好之後：
- 主頁有「用 Google 登入」，玩家可以改暱稱、個人簡介、上載頭像。
- 伺服器會喺**你嘅** Google Drive 開一個「月夜狼人殺」資料夾，入面有：
  - 「月夜狼人殺 帳戶」試算表（分頁「帳戶」：Google ID｜Email｜暱稱｜個人簡介｜勝｜負｜總局數｜勝率｜最後遊戲｜建立日期｜頭像檔案ID）
  - 每個玩家上載嘅頭像（頭像-暱稱-xxxxxx.jpg）
- 伺服器只用 `drive.file` 權限：只睇到佢自己開嘅檔案，睇唔到你 Drive 其他嘢。

## 1. Google Cloud（console.cloud.google.com）
1. 新增專案（例如 moonlit-werewolf）。
2. 「API 和服務 → 程式庫」：啟用 **Google Drive API** 同 **Google Sheets API**。
3. 「OAuth 同意畫面」：User type 揀「外部」，填 App 名稱（月夜狼人殺）同你嘅電郵。
   範圍唔使加（登入用 openid/email/profile，Drive 用 drive.file，全部係非敏感範圍）。
   最後撳「發佈應用程式」→ 狀態變「正式版 (In production)」。
   ⚠️ 留喺「測試」狀態嘅話，Drive 授權 7 日後會失效。
4. 「憑證 → 建立憑證 → OAuth 用戶端 ID」，類型「網頁應用程式」：
   - 已授權的 JavaScript 來源：`https://moonlit-werewolf.onrender.com`
   - 已授權的重新導向 URI：`https://moonlit-werewolf.onrender.com/admin/google/callback`
   - 建立後複製「用戶端 ID」同「用戶端密鑰」。

## 2. Render → moonlit-werewolf → Environment
| 變數 | 值 |
|---|---|
| `GOOGLE_CLIENT_ID` | 用戶端 ID（xxxx.apps.googleusercontent.com） |
| `GOOGLE_CLIENT_SECRET` | 用戶端密鑰 |
| `ADMIN_KEY` | 你自己諗一個密碼（只用嚟開下面第 3 步嘅連結） |
| `SESSION_SECRET` | 撳 Render 嘅「Generate」產生亂碼 |

儲存，等 Render 重新部署完。

## 3. 連接你嘅 Google Drive（一次）
1. 打開 `https://moonlit-werewolf.onrender.com/admin/google?key=<你嘅ADMIN_KEY>`
2. 用你自己（Drive 擁有者）嘅 Google 帳戶登入，按「允許」。
3. 頁面會顯示一段 refresh token → 喺 Render 新增 `GOOGLE_REFRESH_TOKEN` = 呢段。
   （唔加都即刻用得，但伺服器重啟後會變返只存喺記憶體。）
4. 打開 `https://moonlit-werewolf.onrender.com/healthz`：`"accounts":"sheet"` = 成功；
   `memory` = 未連接 Drive；`error` = 連接失敗（睇 Render log）；`off` = 未設 Client ID。

## 規則
- 每局完場，每個已登入嘅真人玩家記一勝或一負（情侶勝利只計第三方）。
- 測試模式（有電腦玩家）嘅局唔計。
- 你可以直接喺試算表改暱稱／簡介／勝負，伺服器每 5 分鐘重新讀取一次。
- 唔好改資料夾／試算表嘅名都冇問題（伺服器用隱藏標籤搵返佢哋），但唔好刪除。
