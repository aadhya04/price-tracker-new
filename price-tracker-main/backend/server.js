require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { searchProducts } = require("./scraper/storeSearch");

const {
    runScraper,
    runScraperForProduct
} = require("./scraper/scraper");

let scrapeRunning = false;

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Product Price Tracker API is running"
    });
});

const PORT = process.env.PORT || 5000;
const supabase = require("./database/supabase");

app.get("/api/products", async (req, res) => {
    const { data, error } = await supabase
        .from("tracked_products")
        .select("id, product_name, product_url, created_at")
        .order("created_at", { ascending: false });

    if (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }

    res.json({
        success: true,
        data: data
    });
});



app.get("/api/products/:id/history", async (req, res) => {
    const productId = req.params.id;

    const { data, error } = await supabase
        .from("price_history")
        .select("id, price, stock_status, stock_quantity, scraped_at")
        .eq("product_id", productId)
        .order("scraped_at", { ascending: false });

    if (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }

    res.json({
        success: true,
        data: data
    });
});

app.get("/api/products/:id/logs", async (req, res) => {
    const productId = req.params.id;

    const { data, error } = await supabase
        .from("scrape_logs")
        .select("id, attempt_number, status, error_message, scraped_at")
        .eq("product_id", productId)
        .order("scraped_at", { ascending: false });

    if (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }

    res.json({
        success: true,
        data: data
    });
});

app.post("/api/scrape/:id", (req, res) => {
    const productId = req.params.id;

    if (scrapeRunning) {
        return res.status(409).json({
            success: false,
            message: "A scrape is already running."
        });
    }

    scrapeRunning = true;

    console.log(
        `Scrape requested for product: ${productId}`
    );

    res.status(202).json({
        success: true,
        message: "Scraping started."
    });

    runScraperForProduct(productId)
        .then(() => {
            console.log(
                "Product scraping finished successfully."
            );
        })
        .catch((error) => {
            console.error(
                "Product scraping failed:",
                error.message
            );
        })
        .finally(() => {
            scrapeRunning = false;
        });
});
app.post("/api/cron/scrape", (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.get("x-cron-secret") !== secret) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    if (scrapeRunning) {
        return res.status(409).json({ success: false, message: "A scrape is already running." });
    }
    scrapeRunning = true;
    res.status(202).json({ success: true, message: "Scrape-all started." });
    runScraper()
        .catch((e) => console.error("Scrape-all failed:", e.message))
        .finally(() => { scrapeRunning = false; });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/api/search-products", async (req, res) => {
    const query = req.query.query;

    if (!query || !query.trim()) {
        return res.status(400).json({
            success: false,
            error: "Search query is required"
        });
    }

    try {
        const result = await searchProducts(query);

        res.json({
            success: true,
            data: result.products,
            skippedPages: result.skippedPages
        });
    } catch (error) {
        console.error("Product search failed:", error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post("/api/products", async (req, res) => {
    const { product_name, product_url } = req.body;

    if (!product_name || !product_url) {
        return res.status(400).json({
            success: false,
            error: "product_name and product_url are required"
        });
    }

    try {
        const { data: existingProduct, error: checkError } =
            await supabase
                .from("tracked_products")
                .select("id, product_name, product_url, created_at")
                .eq("product_url", product_url)
                .limit(1);

        if (checkError) {
            return res.status(500).json({
                success: false,
                error: checkError.message
            });
        }

        if (existingProduct && existingProduct.length > 0) {
            return res.status(409).json({
                success: false,
                error: "Product is already being tracked",
                data: existingProduct[0]
            });
        }

        const { data, error } = await supabase
            .from("tracked_products")
            .insert({
                product_name: product_name,
                product_url: product_url
            })
            .select()
            .single();

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        res.status(201).json({
            success: true,
            message: "Product added for tracking",
            data: data
        });
    } catch (error) {
        console.error("Track product failed:", error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});