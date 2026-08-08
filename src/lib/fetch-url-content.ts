/**
 * Smart URL content extraction.
 *
 * For JS-rendered sites (X/Twitter, Substack, Medium, etc.), a raw fetch()
 * returns empty HTML shells. This module uses Brave Search to get the actual
 * indexed content for those URLs, falling back to direct fetch for simple sites.
 */

const JS_RENDERED_DOMAINS = [
  "x.com",
  "twitter.com",
  "medium.com",
  "substack.com",
  "linkedin.com",
  "instagram.com",
  "facebook.com",
  "threads.net",
  "reddit.com",
];

function isXUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    return hostname === "x.com" || hostname === "twitter.com";
  } catch {
    return false;
  }
}

function extractTweetId(url: string): string | null {
  const match = url.match(/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

async function fetchFromTwitterApi(url: string): Promise<{ title: string; body: string; imageUrl: string } | null> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN || "";
  if (!bearerToken) return null;

  const tweetId = extractTweetId(url);
  if (!tweetId) return null;

  try {
    const res = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=article&expansions=article.cover_media&media.fields=url,preview_image_url`,
      {
        headers: { Authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const tweet = data.data;
    if (!tweet?.article) return null;

    const article = tweet.article;
    const title = article.title || "";
    const body = (article.plain_text || "").replace(/https?:\/\/t\.co\/\S+/g, "").trim();

    // Find cover image
    let imageUrl = "";
    const coverKey = article.cover_media || "";
    if (coverKey && data.includes?.media) {
      type BraveMedia = { media_key: string; url?: string; preview_image_url?: string };
      const media = data.includes.media.find((m: BraveMedia) => m.media_key === coverKey);
      if (media) imageUrl = media.url || media.preview_image_url || "";
    }

    return { title, body, imageUrl };
  } catch {
    return null;
  }
}

function isJsRenderedUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    return JS_RENDERED_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

async function braveSearchUrl(
  url: string,
  braveKey: string
): Promise<{ title: string; content: string } | null> {
  try {
    // Search for the exact URL
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(url)}&count=5`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": braveKey,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.web?.results || [];

    // Find the result that matches our URL (or is close)
    const urlHost = new URL(url).hostname.replace("www.", "");
    const match = results.find((r: { url: string }) => {
      try {
        const rHost = new URL(r.url).hostname.replace("www.", "");
        return rHost === urlHost;
      } catch {
        return false;
      }
    });

    if (match) {
      // Brave provides description (snippet) and sometimes extra_snippets
      const extraSnippets = (match.extra_snippets || []).join("\n\n");
      const content = [match.description || "", extraSnippets].filter(Boolean).join("\n\n");
      return {
        title: match.title || "",
        content: content.trim(),
      };
    }

    // If no exact match, return the most relevant result about the topic
    if (results.length > 0) {
      const top = results[0];
      const extraSnippets = (top.extra_snippets || []).join("\n\n");
      const content = [top.description || "", extraSnippets].filter(Boolean).join("\n\n");
      return {
        title: top.title || "",
        content: content.trim(),
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function directFetch(url: string, maxChars: number): Promise<{ title: string; content: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HermyHQ/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Extract meta description
    const metaDescMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
    ) || html.match(
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
    );
    const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : "";

    // Extract og:title if main title is generic
    const ogTitleMatch = html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
    );
    const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : "";

    // Strip HTML and get text content
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);

    const content = [metaDesc, textContent].filter(Boolean).join("\n\n");
    const bestTitle = ogTitle || title;

    return {
      title: bestTitle,
      content: content.trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Extract content from a URL using the best available method.
 * - JS-rendered sites (X, Medium, etc.) → Brave Search
 * - Static sites → direct fetch with improved parsing
 * - Always tries Brave first if available, falls back to direct fetch
 */
export async function fetchUrlContent(
  url: string,
  options: { maxChars?: number } = {}
): Promise<string> {
  const { maxChars = 3000 } = options;
  const braveKey = process.env.BRAVE_API_KEY || "";
  const jsRendered = isJsRenderedUrl(url);

  // For X/Twitter article URLs, use Twitter API for full body + title + image
  if (isXUrl(url)) {
    const twitterResult = await fetchFromTwitterApi(url);
    if (twitterResult && twitterResult.body.length > 50) {
      const parts = [`Title: ${twitterResult.title}`, `URL: ${url}`];
      if (twitterResult.imageUrl) parts.push(`Hero Image: ${twitterResult.imageUrl}`);
      parts.push(`Content:\n${twitterResult.body.slice(0, maxChars)}`);
      return parts.join("\n");
    }
  }

  // For JS-rendered sites, Brave is the only option
  if (jsRendered && braveKey) {
    const result = await braveSearchUrl(url, braveKey);
    if (result && result.content) {
      return `Title: ${result.title}\nURL: ${url}\nContent:\n${result.content.slice(0, maxChars)}`;
    }
    // Brave didn't return useful content — still try direct fetch as last resort
  }

  // For static sites, or when Brave fails on JS sites
  if (!jsRendered) {
    // Try direct fetch first for static sites (more content)
    const directResult = await directFetch(url, maxChars);
    if (directResult && directResult.content.length > 100) {
      return `Title: ${directResult.title}\nURL: ${url}\nContent:\n${directResult.content}`;
    }
  }

  // Last resort: try Brave for any URL
  if (braveKey) {
    const result = await braveSearchUrl(url, braveKey);
    if (result && result.content) {
      return `Title: ${result.title}\nURL: ${url}\nContent:\n${result.content.slice(0, maxChars)}`;
    }
  }

  // Final fallback: try direct fetch even for JS sites (might get meta tags at least)
  if (jsRendered) {
    const directResult = await directFetch(url, maxChars);
    if (directResult) {
      return `Title: ${directResult.title}\nURL: ${url}\nContent:\n${directResult.content}`;
    }
  }

  return `URL: ${url}\n(Could not extract content from this URL)`;
}
