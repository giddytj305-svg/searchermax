export async function searchInstagram(query) {
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) return [];

  try {
    const url = `https://graph.facebook.com/v20.0/ig_hashtag_search?user_id=${process.env.INSTAGRAM_USER_ID}&q=${encodeURIComponent(
      query
    )}&access_token=${process.env.INSTAGRAM_ACCESS_TOKEN}`;
    const tagData = await fetch(url).then((r) => r.json());
    const hashtagId = tagData.data?.[0]?.id;
    if (!hashtagId) return [];

    const postsUrl = `https://graph.facebook.com/v20.0/${hashtagId}/top_media?user_id=${process.env.INSTAGRAM_USER_ID}&fields=caption,media_url,permalink,username&access_token=${process.env.INSTAGRAM_ACCESS_TOKEN}`;
    const posts = await fetch(postsUrl).then((r) => r.json());

    return posts.data?.map((p) => ({
      source: "Instagram",
      author: p.username,
      text: p.caption,
      link: p.permalink,
    })) || [];
  } catch (err) {
    console.error("Instagram fetch failed:", err);
    return [];
  }
}
