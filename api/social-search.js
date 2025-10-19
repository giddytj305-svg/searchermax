import { searchX } from "../lib/adapters/x.js";
import { searchReddit } from "../lib/adapters/reddit.js";
import { searchInstagram } from "../lib/adapters/instagram.js";
import { searchYouTube } from "../lib/adapters/youtube.js";

export default async function handler(req, res) {
  const { q, sources } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  try {
    let results = [];

    if (!sources || sources.includes("x")) results.push(...(await searchX(q)));
    if (!sources || sources.includes("reddit")) results.push(...(await searchReddit(q)));
    if (!sources || sources.includes("instagram")) results.push(...(await searchInstagram(q)));
    if (!sources || sources.includes("youtube")) results.push(...(await searchYouTube(q)));

    res.status(200).json({ items: results });
  } catch (err) {
    console.error("Social search error:", err);
    res.status(500).json({ error: err.message });
  }
}
