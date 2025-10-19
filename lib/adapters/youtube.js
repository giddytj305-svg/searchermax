export async function searchYouTube(query) {
  if (!process.env.YOUTUBE_API_KEY) return [];

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(
    query
  )}&key=${process.env.YOUTUBE_API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.items?.map((v) => ({
      source: "YouTube",
      author: v.snippet.channelTitle,
      text: v.snippet.title,
      link: `https://www.youtube.com/watch?v=${v.id.videoId}`,
    })) || [];
  } catch (err) {
    console.error("YouTube fetch failed:", err);
    return [];
  }
}
