# pi-ollama-search

Complete search toolkit for [pi coding agent](https://github.com/earendil-works/pi-mono). **web_search is your default for any factual query** — it covers news, forums, docs, blogs, and the entire open web. Plus academic papers, Wikipedia, and books.

## Install

```bash
pi install git:github.com/inouemoby/pi-ollama-search
```

No other dependencies needed. `web_search` works out of the box with DuckDuckGo. Install [pi-ollama-cloud](https://github.com/inouemoby/pi-ollama-cloud) to enable higher-quality Ollama search results.

## Search Backends

`web_search` uses a 3-layer fallback chain:

| Priority | Backend | Quality | Setup |
|----------|---------|---------|-------|
| 1 | Ollama local | Best | Ollama running on `localhost:11434` |
| 2 | Ollama Cloud | Best | API key in `~/.pi/agent/auth.json` |
| 3 | DuckDuckGo | Good | None — always works |

`web_fetch` uses `@mozilla/readability` to extract article content, stripping nav bars, ads, and sidebars automatically.

### Enable Ollama Cloud Search

**Option A — Install pi-ollama-cloud (recommended):**

```bash
pi install git:github.com/inouemoby/pi-ollama-cloud
/login
# → "Use an API key" → "Ollama Cloud" → paste your key
```

This registers the Ollama Cloud provider **and** enables cloud search in this plugin.

**Option B — Set environment variable:**

```bash
export OLLAMA_CLOUD_API_KEY=your-key-here
```

**Option C — Manually add to auth.json:**

Edit `~/.pi/agent/auth.json` and add:

```json
{
  "ollama-cloud": {
    "type": "api_key",
    "key": "your-key-here"
  }
}
```

## Tools

| Tool | What It Searches | Backend |
|------|------------------|---------|
| `web_search` | The entire web — news, forums, docs, blogs, reviews | Ollama → Cloud → DuckDuckGo |
| `web_fetch` | Read any URL's full article text | Direct HTTP + Readability |
| `paper_search` | 200M+ academic papers | Semantic Scholar |
| `arxiv_search` | Preprints in CS, math, physics, stats | arXiv |
| `wiki_search` | Wikipedia articles | Wikipedia |
| `book_search` | Books by title, author, subject | Open Library |

## Skill

The `search-plus` skill ensures you search proactively and cite sources:

- **Always search** before answering factual questions
- **Always cite** the original link when using search results
- **5 search strategy patterns** (fact check, deep research, API usage, disambiguation, counter-claim)
- **6 anti-patterns** to avoid (no guessing, no unsourced claims, no memory-only answers)

## License

MIT
