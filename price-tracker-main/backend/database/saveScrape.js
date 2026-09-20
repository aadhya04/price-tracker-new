const supabase = require("./supabase");

async function saveScrapeLog(productUuid, attempt, status, errorMessage = null) {

    const { error } = await supabase
        .from("scrape_logs")
        .insert({
            product_id: productUuid,
            attempt_number: attempt,
            status: status,
            error_message: errorMessage
        });

    if (error) {
        throw new Error(
            `Failed to save scrape log: ${error.message}`
        );
    }
}


async function saveScrape(productUuid, result, attempt) {

    const { error: historyError } = await supabase
        .from("price_history")
        .insert({
            product_id: productUuid,
            price: result.price,
            stock_status: result.stock.status,
            stock_quantity: result.stock.quantity
        });

    if (historyError) {
        throw new Error(
            `Failed to save price history: ${historyError.message}`
        );
    }

    await saveScrapeLog(
        productUuid,
        attempt,
        "success",
        null
    );

    console.log("Data saved to Supabase successfully!");
}


module.exports = {
    saveScrape,
    saveScrapeLog
};