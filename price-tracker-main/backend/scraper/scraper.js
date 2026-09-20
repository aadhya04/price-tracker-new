require("dotenv").config();
const { chromium } = require("playwright");
const {
    saveScrape,
    saveScrapeLog
} = require("../database/saveScrape");
const supabase = require("../database/supabase");

async function getTrackedProduct(productId) {

    const productUrl =
        `https://demo.inelabteamdev.com/product/${productId}`;

    console.log("Looking for URL:", productUrl);

    const { data, error } = await supabase
        .from("tracked_products")
        .select("id, product_name, product_url")
        .eq("product_url", productUrl.trim())
        .limit(1);

    if (error) {
        throw new Error(
            `Tracked product lookup failed: ${error.message}`
        );
    }

    if (!data || data.length === 0) {
        throw new Error(
            `No tracked product found for URL: ${productUrl}`
        );
    }

    return data[0];
}

const PRICE_RE = /₹\s*([\d,]+(?:\.\d+)?)/;

function parseStock(raw) {
    const text = (raw || "").trim();
    if (!text) throw new Error("Stock text is empty");
    if (/out of stock|sold out|unavailable/i.test(text)) {
        return { status: "out_of_stock", quantity: 0 };
    }
    const qty = text.match(/(\d+)/);
    if (/in stock|left|available/i.test(text) || qty) {
        return { status: "in_stock", quantity: qty ? Number(qty[1]) : null };
    }
    throw new Error(`Unrecognised stock text: "${text}"`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The store only works after cookies are accepted. Match by text (not role)
// because the banner button was not found by role, and wait for it to render.
async function acceptCookies(page, ms = 10000) {
    const accept = page.getByText(/^\s*accept\s*$/i).first();
    try {
        await accept.waitFor({ state: "visible", timeout: ms });
        await accept.click({ timeout: 3000 });
        console.log("Cookie banner accepted");
        await sleep(800);
        return true;
    } catch {
        console.log("Cookie banner not found (or already accepted)");
        return false;
    }
}

// Human-like reveal: enter the price area, dwell until the button enables,
// glide to it, and click ONCE (repeated clicks made the store fail its challenge).
async function humanReveal(page, block, btn) {
    await btn.waitFor({ state: "visible", timeout: 10000 });
    const box = await block.boundingBox();
    if (!box) throw new Error("Price block not found");

    await page.mouse.move(box.x + 8, box.y + 8);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });

    // The store wants continued mouse movement over the price area,
    // so keep moving inside the block until the button enables.
    let enabled = false;
    for (let i = 0; i < 80 && !enabled; i++) {
        enabled = await btn.isEnabled().catch(() => false);
        if (!enabled) {
            if (i % 8 === 0) await acceptCookies(page, 300);
            const x = box.x + box.width * (0.2 + Math.random() * 0.6);
            const y = box.y + box.height * (0.2 + Math.random() * 0.6);
            await page.mouse.move(x, y, { steps: 6 });
            await sleep(250);
        }
    }
    if (!enabled) throw new Error("Reveal button never became enabled");

    await sleep(600 + Math.random() * 600);
    const bb = await btn.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 12 });
    await sleep(300);
    console.log("Clicking Reveal price (once)...");
    await page.mouse.down();
    await sleep(90);
    await page.mouse.up();
}

async function waitForPrice(page, block, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        let text = await block.innerText({ timeout: 1000 }).catch(() => "");
        if (PRICE_RE.test(text)) return text;
        const retry = page.getByRole("button", { name: /try again/i });
        if (await retry.isVisible().catch(() => false)) return "STORE_ERROR";
        await sleep(500);
    }
    return null;
}

