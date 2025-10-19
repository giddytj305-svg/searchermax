// ✅ /api/search.js — Real-time search with Gemini summary + safe fallbacks
export const config = { runtime: "nodejs18.x" };

import { GoogleGenerativeAI } from "@google/generative-ai";

// Utility: Safe fetch + JSON
async function safeFetchJSON(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`❌ Fetch failed for ${url}:`, err.message);
    return null;
  }
}

// 🦆 DuckDuckGo
async function searchDuckDuckGo(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  const data = await safeFetchJSON(url);
  if (!data) return [];
  const results = [];
  if (data.RelatedTopics) {
    for (const item of data.RelatedTopics) {
      if (item.Text) {
        results.push({
          title: item.Text.split(" - ")[0],
          snippet: item.Text,
          url: item.FirstURL || "",
          image: item.Icon?.URL ? `https://duckduckgo.com${item.Icon.URL}` : null,
          source: "DuckDuckGo",
        });
      }
    }
  }
  if (data.AbstractText) {
    results.unshift({
      title: data.Heading || "DuckDuckGo",
      snippet: data.AbstractText,
      url: data.AbstractURL || "",
      image: data.Image ? `https://duckduckgo.com${data.Image}` : null,
      source: "DuckDuckGo",
    });
  }
  return results.slice(0, 5);
}

// 🧵 Reddit
async function searchReddit(query) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=top&t=month&limit=5`;
  const data = await safeFetchJSON(url, {
    headers: { "User-Agent": "MaxCodeGenAI/1.0" },
  });
  if (!data?.data?.children) return [];
  return data.data.children.map((p) => {
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
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
  const data = await safeFetchJSON(url);
  if (!data) return [];
  return [
    {
      title: data.title || "Wikipedia",
      snippet: data.extract || "",
      url: data.content_urls?.desktop?.page || "",
      image: data.thumbnail?.source || null,
      source: "Wikipedia",
    },
  ];
}

// 📰 GNews
async function searchNews(query) {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=5&apikey=${key}`;
  const data = await safeFetchJSON(url);
  if (!data?.articles) return [];
  return data.articles.map((a) => ({
    title: a.title || "Untitled Article",
    snippet: a.description || "",
    url: a.url,
    image: a.image || null,
    source: a.source?.name || "GNews",
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
    const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const query = body.query;
    if (!query) return res.status(400).json({ error: "Missing query." });

    console.log("🔍 Searching for:", query);

    // Run searches concurrently
    const [duck, reddit, wiki, news] = await Promise.all([
      searchDuckDuckGo(query),
      searchReddit(query),
      searchWikipedia(query),
      searchNews(query),
    ]);

    const sources = [...wiki, ...news, ...reddit, ...duck].filter(Boolean).slice(0, 10);
    let reply = "Here’s what I found online 👇";

    // Gemini Summary
    try {
      const key = process.env.GEMINI_API_KEY;
      if (key) {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const summaryPrompt = `
Summarize the most relevant insights about "${query}" using these sources:
${sources.map((s, i) => `${i + 1}. ${s.title} — ${s.snippet}`).join("\n")}
`;
        const result = await model.generateContent(summaryPrompt);
        reply = result.response.text() || reply;
      }
    } catch (e) {
      console.warn("⚠️ Gemini summarization failed:", e.message);
    }

    const images = sources.filter((s) => s.image).map((s) => s.image).slice(0, 6);

    res.status(200).json({ reply, sources, images });
  } catch (err) {
    console.error("❌ Search API crashed:", err);
    res.status(500).json({
      reply: "⚠️ Live search temporarily unavailable. Try again later.",
      sources: [],
      images: [],
    });
  }
}
