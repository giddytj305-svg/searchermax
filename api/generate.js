import fs from "fs";
import path from "path";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ✅ Memory system (temporary, works on Vercel)
const MEMORY_DIR = "/tmp/memory";
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);

function loadMemory(userId) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    console.error(`❌ Failed to load memory for ${userId}:`, err);
  }

  return {
    userId,
    conversation: [
      {
        role: "system",
        content: `
You are Max CodeGen AI — an expressive, brilliant assistant 🤖💫 built by Max, a 21-year-old full-stack developer from Kenya 🇰🇪.

🧭 CONTEXT:
• The year is 2025. You understand current events and modern tech.
• You can access a /api/search endpoint for real-time data.

⚡ PERSONALITY:
• Talk like a friendly Kenyan dev — relaxed but confident.
• Blend English, Swahili, or Sheng naturally if user uses them.
• Never say “as an AI”; you are Max CodeGen AI.
`,
      },
    ],
  };
}

function saveMemory(userId, memory) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), "utf-8");
}

// 🔍 Language + online detection
function detectLanguage(text) {
  const lower = text.toLowerCase();
  const swahili = ["habari", "sasa", "kwani", "niko", "basi", "ndio", "asante"];
  const sheng = ["bro", "maze", "fiti", "safi", "buda", "msee", "poa"];

  const count = (arr) => arr.filter((w) => lower.includes(w)).length;
  const sw = count(swahili), sh = count(sheng);

  if (sw + sh > 2) return "swahili";
  if (sw + sh > 0) return "mixed";
  return "english";
}

function needsSearch(prompt) {
  const triggers = [
    "search",
    "find",
    "look up",
    "check online",
    "any news",
    "trending",
    "latest updates",
    "on reddit",
    "on twitter",
    "current events",
  ];
  return triggers.some((t) => prompt.toLowerCase().includes(t));
}

// 🌍 Real-time search
async function getSearchData(query) {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      console.error("Search fetch failed:", await res.text());
      return null;
    }

    return await res.json();
  } catch (e) {
    console.error("❌ Search API failed:", e);
    return null;
  }
}

// 🚀 Main handler
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, userId } = req.body;
    if (!prompt || !userId)
      return res.status(400).json({ error: "Missing prompt or userId." });

    let memory = loadMemory(userId);
    memory.conversation.push({ role: "user", content: prompt });

    const lang = detectLanguage(prompt);
    const tone =
      lang === "swahili"
        ? "Respond fully in Swahili/Sheng."
        : lang === "mixed"
        ? "Respond bilingually — mostly English with Swahili/Sheng."
        : "Respond in English, friendly Kenyan dev tone.";

    let searchContext = "";
    let newsCards = [];

    // 📰 If prompt requires online info
    if (needsSearch(prompt)) {
      const data = await getSearchData(prompt);
      if (data && data.sources?.length > 0) {
        const summarized = data.reply || "Here’s what I found:";
        const topArticles = data.sources
          .map(
            (a, i) =>
              `${i + 1}. [${a.title}](${a.url}) — ${a.snippet || ""}`
          )
          .join("\n");

        searchContext = `
🧠 Real-time sources:
${topArticles}

Gemini summary:
${summarized}`;

        // News cards (for frontend display)
        newsCards = data.sources.map((a) => ({
          title: a.title,
          url: a.url,
          snippet: a.snippet,
          image: a.image,
          source: a.source,
        }));
      }
    }

    const fullPrompt = `
${memory.conversation
  .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
  .join("\n")}
${searchContext}

System: ${tone}
`;

    // 🔥 Call Gemini
    const geminiRes = await fetch(
      `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 900 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API Error:", errText);
      return res.status(500).json({ error: "Gemini API failed" });
    }

    const data = await geminiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ No reply received.";

    memory.conversation.push({ role: "assistant", content: reply });
    saveMemory(userId, memory);

    // ✅ Return both AI reply + visual news cards
    return res.status(200).json({
      reply,
      news: newsCards,
    });
  } catch (err) {
    console.error("💥 generate.js error:", err);
    return res.status(500).json({ error: "Server error." });
  }
}
