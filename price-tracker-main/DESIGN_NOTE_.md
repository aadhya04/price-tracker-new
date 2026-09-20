Design Note

1. Approach

The main part of this project was making the scraper work when the mock store does not respond immediately.

I used Playwright because the product page has dynamic content. The scraper opens the product page, waits for the required elements, gets the price and stock status, and stores the result in Supabase.

The Express backend handles API requests and controls the scraper. Supabase stores products, price history and scrape logs.

1.5. Application Flow

The overall flow of the application is:

User
  |
  v
Frontend
  |
  | Search product
  v
Express Backend
  |
  v
Mock Store
  |
  | Product page
  v
Playwright Scraper
  |
  +----> Reveal price
  |
  +----> Get price
  |
  +----> Get stock
  |
  v
Scrape successful?
  |
  +---- No ----> Retry (up to 3 attempts)
  |                 |
  |                 v
  |            Scrape Logs
  |
  +---- Yes ---> Supabase
                   |
                   +--> Price History
                   |
                   +--> Scrape Logs
                   |
                   v
                Frontend

## 2. Handling Slow and Failed Responses

The price is not always available immediately.

The "Reveal price" button can initially be disabled, so the scraper waits for the required state before trying to click it.

If something still goes wrong, the scraper does not stop after the first attempt. Each product gets up to 3 attempts.

Every failed attempt is saved in the scrape logs, including the error message and attempt number.

## 3. Retry Logic

Retries are useful because the mock store can sometimes respond slowly.

Without retries, a temporary timeout could make a scrape fail even though the page might work a few seconds later.

I used 3 attempts with a short delay between attempts. This gives the scraper a chance to recover without keeping the browser open indefinitely.

## 4. Price and Stock Extraction

After the price becomes available, the scraper reads the page text and extracts the price.

The stock status is read separately from the stock element.

The scraper checks that the required information is present before treating the scrape as successful.

The result is then saved to the price history table.

## 5. Logging

I used a separate scrape log table instead of storing only successful results.

The logs contain:

- Attempt number
- Status
- Error message
- Time of the attempt
- Product ID

This makes it easier to understand what happened when a scrape fails.

## 6. Render and Cron Job

The backend is deployed on Render.

The free Render service can go to sleep when it is not being used, so I used an external cron job that sends a request every 10 minutes to keep the backend awake.

The 10-minute cron job is only for keeping Render awake. It is not a 2-hour product scraping schedule.

This was a practical deployment decision because the deployed backend needed to stay available for testing.

## 7. Trade-offs

One trade-off was between waiting longer and retrying.

A very long timeout can make one failed scrape take a lot of time. A very short timeout can cause the scraper to fail when the website is only temporarily slow.

I used waits for important page states and retries for failures.

I also chose Playwright instead of a simple HTTP request because the product page has dynamic content and the price requires interaction with the page. Playwright uses more resources, but it fits the behaviour of the mock store.

## 8. Testing

I tested the scraper locally in headed mode so I could see what Playwright was doing.

I also tested the deployed scraper on Render.

During testing, I found a difference between the local and deployed environments. The "Reveal price" button could be found on Render, but it remained disabled for longer than expected.

I added logging to check:

- Whether the button existed
- Whether it was disabled
- Its HTML
- Whether its state changed after waiting

The retry system then handled the failed attempts and recorded them in the scrape logs.

## 9. What Went Wrong With AI-Generated Suggestions

I used AI as a development aid, but I did not treat the first suggestion as the final solution.

Some initial suggestions assumed that the "Reveal price" button would become available after a short wait. Increasing the timeout alone did not solve the issue on the deployed environment.

I tested the suggestions instead of assuming they were correct.

I added extra logging to understand what was actually happening on the page. This helped identify the difference between the local and deployed scraper behaviour.

The main lesson was that browser automation needs to be tested against the real page and environment instead of assuming that a suggested solution will work immediately.

## 10. Final Design

The application has three main parts:

1. Frontend for searching and tracking products.
2. Express backend for API requests and scraper control.
3. Supabase database for products, price history and scrape logs.

Playwright handles the actual scraping.

The frontend is deployed on Vercel, the backend on Render, and the database on Supabase.
