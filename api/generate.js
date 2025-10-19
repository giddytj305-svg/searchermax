import fs from "fs";
import path from "path";

// ✅ Gemini API endpoint
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ✅ Temporary memory directory (works on Vercel)
const MEMORY_DIR = "/tmp/memory";
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);

// 🧠 Load user memory
function loadMemory(userId) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    console.error(`❌ Failed to load memory for ${userId}:`, err);
  }

  // Default memory
  return {
    userId,
    lastProject: null,
    lastTask: null,
    conversation: [
      {
        role: "system",
        content: `
You are **Max CodeGen AI** — an expressive, brilliant assistant 🤖💫 built by Max, a 21-year-old full-stack developer from Kenya 🇰🇪.

🧭 CONTEXT AWARENESS:
• The current year is **2025**. You understand modern events, trends, and technologies up to this year.
• Always reason as if you exist in 2025 — avoid outdated info.

⚡ PERSONALITY:
• You talk like a warm, confident Nairobi techie 😎.
• Use English by default, but if the user uses Swahili or Sheng, blend naturally.
• Never say “I’m an AI” — you are **Max CodeGen AI**, Max’s digital creation.
• Only mention your name or Max if the user directly asks (“who made you?”, “what’s your name?”).
• Be expressive, but not exaggerated.

💻 TECH STYLE:
• Format code using markdown (\`\`\`js\`\`\` etc.).
• Explain ideas clearly and engagingly.
• Encourage users — you're like a supportive coding buddy.

🧠 LANGUAGE BEHAVIOR:
• English → English.
• Swahili/Sheng → reply the same way.
• Mixed → blend naturally.

🌍 SEARCH CAPABILITY (2025):
• You can reference real-time data through external APIs (like social media, web, or news APIs) using a separate endpoint (e.g. /api/search.js).
• Use that when the user asks to “check online”, “see trending”, “find on Twitter”, etc.
        `,
      },
    ],
  };
}

// 💾 Save memory
function saveMemory(userId, memory) {
  const filePath = path.join(MEMORY_DIR, `memory_${userId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), "utf-8");
  } catch (err) {
    console.error(`❌ Failed to save memory for ${userId}:`, err);
  }
}

// 🧩 Simple Swahili/Sheng detection
function detectLanguage(text) {
  const lower = text.toLowerCase();
  const swahiliWords = ["habari", "sasa", "niko", "kwani", "basi", "ndio", "karibu", "asante"];
  const shengWords = ["bro", "maze", "manze", "noma", "fiti", "safi", "buda", "msee", "mwana", "poa"];

  const swCount = swahiliWords.filter((w) => lower.includes(w)).length;
  const shCount = shengWords.filter((w) => lower.includes(w)).length;

  if (swCount + shCount === 0) return "english";
  if (swCount + shCount < 3) return "mixed";
  return "swahili";
}

// 🚀 API Handler
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, project, userId } = req.body;
    if (!prompt || !userId)
      return res.status(400).json({ error: "Missing prompt or userId." });

    // 🧠 Load memory
    let memory = loadMemory(userId);
    if (project) memory.lastProject = project;
    memory.lastTask = prompt;
    memory.conversation.push({ role: "user", content: prompt });

    // 🌍 Detect language
    const lang = detectLanguage(prompt);
    let languageInstruction = "";
    if (lang === "swahili") {
      languageInstruction = "Respond fully in Swahili or Sheng depending on tone.";
    } else if (lang === "mixed") {
      languageInstruction = "Respond bilingually — mostly English with Swahili/Sheng flavor.";
    } else {
      languageInstruction = "Respond in English, friendly Kenyan developer tone.";
    }

    // 🧩 Conversation context
    const promptText = `
${memory.conversation
  .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
  .join("\n")}

System instruction: ${languageInstruction}
`;

    // 🔥 Call Gemini API
    const geminiResponse = await fetch(
      `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 900,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini error:", errorText);
      return res.status(geminiResponse.status).json({ error: errorText });
    }

    const result = await geminiResponse.json();
    const fullResponse =
      result?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ No response received.";

    // 🧹 Clean & save
    const cleanText = fullResponse.replace(/as an ai|language model/gi, "");
    memory.conversation.push({ role: "assistant", content: cleanText });
    saveMemory(userId, memory);

    // ✅ Return
    return res.status(200).json({ reply: cleanText });
  } catch (err) {
    console.error("💥 Backend error:", err);
    return res.status(500).json({ error: "Server error." });
  }
}
