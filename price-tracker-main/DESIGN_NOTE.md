# Design note
**Reliability:** each attempt uses a fresh browser and up to 2 page loads. Instead of one check for the Reveal button,
the scraper polls until the price appears, clicking the button whenever it is visible and enabled. Up to 3 attempts per
product; every attempt is logged as retried/failed/success. Data is saved only if price > 0 and stock text parses;
otherwise nothing is written to price_history. One product failing never stops the others.
**Scheduling:** external cron hits a secret-protected endpoint (no in-process timer, since free tier sleeps); a lock
prevents overlapping runs.
**Trade-off:** Playwright is used because the price is hidden behind a click; it is heavier than HTTP fetching and needs Docker on Render.
**AI mistakes:** TODO - write your own: e.g. first scraper checked the Reveal button once and read the first ₹ on the page; fixed by polling and scoping to `.price-block`.
