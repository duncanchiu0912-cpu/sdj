# 發票存摺 Pro

繁體中文的會員制電商收據／發票管理系統。採 React + Vite 前端、Node.js + Express API、Prisma + SQLite 資料庫。支援會員註冊登入、消費管理、搜尋篩選、趨勢圖表，以及相機拍攝／上傳收據圖片後在瀏覽器端以 OCR 辨識。

## 開發環境

需求：Node.js 20 或更新版本、npm。

```bash
npm install
```

建立根目錄 `.env`（正式環境請使用長且隨機的密鑰）：

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="請換成至少32字元的隨機密鑰"
```

初始化本機 SQLite 資料庫並啟動前後端：

```bash
npm run db:push
npm run dev
```

開啟 Vite 顯示的網址（預設 `http://localhost:5173`）。API 預設埠為 `3001`。首次建立帳號即可使用；密碼使用 bcrypt 雜湊，登入狀態存於 HttpOnly Cookie。開發資料庫預設為 `server/prisma/dev.db`，可用 `npm run db:studio` 檢視。

## 收據掃描

「掃描收據」會開啟手機相機／圖片選擇器，透過 Tesseract.js 在瀏覽器進行繁體中文與英文 OCR。系統嘗試擷取發票號碼、日期、店家及總額，然後填入消費表單讓使用者核對再存入資料庫。OCR 會受照片品質、字體、收據版型影響，不保證完全正確；圖片不會上傳伺服器。首次掃描需要下載辨識模型。相機功能建議使用 HTTPS 或 localhost。

## 功能

- 會員註冊、登入與登出；資料由使用者帳號隔離
- 新增、編輯、刪除與搜尋發票、收據及網購消費
- 月支出、累計消費、平均金額與消費筆數
- 月消費趨勢圖、類別支出圓餅圖及篩選
- 手機相機拍照或上傳圖片 OCR，辨識結果核對後儲存
- SQLite 本機資料庫；可於正式部署替換 Prisma datasource 為 PostgreSQL

## 安全與正式部署注意

- 設定強隨機 `JWT_SECRET`，正式環境使用 HTTPS，並設定 `NODE_ENV=production`。
- SQLite 適合本機與小型示範。正式多人服務建議改用 PostgreSQL、備份資料庫並設定監控。
- OCR 使用者端處理；瀏覽器會從 Tesseract.js CDN 載入語言模型。請確認部署網路政策允許載入相依的 worker/model。
- 目前是收據 OCR 輔助記帳，不會直接登入或串接財政部電子發票平台，也不會自動驗證發票真偽或兌獎。

## React / Vue / Node.js

目前提供 React + Node.js 可執行版本。API 與 UI 分離；Vue 前端可沿用相同 `/api/auth` 和 `/api/invoices` REST API 另行實作，不需要更動資料庫或登入服務。
