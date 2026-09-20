const { chromium } = require("playwright");

const STORE_URL = "https://demo.inelabteamdev.com";
const TOTAL_PAGES = 50;
const MAX_PAGE_ATTEMPTS = 3;

async function loadStorePage(page, url, pageNumber) {
    for (let attempt = 1; attempt <= MAX_PAGE_ATTEMPTS; attempt++) {
        try {
            console.log(
                `Searching store page ${pageNumber} (attempt ${attempt})...`
            );

            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: 30000
            });

            await page.waitForSelector("article.tile", {
                timeout: 10000
            });

            return true;
        } catch (error) {
            console.log(
                `Page ${pageNumber} attempt ${attempt} failed: ${error.message}`
            );

            if (attempt < MAX_PAGE_ATTEMPTS) {
                console.log("Retrying page...");
                await new Promise(resolve =>
                    setTimeout(resolve, 2000)
                );
            }
        }
    }

    return false;
}

async function searchProducts(query) {
    const browser = await chromium.launch({
        headless: true
    });

    const page = await browser.newPage();

    const searchText = query.trim().toLowerCase();

    if (!searchText) {
        await browser.close();

        return {
            products: [],
            skippedPages: []
        };
    }

    const results = [];
    const skippedPages = [];

    try {
        for (let pageNumber = 1; pageNumber <= TOTAL_PAGES; pageNumber++) {
            const url =
                pageNumber === 1
                    ? STORE_URL
                    : `${STORE_URL}/?page=${pageNumber}`;

            const pageLoaded = await loadStorePage(
                page,
                url,
                pageNumber
            );

            if (!pageLoaded) {
                console.log(
                    `Skipping page ${pageNumber} after ${MAX_PAGE_ATTEMPTS} attempts.`
                );

                skippedPages.push(pageNumber);
                continue;
            }

            const products = await page.locator("article.tile").evaluateAll(
                cards =>
                    cards.map(card => ({
                        name:
                            card
                                .querySelector(".tile-name")
                                ?.textContent
                                ?.trim() || "",

                        brand:
                            card
                                .querySelector(".tile-brand")
                                ?.textContent
                                ?.trim() || "",

                        sku:
                            card
                                .querySelector(".tile-sku")
                                ?.textContent
                                ?.trim() || ""
                    }))
            );

            for (let i = 0; i < products.length; i++) {
                const product = products[i];

                if (
                    product.name &&
                    product.name.toLowerCase().includes(searchText)
                ) {
                    console.log(`Match found: ${product.name}`);

                    const card = page
                        .locator("article.tile")
                        .nth(i);
                    
                    try {
    await Promise.all([
        page.waitForURL("**/product/**", {
            timeout: 10000
        }),
        card.locator("button.tile-cta").click()
    ]);

    const productUrl = page.url();

    const alreadyFound = results.some(
        item => item.product_url === productUrl
    );

    if (!alreadyFound) {
        results.push({
            product_name: product.name,
            product_url: productUrl,
            brand: product.brand,
            sku: product.sku
        });
    }
} catch (error) {
    console.log(
        `Could not open ${product.name}: ${error.message}`
    );
}
                    
                    const returnedToStore = await loadStorePage(
                        page,
                        url,
                        pageNumber
                    );

                    if (!returnedToStore) {
                        console.log(
                            `Could not return to page ${pageNumber}.`
                        );

                        skippedPages.push(pageNumber);
                        break;
                    }
                }
            }
        }

        return {
            products: results,
            skippedPages: [...new Set(skippedPages)]
        };
    } finally {
        await browser.close();
    }
}

module.exports = {
    searchProducts
};