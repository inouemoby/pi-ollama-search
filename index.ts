import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

function getOllamaCloudKey(): string | null {
  const env = process.env.OLLAMA_CLOUD_API_KEY;
  if (env) return env;
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(process.env.USERPROFILE || process.env.HOME || ".", ".pi/agent");
  const authPath = join(agentDir, "auth.json");
  if (existsSync(authPath)) {
    try {
      const auth = JSON.parse(readFileSync(authPath, "utf-8"));
      if (auth["ollama-cloud"]?.key) return auth["ollama-cloud"].key;
    } catch { /* ignore */ }
  }
  return null;
}

function fmtAuthors(authors: Array<{ name: string }>): string {
  if (!authors || authors.length === 0) return "Unknown";
  return authors.slice(0, 5).map(a => a.name).join(", ") + (authors.length > 5 ? " et al." : "");
}

// ── Deep search helpers ─────────────────────────────────────

// Common URL path segments that are too generic to be useful as exclusion tokens
const GENERIC_SEGMENTS = new Set([
  "blog", "post", "posts", "blob", "tree", "tag", "tags", "releases", "release",
  "issues", "issue", "pull", "wiki", "docs", "doc", "src", "lib", "app",
  "main", "master", "head", "latest", "index", "home", "page", "search",
  "api", "www", "articles", "article", "content", "upload", "files",
  "static", "assets", "images", "img", "css", "js", "en", "us", "cn",
  "com", "org", "net", "io", "dev", "html", "htm", "php", "json",
  "stable", "project", "resources", "resource", "web", "new", "best",
  "guide", "guides", "tutorial", "tutorials", "learn", "getting-started",
  "overview", "introduction", "readme", "changelog", "changes",
]);

/**
 * Extract unique, non-query-overlapping tokens from a URL for use as -inurl exclusions.
 * Strategy: only use segments that are clearly identifiers (hashes, numeric slugs)
 * or unique slugs that don't overlap with the query words or the domain.
 * Skip anything generic, version-like, or overlapping with the search query.
 */
function extractExclusionTokens(url: string, queryWords: string[]): string[] {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const qLower = queryWords.map(w => w.toLowerCase());
    const tokens: string[] = [];

    for (const seg of segments) {
      // Remove common file extensions
      const clean = seg.replace(/\.(html|htm|md|php|json|xml|aspx?)$/i, "");
      if (clean.length < 4) continue;

      // Skip if it's part of the domain
      if (u.hostname.toLowerCase().includes(clean.toLowerCase())) continue;

      // Skip pure version numbers (e.g. "1.0.0", "v19.0.0", "19.0")
      if (/^v?\d+(\.\d+)*$/.test(clean)) continue;

      // Skip pure year/date segments
      if (/^\d{4}$/.test(clean)) continue;

      // Skip generic path segments
      if (GENERIC_SEGMENTS.has(clean.toLowerCase())) continue;

      // Skip if overlapping with any query word
      const cl = clean.toLowerCase();
      const overlapsQuery = qLower.some(qw => {
        // Direct containment
        if (cl.includes(qw) || qw.includes(cl)) return true;
        // Also check after removing hyphens/dashes ("react-19" matches "react" or "19")
        const clParts = cl.split(/[\-_]/);
        return clParts.some(p => p.length >= 2 && qw.includes(p));
      });
      if (overlapsQuery) continue;

      // Skip segments with dots (e.g. "struct.Runtime") — -inurl doesn't handle them
      if (clean.includes(".")) continue;

      // Candidate passed all filters
      // Hex hash (>= 7 hex chars) — best token
      if (/^[0-9a-f]{7,}$/i.test(clean)) { tokens.push(clean); continue; }
      // Mixed alphanumeric (contains both letters and digits) — likely an ID/slug
      if (/[a-z]/i.test(clean) && /\d/.test(clean)) { tokens.push(clean); continue; }
      // Pure alpha slug (>= 6 chars) — likely an author/org name
      if (/^[a-z][\-_a-z0-9]*$/i.test(clean) && clean.length >= 6) { tokens.push(clean); }
    }

    return tokens;
  } catch {
    return [];
  }
}

