import { useState, useEffect } from "react";
import "./App.css";

const fmtStock = (r) =>
    r.stock_status === "out_of_stock" ? "Out of stock"
    : r.stock_status === "in_stock"
        ? `In stock${r.stock_quantity != null ? ` (${r.stock_quantity})` : ""}`
        : r.stock_status;

const API_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

function App() {
    const [query, setQuery] = useState("");
    const [products, setProducts] = useState([]);
    const [trackedProducts, setTrackedProducts] = useState([]);
    const [history, setHistory] = useState([]);
    const [logs, setLogs] = useState([]);

    const [selectedProduct, setSelectedProduct] = useState(null);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadTrackedProducts();
    }, []);

    const loadTrackedProducts = async () => {
        try {
            const response = await fetch(
                `${API_URL}/api/products`
            );

            const result = await response.json();

            if (result.success) {
                setTrackedProducts(result.data);
            }
        } catch (error) {
            setMessage("Could not load tracked products.");
        }
    };

    const searchProducts = async () => {
        if (!query.trim()) {
            setMessage("Please enter a product name.");
            return;
        }

        setLoading(true);
        setMessage("");
        setProducts([]);

        try {
            const response = await fetch(
                `${API_URL}/api/search-products?query=${encodeURIComponent(query)}`
            );

            const result = await response.json();

            if (!result.success) {
                setMessage(result.error || "Search failed.");
                return;
            }

            setProducts(result.data);

            if (result.data.length === 0) {
                setMessage("No products found.");
            }
        } catch (error) {
            setMessage("Could not connect to the backend.");
        } finally {
            setLoading(false);
        }
    };

    const trackProduct = async (product) => {
        try {
            const response = await fetch(
                `${API_URL}/api/products`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        product_name: product.product_name,
                        product_url: product.product_url
                    })
                }
            );

            const result = await response.json();

            if (response.status === 409) {
                setMessage("This product is already being tracked.");
                return;
            }

            if (!result.success) {
                setMessage(
                    result.error || "Could not track product."
                );
                return;
            }

            setMessage(
                `${product.product_name} added for tracking.`
            );

            loadTrackedProducts();
        } catch (error) {
            setMessage("Could not connect to the backend.");
        }
    };

    const loadProductDetails = async (product) => {
        const historyResponse = await fetch(
            `${API_URL}/api/products/${product.id}/history`
        );

        const historyResult = await historyResponse.json();

        const logsResponse = await fetch(
            `${API_URL}/api/products/${product.id}/logs`
        );

        const logsResult = await logsResponse.json();

        const newHistory =
            historyResult.success
                ? historyResult.data
                : [];

        const newLogs =
            logsResult.success
                ? logsResult.data
                : [];

        setHistory(newHistory);
        setLogs(newLogs);

        return {
            history: newHistory,
            logs: newLogs
        };
    };

    const showProductDetails = async (product) => {
        setSelectedProduct(product);
        setHistory([]);
        setLogs([]);

        try {
            await loadProductDetails(product);
        } catch (error) {
            setMessage("Could not load product details.");
        }
    };

    const wait = (milliseconds) => {
        return new Promise(resolve =>
            setTimeout(resolve, milliseconds)
        );
    };

    const refreshPrices = async () => {
        if (refreshing || !selectedProduct) {
            return;
        }

        try {
            setRefreshing(true);
            setMessage("Refreshing prices...");

            const refreshStartedAt = Date.now();

            /*
             * IMPORTANT:
             * Send the selected product UUID.
             * Backend expects /api/scrape/:id
             */
            const response = await fetch(
                `${API_URL}/api/scrape/${selectedProduct.id}`,
                {
                    method: "POST"
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                setMessage(
                    result.message ||
                    result.error ||
                    "Could not start scraping."
                );

                setRefreshing(false);
                return;
            }

            setMessage("Scraping started. Waiting for updated price...");

            /*
             * The backend starts scraping in the background.
             * Check every 2 seconds for a new history/log entry.
             *
             * Maximum wait: about 60 seconds.
             */
            for (let attempt = 0; attempt < 30; attempt++) {
                await wait(2000);

                const details =
                    await loadProductDetails(selectedProduct);

                const latestHistory =
                    details.history[0];

                const latestLog =
                    details.logs[0];

                const newHistoryAvailable =
                    latestHistory &&
                    new Date(
                        latestHistory.scraped_at
                    ).getTime() > refreshStartedAt;

                const newSuccessfulLog =
                    latestLog &&
                    latestLog.status === "success" &&
                    new Date(
                        latestLog.scraped_at
                    ).getTime() > refreshStartedAt;

                const newFailedLog =
                    latestLog &&
                    latestLog.status === "failed" &&
                    new Date(
                        latestLog.scraped_at
                    ).getTime() > refreshStartedAt;

                if (
                    newHistoryAvailable ||
                    newSuccessfulLog
                ) {
                    setMessage("Prices refreshed successfully.");
                    setRefreshing(false);
                    return;
                }

                if (newFailedLog) {
                    setMessage(
                        "Scraping failed after all retry attempts."
                    );
                    setRefreshing(false);
                    return;
                }
            }

            setMessage(
                "Scraping is taking longer than expected. Please check the scrape history."
            );

            setRefreshing(false);

        } catch (error) {
            console.error("Refresh error:", error);

            setMessage(
                "Could not connect to the backend."
            );

            setRefreshing(false);
        }
    };

    return (
        <div className="app">

            <header>
                <h1>Product Price Tracker</h1>

                <p>
                    Search for products and keep track of their prices.
                </p>
            </header>

            <main>

                <section className="search-section">

                    <h2>Search Products</h2>

                    <div className="search-box">

                        <input
                            type="text"
                            placeholder="Enter product name"
                            value={query}
                            onChange={(event) =>
                                setQuery(event.target.value)
                            }
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    searchProducts();
                                }
                            }}
                        />

                        <button onClick={searchProducts}>
                            Search
                        </button>

                    </div>

                    {loading && (
                        <p className="message">
                            Searching products...
                        </p>
                    )}

                    {message && (
                        <p className="message">
                            {message}
                        </p>
                    )}

                    {products.length > 0 && (
                        <div className="results">

                            <h3>Search Results</h3>

                            {products.map((product) => (

                                <div
                                    className="product"
                                    key={product.product_url}
                                >

                                    <div>

                                        <h3>
                                            {product.product_name}
                                        </h3>

                                        <p>
                                            {product.brand}
                                        </p>

                                        <p>
                                            {product.sku}
                                        </p>

                                    </div>

                                    <button
                                        onClick={() =>
                                            trackProduct(product)
                                        }
                                    >
                                        Track Product
                                    </button>

                                </div>

                            ))}

                        </div>
                    )}

                </section>


                <section className="dashboard">

                    <h2>Tracked Products</h2>

                    {trackedProducts.length === 0 ? (

                        <p>
                            No products are being tracked yet.
                        </p>

                    ) : (

                        <div className="tracked-list">

                            {trackedProducts.map((product) => (

                                <div
                                    className="tracked-product"
                                    key={product.id}
                                >

                                    <div>

                                        <h3>
                                            {product.product_name}
                                        </h3>

                                        <p>
                                            {product.product_url}
                                        </p>

                                    </div>

                                    <button
                                        onClick={() =>
                                            showProductDetails(product)
                                        }
                                    >
                                        View Details
                                    </button>

                                </div>

                            ))}

                        </div>

                    )}

                </section>


                {selectedProduct && (

                    <section className="details">

                        <div className="details-heading">

                            <h2>
                                {selectedProduct.product_name}
                            </h2>

                            <button
                                onClick={refreshPrices}
                                disabled={refreshing}
                            >
                                {refreshing
                                    ? "Refreshing..."
                                    : "Refresh Prices"}
                            </button>

                        </div>


                        {history.length > 0 && (

                            <div className="current-details">

                                <div>

                                    <span>
                                        Current Price
                                    </span>

                                    <strong>
                                        ₹{history[0].price}
                                    </strong>

                                </div>

                                <div>

                                    <span>
                                        Stock Status
                                    </span>

                                    <strong>
                                        {fmtStock(history[0])}
                                    </strong>

                                </div>

                            </div>

                        )}


                        <div className="detail-box">

                            <h3>
                                Price History
                            </h3>

                            {history.length === 0 ? (

                                <p>
                                    No price history available yet.
                                </p>

                            ) : (

                                <table>

                                    <thead>

                                        <tr>
                                            <th>Date</th>
                                            <th>Price</th>
                                            <th>Stock</th>
                                        </tr>

                                    </thead>

                                    <tbody>

                                        {history.map((item) => (

                                            <tr key={item.id}>

                                                <td>
                                                    {new Date(
                                                        item.scraped_at
                                                    ).toLocaleString()}
                                                </td>

                                                <td>
                                                    ₹{item.price}
                                                </td>

                                                <td>
                                                    {fmtStock(item)}
                                                </td>

                                            </tr>

                                        ))}

                                    </tbody>

                                </table>

                            )}

                        </div>


                        <div className="detail-box">

                            <h3>
                                Scrape History
                            </h3>

                            {logs.length === 0 ? (

                                <p>
                                    No scrape logs available yet.
                                </p>

                            ) : (

                                <table>

                                    <thead>

                                        <tr>
                                            <th>Attempt</th>
                                            <th>Status</th>
                                            <th>Error</th>
                                            <th>Date</th>
                                        </tr>

                                    </thead>

                                    <tbody>

                                        {logs.map((log) => (

                                            <tr key={log.id}>

                                                <td>
                                                    {log.attempt_number}
                                                </td>

                                                <td>
                                                    {log.status}
                                                </td>

                                                <td>
                                                    {log.error_message || "-"}
                                                </td>

                                                <td>
                                                    {new Date(
                                                        log.scraped_at
                                                    ).toLocaleString()}
                                                </td>

                                            </tr>

                                        ))}

                                    </tbody>

                                </table>

                            )}

                        </div>

                    </section>

                )}

            </main>

        </div>
    );
}

export default App;