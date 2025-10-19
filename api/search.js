// ✅ /api/search.js — Key-free social & web search for Max CodeGen AI
import Parser from "rss-parser";

const parser = new Parser();

// Helper: Fetch from DuckDuckGo
async function searchDuckDuckGo(query) {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`
    );
    const data = await res.json();
    const results = data.RelatedTopics?.slice(0, 5).map((item) => ({
      title: item.Text,
      url: item.FirstURL,
    }));
    return results?.length ? results : null;
  } catch (e) {
    console.error("DuckDuckGo error:", e);
    return null;
  }
}

// Helper: Fetch news headlines via RSS feeds
async function fetchNewsRSS(query) {
  const feeds = [
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://rss.cnn.com/rss/edition.rss",
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://feeds.feedburner.com/TechCrunch/"
  ];

  try {
    const items = [];
    for (const url of feeds) {
      const feed = await parser.parseURL(url);
      feed.items.slice(0, 4).forEach((item) => {
        if (item.title.toLowerCase().includes(query.toLowerCase())) {
          items.push({ title: item.title, link: item.link });
        }
      });
    }
    return items.slice(0, 6);
  } catch (e) {
    console.error("RSS error:", e);
    return [];
  }
}

// Helper: Fetch Reddit threads
async function fetchReddit(query) {
  try {
    const res = await fetch(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=5&sort=top`
    );
    const data = await res.json();
    const posts = data.data.children.map((post) => ({
      title: post.data.title,
      url: `https://reddit.com${post.data.permalink}`,
      upvotes: post.data.ups,
    }));
    return posts;
  } catch (e) {
    console.error("Reddit error:", e);
    return [];
  }
}

// Helper: Fetch Wikipedia summary
async function fetchWikipedia(query) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title,
      summary: data.extract,
      url: data.content_urls?.desktop?.page,
    };
  } catch (e) {
    console.error("Wikipedia error:", e);
    return null;
  }
}

// 🚀 Main handler
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Missing search query" });

    // Run all lookups in parallel
    const [duck, news, reddit, wiki] = await Promise.all([
      searchDuckDuckGo(query),
      fetchNewsRSS(query),
      fetchReddit(query),
      fetchWikipedia(query),
    ]);

    // Build unified response
    const results = {
      query,
      timestamp: new Date().toISOString(),
      sources: {
        wikipedia: wiki || null,
        news: news || [],
        web: duck || [],
        reddit: reddit || [],
      },
    };

    res.status(200).json(results);
  } catch (e) {
    console.error("Search API error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