async function isOllamaLocalAvailable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch("http://localhost:11434/api/tags", { signal: ctrl.signal });
    return r.ok;
  } catch { return false; }
}

async function ddgSearch(query: string, maxResults: number): Promise<Array<{ title: string; url: string; content: string }>> {
  const url = `https://lite.duckduckgo.com/lite?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; pi-search-plus/1.0)" } });
  const html = await resp.text();
  const results: Array<{ title: string; url: string; content: string }> = [];
  const linkRegex = /<a[^>]*class='result-link'[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
  const snippetRegex = /<td class='result-snippet'>([\s\S]*?)<\/td>/g;
  const snippets: string[] = [];
  let snipMatch: RegExpExecArray | null;
  while ((snipMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(snipMatch[1].replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 300));
  }
  let linkMatch: RegExpExecArray | null;
  let idx = 0;
  while ((linkMatch = linkRegex.exec(html)) !== null && results.length < maxResults) {
    let rawHref = linkMatch[1];
    if (rawHref.startsWith("//")) rawHref = "https:" + rawHref;
    let realUrl = rawHref;
    const uddgMatch = rawHref.match(/uddg=([^&]+)/);
    if (uddgMatch) realUrl = decodeURIComponent(uddgMatch[1]);
    results.push({ title: linkMatch[2].trim(), url: realUrl, content: snippets[idx] || "" });
    idx++;
  }
  return results;
}

export default function (pi: ExtensionAPI) {

  // Truncate page content using pi's built-in truncation.
  // Saves full content to temp file if truncated, so AI can read it if needed.
  function truncatePage(raw: string): string {
    const t = truncateHead(raw, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
    if (!t.truncated) return t.content;
    const tmpFile = join(tmpdir(), `pi-fetch-${randomUUID()}.txt`);
    try { writeFileSync(tmpFile, raw, "utf8"); } catch {}
    return t.content + `\n\n[Output truncated: ${t.outputLines} of ${t.totalLines} lines (${formatSize(t.outputBytes)} of ${formatSize(t.totalBytes)}). Full content saved to: ${tmpFile}]`;
  }

  // ── Core single-round search ──────────────────────────────
  async function singleSearch(query: string, signal?: AbortSignal): Promise<{ results: Array<{ title: string; url: string; content: string }>; source: string }> {
    // Try Ollama local
    if (await isOllamaLocalAvailable()) {
      try {
        const resp = await fetch("http://localhost:11434/api/experimental/web_search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, max_results: 10 }),
          signal,
        });
        if (resp.ok) {
          const data = (await resp.json()) as any;
          const results = (data.results || []) as Array<{ title: string; url: string; content: string }>;
          if (results.length > 0) return { results, source: "ollama-local" };
        }
      } catch { /* fallback */ }
    }
    // Try Ollama Cloud
    const cloudKey = getOllamaCloudKey();
    if (cloudKey) {
      try {
        const resp = await fetch("https://ollama.com/api/web_search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cloudKey}`,
          },
          body: JSON.stringify({ query, max_results: 10 }),
          signal,
        });
        if (resp.ok) {
          const data = (await resp.json()) as any;
          const results = (data.results || []) as Array<{ title: string; url: string; content: string }>;
          if (results.length > 0) return { results, source: "ollama-cloud" };
        }
      } catch { /* fallback */ }
    }
    // Fallback: DuckDuckGo
    const results = await ddgSearch(query, 10);
    return { results, source: results.length > 0 ? "duckduckgo" : "none" };
  }

  // ── web_search ──────────────────────────────────────────────
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for real-time information, news, forum discussions, documentation, and any web content. Defaults to deep search mode which runs multiple rounds with exclusion-based pagination to gather more unique results.",
    promptSnippet: "Search the web for any topic, news, docs, or discussions",
    promptGuidelines: [
      "Use web_search as your DEFAULT for any factual or current query. It searches the entire web — news, forums, docs, blogs, everything.",
      "web_search defaults to deep mode: it runs multiple search rounds (default 3, max 10), accumulating URL-based exclusions to find more unique results. Each round returns up to 10 results.",
      "For a quick single-round search, use mode=\"simple\".",
      "Always search before answering factual questions — your training data has a cutoff.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query. Be specific — include version numbers, dates, or site: filters for best results." }),
      mode: Type.Optional(Type.String({ description: "Search mode: 'deep' (default, multi-round) or 'simple' (single round).", default: "deep" })),
      rounds: Type.Optional(Type.Number({ description: "Number of search rounds for deep mode (default: 3, max: 10).", default: 3 })),
    }),
    async execute(_id, params, signal, _onUpdate, _ctx) {
      const mode = params.mode ?? "deep";
      const maxRounds = Math.min(params.rounds ?? 3, 10);
      const queryWords = params.query.split(/\s+/).filter(Boolean);

      if (mode === "simple") {
        // ── Simple mode: single round, return up to 10 ──
        const { results, source } = await singleSearch(params.query, signal);
        if (results.length === 0) {
          return { content: [{ type: "text", text: `No results found for: ${params.query}` }], details: { query: params.query, count: 0 } };
        }
        const text = results.map((r, i) =>
          `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${String(r.content || "").slice(0, 300)}`
        ).join("\n\n");
        return { content: [{ type: "text", text }], details: { source, query: params.query, count: results.length } };
      }

      // ── Deep mode: multi-round with exclusion-based pagination ──
      const allResults: Array<{ title: string; url: string; content: string; round: number }> = [];
      const seenUrls = new Set<string>();
      const excludedTokens = new Set<string>();
      let source = "none";

      for (let round = 1; round <= maxRounds; round++) {
        // Build query with exclusion tokens (limit to 15 tokens to avoid query bloat)
        const exclParts = [...excludedTokens].slice(-15).map(t => `-inurl:${t}`);
        const fullQuery = exclParts.length > 0
          ? `${params.query} ${exclParts.join(" ")}`
          : params.query;

        const { results, source: src } = await singleSearch(fullQuery, signal);
        source = src;

        let newCount = 0;
        for (const r of results) {
          if (seenUrls.has(r.url)) continue;
          seenUrls.add(r.url);
          allResults.push({ ...r, round });
          newCount++;

          // Extract exclusion tokens from this URL for future rounds
          const tokens = extractExclusionTokens(r.url, queryWords);
          for (const t of tokens) excludedTokens.add(t);
        }

        // Stop if no new results found
        if (newCount === 0) break;
      }

      if (allResults.length === 0) {
        return { content: [{ type: "text", text: `No results found for: ${params.query}` }], details: { query: params.query, count: 0 } };
      }

      const text = allResults.map((r, i) =>
        `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${String(r.content || "").slice(0, 300)}`
      ).join("\n\n");

      return {
        content: [{ type: "text", text }],
        details: { source, query: params.query, count: allResults.length, rounds: Math.min(maxRounds, allResults[allResults.length - 1]?.round ?? 1) },
      };
    },
    renderCall(args, theme) {
      const mode = args.mode === "simple" ? " [simple]" : args.rounds ? ` [deep ×${args.rounds}]` : " [deep ×3]";
      return new Text(theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("dim", args.query + mode), 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
      if (result.isError) return new Text(theme.fg("error", "Failed"), 0, 0);
      const c = result.details?.count ?? 0;
      if (c === 0) return new Text(theme.fg("warning", "No results"), 0, 0);
      const rounds = result.details?.rounds;
      const suffix = rounds > 1 ? ` in ${rounds} rounds` : "";
      return new Text(theme.fg("success", `✓ ${c} result(s)${suffix}`), 0, 0);
    },
  });

  // ── web_fetch ────────────────────────────────────────────────
  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch and extract text content from a web page URL. Use after web_search to read a specific result in detail.",
    promptSnippet: "Fetch full text content from a URL",
    promptGuidelines: [
      "Use web_fetch after web_search to read a promising result in detail.",
      "web_fetch extracts the main text content.",
      "Use for reading documentation pages, blog posts, API references, or any web page you need to understand deeply.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "Full URL to fetch content from." }),
    }),
    async execute(_id, params, signal, _onUpdate, _ctx) {
      const resp = await fetch(params.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; pi-search-plus/1.0)" },
        signal,
      });
      if (!resp.ok) return err(`HTTP ${resp.status} fetching ${params.url}`);
      const html = await resp.text();
      // Use Readability to extract main content (article body), strip nav/ads/sidebar
      let title = "";
      let text = "";
      try {
        const { JSDOM } = await import("jsdom");
        const { Readability } = await import("@mozilla/readability");
        const dom = new JSDOM(html, { url: params.url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        if (article?.textContent) {
          title = article.title || "";
          text = article.textContent.replace(/\s+/g, " ").trim();
        }
      } catch {
        // Fallback: strip tags manually if readability not available
        text = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
          .replace(/\s+/g, " ").trim();
      }
      const header = title ? `Title: ${title}\n\n` : "";
      return { content: [{ type: "text", text: truncatePage(header + (text || "(no text content extracted)")) }] };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("web_fetch ")) + theme.fg("dim", args.url), 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Fetching..."), 0, 0);
      if (result.isError) return new Text(theme.fg("error", "Failed"), 0, 0);
      return new Text(theme.fg("success", "✓ Page fetched"), 0, 0);
    },
  });

  // ── paper_search ────────────────────────────────────────────
  pi.registerTool({
    name: "paper_search",
    label: "Paper Search",
    description:
      "Search academic papers via Semantic Scholar API. Returns titles, authors, year, citation count, venue, and abstracts. Covers 200M+ papers across all disciplines. Free, no API key required.",
    promptSnippet: "Search academic papers (Semantic Scholar): title, authors, citations, abstract",
    promptGuidelines: [
      "Use paper_search for academic/literature/scientific queries. It searches real published papers, not web pages.",
      "paper_search is ideal for: finding research on a topic, checking if a claim has academic backing, discovering key papers in a field.",
      "Combine paper_search with arxiv_search for computer science / math / physics preprints, and with wiki_search for definitions.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query. Use keywords, author names, or paper titles." }),
      max_results: Type.Optional(Type.Number({ description: "Max results (default: 5)", default: 5 })),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const maxResults = Math.min(params.max_results ?? 5, 20);
      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(params.query)}&limit=${maxResults}&fields=title,authors,year,citationCount,venue,abstract,externalIds`;
      const resp = await fetch(url, { headers: { "User-Agent": "pi-search-plus/1.0" } });
      if (!resp.ok) throw new Error(`Semantic Scholar API error: ${resp.status}`);
      const data = (await resp.json()) as any;
      const papers = data.data || [];
      if (papers.length === 0) {
        return { content: [{ type: "text", text: `No papers found for: ${params.query}` }], details: { query: params.query, count: 0 } };
      }
      const lines = papers.map((p: any, i: number) => {
        const title = p.title || "Untitled";
        const authors = fmtAuthors(p.authors);
        const year = p.year || "?";
        const citations = p.citationCount ?? 0;
        const venue = p.venue || (p.journal?.name ?? "");
        const abstract = (p.abstract || "").slice(0, 500);
        const ids: string[] = [];
        if (p.externalIds?.DOI) ids.push("DOI: " + p.externalIds.DOI);
        if (p.externalIds?.ArXiv) ids.push("arXiv: " + p.externalIds.ArXiv);
        const idStr = ids.length > 0 ? "  [" + ids.join(" | ") + "]" : "";
        let line = `${i + 1}. **${title}**\n   ${authors} (${year}) — cited ${citations}x`;
        if (venue) line += `  · ${venue}`;
        line += idStr;
        if (abstract) line += `\n   > ${abstract}`;
        return line;
      });
      return {
        content: [{ type: "text", text: lines.join("\n\n") }],
        details: { query: params.query, count: papers.length },
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("paper_search ")) + theme.fg("dim", args.query), 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
      if (result.isError) return new Text(theme.fg("error", "Failed"), 0, 0);
      const c = result.details?.count ?? 0;
      if (c === 0) return new Text(theme.fg("warning", "No results"), 0, 0);
      return new Text(theme.fg("success", `✓ ${c} paper(s)`), 0, 0);
    },
  });

  // ── arxiv_search ──────────────────────────────────────────
  pi.registerTool({
    name: "arxiv_search",
    label: "arXiv Search",
    description:
      "Search arXiv preprints. Returns titles, authors, abstract, and PDF links. Covers physics, math, CS, statistics, and related fields. Free, no API key required.",
    promptSnippet: "Search arXiv preprints: title, authors, abstract, PDF link",
    promptGuidelines: [
      "Use arxiv_search for cutting-edge research that may not yet be published in journals.",
      "Complement paper_search with arxiv_search to get the latest preprints alongside published papers.",
      "Each result includes a PDF link you can pass to pdf_read for full-text extraction.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query. Supports field prefixes: ti: (title), au: (author), abs: (abstract), all: (default)." }),
      max_results: Type.Optional(Type.Number({ description: "Max results (default: 5)", default: 5 })),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const maxResults = Math.min(params.max_results ?? 5, 20);
      const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(params.query)}&start=0&max_results=${maxResults}&sortBy=relevance`;
      const resp = await fetch(url, { headers: { "User-Agent": "pi-search-plus/1.0" } });
      if (!resp.ok) throw new Error(`arXiv API error: ${resp.status}`);
      const xml = await resp.text();
      const entries = xml.split("<entry>").slice(1);
      if (entries.length === 0) {
        return { content: [{ type: "text", text: `No arXiv papers found for: ${params.query}` }], details: { query: params.query, count: 0 } };
      }
      const tag = (s: string, t: string): string => {
        const m = s.match(new RegExp(`<${t}[^>]*>(.*?)</${t}>`, "s"));
        return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
      };
      const lines = entries.map((entry, i) => {
        const title = tag(entry, "title");
        const authors = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g)
          ?.map(a => a.match(/<name>(.*?)<\/name>/)?.[1] || "").filter(Boolean).join(", ") || "Unknown";
        const summary = tag(entry, "summary").slice(0, 400);
        const arxivId = tag(entry, "id").split("/abs/").pop() || "";
        const pdfLink = arxivId ? `https://arxiv.org/pdf/${arxivId}` : "";
        let line = `${i + 1}. **${title}**\n   ${authors}`;
        if (arxivId) line += `  [arXiv:${arxivId}](${pdfLink})`;
        if (summary) line += `\n   > ${summary}`;
        return line;
      });
      return {
        content: [{ type: "text", text: lines.join("\n\n") }],
        details: { query: params.query, count: lines.length },
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("arxiv_search ")) + theme.fg("dim", args.query), 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
      if (result.isError) return new Text(theme.fg("error", "Failed"), 0, 0);
      const c = result.details?.count ?? 0;
      if (c === 0) return new Text(theme.fg("warning", "No results"), 0, 0);
      return new Text(theme.fg("success", `✓ ${c} preprint(s)`), 0, 0);
    },
  });

  // ── wiki_search ────────────────────────────────────────────
  pi.registerTool({
    name: "wiki_search",
    label: "Wikipedia Search",
    description:
      "Search Wikipedia articles. Returns titles, snippets, and page IDs. Free, no API key required.",
    promptSnippet: "Search Wikipedia: title, snippet, page link",
    promptGuidelines: [
      "Use wiki_search for definitions, historical facts, biographies, and general knowledge.",
      "Verify critical facts with paper_search or web_search.",
      "You can fetch the full article text with web_fetch.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query." }),
      max_results: Type.Optional(Type.Number({ description: "Max results (default: 5)", default: 5 })),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const maxResults = Math.min(params.max_results ?? 5, 15);
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(params.query)}&srlimit=${maxResults}&format=json&origin=*`;
      const resp = await fetch(url, { headers: { "User-Agent": "pi-search-plus/1.0" } });
      if (!resp.ok) throw new Error(`Wikipedia API error: ${resp.status}`);
      const data = (await resp.json()) as any;
      const results = data.query?.search || [];
      if (results.length === 0) {
        return { content: [{ type: "text", text: `No Wikipedia articles found for: ${params.query}` }], details: { query: params.query, count: 0 } };
      }
      const lines = results.map((r: any, i: number) => {
        const title = r.title;
        const snippet = (r.snippet || "").replace(/<[^>]+>/g, "");
        const link = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
        return `${i + 1}. **${title}**  — [link](${link})\n   > ${snippet}`;
      });
      return {
        content: [{ type: "text", text: lines.join("\n\n") }],
        details: { query: params.query, count: lines.length },
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("wiki_search ")) + theme.fg("dim", args.query), 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
      if (result.isError) return new Text(theme.fg("error", "Failed"), 0, 0);
      const c = result.details?.count ?? 0;
      if (c === 0) return new Text(theme.fg("warning", "No results"), 0, 0);
      return new Text(theme.fg("success", `✓ ${c} article(s)`), 0, 0);
    },
  });

  // ── book_search ───────────────────────────────────────────
  pi.registerTool({
    name: "book_search",
    label: "Book Search",
    description:
      "Search books via Open Library API. Returns titles, authors, publication years, and cover links. Free, no API key required.",
    promptSnippet: "Search books by title, author, or subject",
    promptGuidelines: [
      "Use book_search to find books by title, author, or subject keyword.",
      "Open Library covers millions of books.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search by title, author name, or subject keyword." }),
      max_results: Type.Optional(Type.Number({ description: "Max results (default: 5)", default: 5 })),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const maxResults = Math.min(params.max_results ?? 5, 15);
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(params.query)}&limit=${maxResults}`;
      const resp = await fetch(url, { headers: { "User-Agent": "pi-search-plus/1.0" } });
      if (!resp.ok) throw new Error(`Open Library API error: ${resp.status}`);
      const data = (await resp.json()) as any;
      const docs = data.docs || [];
      if (docs.length === 0) {
        return { content: [{ type: "text", text: `No books found for: ${params.query}` }], details: { query: params.query, count: 0 } };
      }
      const lines = docs.map((d: any, i: number) => {
        const title = d.title || "Untitled";
        const authors = (d.author_name || []).slice(0, 3).join(", ") || "Unknown";
        const year = d.first_publish_year || "?";
        const subjects = (d.subject || []).slice(0, 3).join(", ");
        let line = `${i + 1}. **${title}**`;
        if (d.subtitle) line += `: ${d.subtitle}`;
        line += `\n   ${authors} (${year})`;
        if (subjects) line += `  · ${subjects}`;
        if (d.cover_i) line += `  [cover](https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg)`;
        return line;
      });
      return {
        content: [{ type: "text", text: lines.join("\n\n") }],
        details: { query: params.query, count: lines.length },
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("book_search ")) + theme.fg("dim", args.query), 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
      if (result.isError) return new Text(theme.fg("error", "Failed"), 0, 0);
      const c = result.details?.count ?? 0;
      if (c === 0) return new Text(theme.fg("warning", "No results"), 0, 0);
      return new Text(theme.fg("success", `✓ ${c} book(s)`), 0, 0);
    },
  });
}
