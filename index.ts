import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─── Helpers ────────────────────────────────────────────────────
function fmtAuthors(authors: Array<{ name: string }>): string {
  if (!authors || authors.length === 0) return "Unknown";
  return authors.slice(0, 5).map(a => a.name).join(", ") + (authors.length > 5 ? " et al." : "");
}

async function isOllamaLocalAvailable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch("http://localhost:11434/api/tags", { signal: ctrl.signal });
    return r.ok;
  } catch { return false; }
}

// ─── DuckDuckGo fallback search ────────────────────────────────
async function ddgSearch(query: string, maxResults: number): Promise<Array<{ title: string; url: string; content: string }>> {
  const url = `https://lite.duckduckgo.com/lite?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; pi-search-plus/1.0)" } });
  const html = await resp.text();

  const results: Array<{ title: string; url: string; content: string }> = [];
  // Parse DuckDuckGo Lite HTML: each result is a <tr> with <a> link and <td class="result-snippet">
  const rows = html.split('<tr class="result-snippet">').slice(1);
  for (const row of rows) {
    if (results.length >= maxResults) break;
    const linkMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/);
    const snippetMatch = row.match(/<td class="result-snippet">([\s\S]*?)<\/td>/);
    if (linkMatch) {
      // DDG Lite URLs are redirects like //duckduckgo.com/l/?uddg=...
      let url = linkMatch[1].replace(/^\/\//, "https://");
      if (url.includes("/l/?uddg=")) {
        const decoded = decodeURIComponent(url.split("/l/?uddg=")[1]?.split("&")[0] || url);
        url = decoded;
      }
      results.push({
        title: linkMatch[2].trim(),
        url,
        content: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "",
      });
    }
  }
  return results;
}

export default function (pi: ExtensionAPI) {

  // ── web_search — Ollama local (primary) or DuckDuckGo (fallback) ──
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for real-time information, news, forum discussions, documentation, and any web content. Uses local Ollama search if available, falls back to DuckDuckGo.",
    promptSnippet: "Search the web for any topic, news, docs, or discussions",
    promptGuidelines: [
      "Use web_search as your DEFAULT for any factual or current query. It searches the entire web — news, forums, docs, blogs, everything.",
      "web_search is NOT limited to academic or encyclopedic content. Use it for: latest news, StackOverflow answers, GitHub issues, tech blogs, forum discussions, product reviews, documentation, and general information.",
      "For academic papers specifically, use paper_search. For definitions, wiki_search is also good. But web_search should be your DEFAULT.",
      "Always search before answering factual questions — your training data has a cutoff.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query. Be specific — include version numbers, dates, or site: filters for best results." }),
      max_results: Type.Optional(Type.Number({ description: "Max results (default: 5)", default: 5 })),
    }),
    async execute(_id, params, signal, _onUpdate, _ctx) {
      const maxResults = Math.min(params.max_results ?? 5, 10);

      // Try local Ollama first
      if (await isOllamaLocalAvailable()) {
        try {
          const resp = await fetch("http://localhost:11434/api/experimental/web_search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: params.query, max_results: maxResults }),
            signal,
          });
          if (resp.ok) {
            const data = (await resp.json()) as any;
            const results = data.results || [];
            if (results.length > 0) {
              const formatted = results.map((r: any, i: number) =>
                `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content}`
              ).join("\n\n");
              return {
                content: [{ type: "text", text: formatted }],
                details: { source: "ollama-local", query: params.query, count: results.length },
              };
            }
          }
        } catch { /* fall through to DDG */ }
      }

      // Fallback: DuckDuckGo
      const results = await ddgSearch(params.query, maxResults);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No results found for: " + params.query }],
          details: { query: params.query, count: 0 },
        };
      }
      const formatted = results.map((r: any, i: number) =>
        `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content}`
      ).join("\n\n");
      return {
        content: [{ type: "text", text: formatted }],
        details: { source: "duckduckgo", query: params.query, count: results.length },
      };
    },
  });

  // ── web_fetch — Ollama local (primary) or direct HTTP (fallback) ──
  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch and extract text content from a web page URL. Use after web_search to read a specific result in full.",
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
      // Try local Ollama first
      if (await isOllamaLocalAvailable()) {
        try {
          const resp = await fetch("http://localhost:11434/api/experimental/web_fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: params.url }),
            signal,
          });
          if (resp.ok) {
            const data = (await resp.json()) as any;
            return {
              content: [{ type: "text", text: [`Title: ${data.title}`, "", data.content].join("\n") }],
              details: { source: "ollama-local", title: data.title, url: params.url },
            };
          }
        } catch { /* fall through */ }
      }

      // Fallback: direct HTTP fetch
      const resp = await fetch(params.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; pi-search-plus/1.0)" },
        signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${params.url}`);
      const html = await resp.text();

      // Simple text extraction: strip tags
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);

      return {
        content: [{ type: "text", text: text || "(no text content extracted)" }],
        details: { source: "direct", url: params.url },
      };
    },
  });

  // ── paper_search — Semantic Scholar ────────────────────────
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
        return {
          content: [{ type: "text", text: "No papers found for: " + params.query }],
          details: { query: params.query, count: 0 },
        };
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

        let line = `${i + 1}. **${title}**\n`;
        line += `   ${authors} (${year}) — cited ${citations}×`;
        if (venue) line += `  · ${venue}`;
        line += idStr;
        if (abstract) line += `\n   > ${abstract}`;
        return line;
      });

      return {
        content: [{ type: "text", text: lines.join("\n\n") }],
        details: { query: params.query, count: papers.length, papers },
      };
    },
  });

  // ── arxiv_search — arXiv API ───────────────────────────────
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
        return {
          content: [{ type: "text", text: "No arXiv papers found for: " + params.query }],
          details: { query: params.query, count: 0 },
        };
      }

      const tag = (xml: string, t: string): string => {
        const m = xml.match(new RegExp(`<${t}[^>]*>(.*?)</${t}>`, "s"));
        return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
      };

      const lines = entries.map((entry, i) => {
        const title = tag(entry, "title");
        const authors = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g)
          ?.map(a => a.match(/<name>(.*?)<\/name>/)?.[1] || "")
          .filter(Boolean).join(", ") || "Unknown";
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
  });

  // ── wiki_search — Wikipedia API ────────────────────────────
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
        return {
          content: [{ type: "text", text: "No Wikipedia articles found for: " + params.query }],
          details: { query: params.query, count: 0 },
        };
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
  });

  // ── book_search — Open Library API ─────────────────────────
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
        return {
          content: [{ type: "text", text: "No books found for: " + params.query }],
          details: { query: params.query, count: 0 },
        };
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
  });
}
