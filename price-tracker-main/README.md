# Product Price Tracker
React (Vercel) + Express/Playwright (Render, Docker) + Supabase. Scrapes INE's mock store every 2 hours.

## Setup
1. Supabase SQL editor: create `tracked_products`, `price_history`, `scrape_logs`, then
   `alter table price_history add column stock_quantity int;`
2. `cd backend && npm i && npx playwright install chromium`, copy `.env.example` to `.env`, `npm run dev`
3. `cd frontend && npm i && npm run dev`

## Environment variables
Backend: `SUPABASE_URL`, `SUPABASE_KEY` (service_role), `CRON_SECRET`, `HEADLESS` (`false` = watch the browser), `PORT`
Frontend: `VITE_API_URL` (backend URL)

## Schedule
cron-job.org calls `POST <backend>/api/cron/scrape` with header `x-cron-secret: <CRON_SECRET>` every 2 hours
(cron `0 */2 * * *`). It returns 202 immediately and scrapes in the background. A second job hitting `/health`
every 10 min keeps Render awake.

## Headed run
`cd backend && HEADLESS=false node scraper/scraper.js` (Windows PowerShell: `$env:HEADLESS="false"; node scraper/scraper.js`)