// One attempt: fresh browser, up to 2 page loads, up to 2 reveal tries each.
async function scrapeOnce(productId) {
    const headless = process.env.HEADLESS !== "false";
    const browser = await chromium.launch({ headless, slowMo: 0 });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    try {
        const url = `https://demo.inelabteamdev.com/product/${productId}`;
        const block = page.locator(".price-block").first();
        const btn = page.getByRole("button", { name: /reveal price/i }).first();
        let priceText = null;

        for (let load = 1; load <= 2 && !priceText; load++) {
            console.log(`Opening (load ${load}): ${url}`);
            try {
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
            } catch (e) {
                console.log(`Load ${load} failed: ${e.message}`);
                continue;
            }
            await sleep(2000);
            await acceptCookies(page);

            for (let tryNo = 1; tryNo <= 2 && !priceText; tryNo++) {
                try {
                    if ((await btn.count()) > 0) {
                        await humanReveal(page, block, btn);
                    }
                    const res = await waitForPrice(page, block, 25000);
                    if (res === "STORE_ERROR") {
                        console.log("Store showed an error (challenge_failed), clicking Try again");
                        await page.getByRole("button", { name: /try again/i })
                            .click({ timeout: 3000 }).catch(() => {});
                        await sleep(1500);
                    } else if (res) {
                        priceText = res;
                    }
                } catch (e) {
                    console.log(`Reveal try ${tryNo} failed: ${e.message}`);
                }
            }
            if (!priceText) console.log(`No price after load ${load}, reloading...`);
        }

        if (!priceText) {
            await page.screenshot({ path: "debug-fail.png", fullPage: true }).catch(() => {});
            require("fs").writeFileSync("debug-fail.html", await page.content().catch(() => ""));
            throw new Error("Price did not appear (reveal button/price block never ready)");
        }

        const price = Number(PRICE_RE.exec(priceText)[1].replace(/,/g, ""));
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error(`Invalid price extracted: ${priceText}`);
        }

        const badge = page.locator(".stock-badge").first();
        await badge.waitFor({ state: "visible", timeout: 10000 });
        const stock = parseStock(await badge.innerText());

        return { productId, price, stock };
    } finally {
        await browser.close();
    }
}

async function scrapeWithRetry(productId, productUuid) {

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {

        console.log(`\n========== ATTEMPT ${attempt} ==========`);

        try {

            const result = await scrapeOnce(productId);

            console.log("Scrape successful!");

            return {
                success: true,
                attempt,
                data: result
            };

        } catch (error) {

            console.log(
                `Attempt ${attempt} failed: ${error.message}`
            );

            const status =
                attempt < maxAttempts ? "retried" : "failed";

            try {

                await saveScrapeLog(
                    productUuid,
                    attempt,
                    status,
                    error.message
                );

            } catch (logError) {

                console.error(
                    "Could not save scrape log:",
                    logError.message
                );
            }

            if (attempt < maxAttempts) {

                console.log("Retrying...");

                await new Promise(
                    resolve => setTimeout(resolve, 2000)
                );
            }
        }
    }

    return {
        success: false,
        attempt: maxAttempts,
        data: null
    };
}

async function getTrackedProducts() {
    const { data, error } = await supabase
        .from("tracked_products")
        .select("id, product_name, product_url");

    if (error) {
        throw new Error(
            `Tracked products lookup failed: ${error.message}`
        );
    }

    return data || [];
}


async function runScraper() {
    const products = await getTrackedProducts();

    if (products.length === 0) {
        console.log("No tracked products found.");
        return;
    }

    console.log(
        `Found ${products.length} tracked product(s).`
    );

    for (const product of products) {
        console.log("\n=================================");
        console.log(
            `Scraping: ${product.product_name}`
        );
        console.log("=================================");

        const match = product.product_url.match(
            /\/product\/(\d+)/
        );

        if (!match) {
            console.log(
                "Could not find product ID from URL. Skipping."
            );
            continue;
        }

        const productId = Number(match[1]);

        const result = await scrapeWithRetry(
            productId,
            product.id
        );

        console.log("\nFinal result:");

        if (!result.success) {
            console.log(
                `Scraping failed for ${product.product_name}`
            );
            continue;
        }

        console.log(result.data);

        try {
            await saveScrape(product.id, result.data, result.attempt);
        } catch (e) {
            console.error("Save failed:", e.message);
        }
    }
}

if (require.main === module) {
    runScraper()
        .catch((error) => {
            console.error(
                "Unexpected error:",
                error.message
            );
        });
}

async function runScraperForProduct(productUuid) {
    const { data, error } = await supabase
        .from("tracked_products")
        .select("id, product_name, product_url")
        .eq("id", productUuid)
        .limit(1);

    if (error) {
        throw new Error(
            `Product lookup failed: ${error.message}`
        );
    }

    if (!data || data.length === 0) {
        throw new Error("Tracked product not found");
    }

    const product = data[0];

    console.log("\n=================================");
    console.log(`Scraping: ${product.product_name}`);
    console.log("=================================");

    const match = product.product_url.match(
        /\/product\/(\d+)/
    );

    if (!match) {
        throw new Error(
            "Could not find product ID from URL."
        );
    }

    const productId = Number(match[1]);

    const result = await scrapeWithRetry(
        productId,
        product.id
    );

    if (!result.success) {
        throw new Error(
            `Scraping failed for ${product.product_name}`
        );
    }

    console.log("\nFinal result:");
    console.log(result.data);

    await saveScrape(
        product.id,
        result.data,
        result.attempt
    );

    return result.data;
}


module.exports = {
    runScraper,
    runScraperForProduct
};