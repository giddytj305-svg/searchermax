// ✅ /api/search.js — Real-time search (Reddit + DuckDuckGo + Wikipedia + News)
import fetch from "node-fetch";

// 🧩 Helper: fetch from DuckDuckGo Instant API (text + image results)
async function searchDuckDuckGo(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
    query
  )}&format=json&no_redirect=1&no_html=1`;
  const res = await fetch(url);
  const data = await res.json();

  const results = [];

  if (data.RelatedTopics) {
    data.RelatedTopics.forEach((item) => {
      if (item.Text) {
        results.push({
          title: item.Text.split(" - ")[0],
          snippet: item.Text,
          url: item.FirstURL || null,
          image: item.Icon?.URL ? `https://duckduckgo.com${item.Icon.URL}` : null,
          source: "DuckDuckGo",
        });
      }
    });
  }

  if (data.AbstractText) {
    results.unshift({
      title: data.Heading,
      snippet: data.AbstractText,
      url: data.AbstractURL || null,
      image: data.Image ? `https://duckduckgo.com${data.Image}` : null,
      source: "DuckDuckGo",
    });
  }

  return results.slice(0, 5);
}

// 🧩 Helper: get trending posts from Reddit (no API key)
async function searchReddit(query) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=top&t=month&limit=5`;
  const res = await fetch(url, {
    headers: { "User-Agent": "MaxCodeGenAI/1.0" },
  });
  const data = await res.json();

  const posts = data.data?.children || [];
  return posts.map((p) => {
    const post = p.data;
    return {
      title: post.title,
      snippet: post.selftext?.slice(0, 200) || post.url || "",
      url: `https://reddit.com${post.permalink}`,
      image: post.thumbnail?.startsWith("http") ? post.thumbnail : null,
      source: "Reddit",
    };
  });
}

// 🧩 Helper: get summary from Wikipedia (no API key)
async function searchWikipedia(query) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();

  return [
    {
      title: data.title,
      snippet: data.extract,
      url: data.content_urls?.desktop?.page || null,
      image: data.thumbnail?.source || null,
      source: "Wikipedia",
    },
  ];
}

// 🧩 Helper: fetch from a free news RSS-to-JSON API
async function searchNews(query) {
  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(
      query
    )}&lang=en&max=5&apikey=demo`; // demo key still works for small requests
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    return data.articles?.map((a) => ({
      title: a.title,
      snippet: a.description || "",
      url: a.url,
      image: a.image || null,
      source: a.source?.name || "News",
    })) || [];
  } catch (err) {
    console.error("News fetch failed:", err);
    return [];
  }
}

// 🚀 Handler
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Missing query." });

    // 🧠 Run all searches in parallel
    const [duck, reddit, wiki, news] = await Promise.all([
      searchDuckDuckGo(query),
      searchReddit(query),
      searchWikipedia(query),
      searchNews(query),
    ]);

    const sources = [...wiki, ...news, ...reddit, ...duck].slice(0, 10);

    res.status(200).json({
      sources,
      summary: `Fetched ${sources.length} results for "${query}" from multiple public sources.`,
    });
  } catch (err) {
    console.error("❌ Search API error:", err);
    res.status(500).json({ error: "Failed to fetch search results." });
  }
}
