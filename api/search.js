// ✅ /api/search.js — Real-time search with Gemini summary + safe fallbacks
import { GoogleGenerativeAI } from "@google/generative-ai";

// Utility: Safe fetch + JSON
async function safeFetchJSON(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`❌ Fetch failed: ${url}`, err.message);
    return null;
  }
}

// 🦆 DuckDuckGo
async function searchDuckDuckGo(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
    query
  )}&format=json&no_redirect=1&no_html=1`;
  const data = await safeFetchJSON(url);
  if (!data) return [];

  const results = [];

  if (data.RelatedTopics) {
    for (const item of data.RelatedTopics) {
      if (item.Text) {
        results.push({
          title: item.Text.split(" - ")[0],
          snippet: item.Text,
          url: item.FirstURL || null,
          image: item.Icon?.URL
            ? `https://duckduckgo.com${item.Icon.URL}`
            : null,
          source: "DuckDuckGo",
        });
      }
    }
  }

  if (data.AbstractText) {
    results.unshift({
      title: data.Heading || "DuckDuckGo Result",
      snippet: data.AbstractText,
      url: data.AbstractURL || null,
      image: data.Image ? `https://duckduckgo.com${data.Image}` : null,
      source: "DuckDuckGo",
    });
  }

  return results.slice(0, 5);
}

// 🧵 Reddit
async function searchReddit(query) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
    query
  )}&sort=top&t=month&limit=5`;
  const data = await safeFetchJSON(url, {
    headers: { "User-Agent": "MaxCodeGenAI/1.0" },
  });
  if (!data) return [];

  const posts = data.data?.children || [];
  return posts.map((p) => {
    const post = p.data;
    return {
      title: post.title || "Untitled Reddit Post",
      snippet: post.selftext?.slice(0, 200) || post.url || "",
      url: `https://reddit.com${post.permalink}`,
      image: post.thumbnail?.startsWith("http") ? post.thumbnail : null,
      source: "Reddit",
    };
  });
}

// 🧠 Wikipedia
async function searchWikipedia(query) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    query
  )}`;
  const data = await safeFetchJSON(url);
  if (!data) return [];
  return [
    {
      title: data.title || "Wikipedia Result",
      snippet: data.extract || "",
      url: data.content_urls?.desktop?.page || null,
      image: data.thumbnail?.source || null,
      source: "Wikipedia",
    },
  ];
}

// 📰 GNews
async function searchNews(query) {
  const key = process.env.GNEWS_API_KEY || "demo";
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(
    query
  )}&lang=en&max=5&apikey=${key}`;
  const data = await safeFetchJSON(url);
  if (!data || !data.articles) return [];
  return data.articles.map((a) => ({
    title: a.title || "Untitled Article",
    snippet: a.description || "",
    url: a.url,
    image: a.image || null,
    source: a.source?.name || "News",
  }));
}

// 🚀 Main Handler
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const body =
      typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const query = body.query;
    if (!query) return res.status(400).json({ error: "Missing query." });

    console.log("🔍 Searching for:", query);

    // 🔍 Run all searches in parallel
    const [duck, reddit, wiki, news] = await Promise.all([
      searchDuckDuckGo(query),
      searchReddit(query),
      searchWikipedia(query),
      searchNews(query),
    ]);

    const sources = [...wiki, ...news, ...reddit, ...duck].filter(Boolean).slice(0, 10);
    let reply = "Here’s what I found online 👇";

    // 🧠 Gemini Summary
    try {
      if (process.env.GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
Summarize the most important points about "${query}" based on:
${sources.map((s, i) => `${i + 1}. ${s.title} — ${s.snippet}`).join("\n")}
`;
        const result = await model.generateContent(prompt);
        reply = result.response.text();
      }
    } catch (e) {
      console.warn("⚠️ Gemini summarization failed:", e.message);
    }

    const images = sources
      .filter((s) => s.image)
      .map((s) => s.image)
      .slice(0, 6);

    res.status(200).json({
      reply,
      sources,
      images,
      summary: `Fetched ${sources.length} results for "${query}".`,
    });
  } catch (err) {
  console.error("❌ Search API error:", err);
  res.status(200).json({
    reply: "⚠️ I couldn’t reach live sources right now, but here’s a quick response.",
    sources: [],
    images: [],
    summary: "Search temporarily unavailable.",
  });
}
