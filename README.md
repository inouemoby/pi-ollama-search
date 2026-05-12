# pi-ollama-search

Complete search toolkit for [pi coding agent](https://github.com/earendil-works/pi-mono). **web_search is your default for any factual query** — it covers news, forums, docs, blogs, and the entire open web. Plus academic papers, Wikipedia, and books. Self-contained, all free, no API keys.

## Install

```bash
pi install git:github.com/inouemoby/pi-ollama-search
```

No other dependencies needed — this plugin is fully self-contained.

## Tools

| Priority | Tool | What It Searches | Backend |
|----------|------|------------------|---------|
| **#1** | `web_search` | The ENTIRE web — news, StackOverflow, Reddit, GitHub Issues, blogs, docs, reviews, everything | Ollama local / DuckDuckGo fallback |
| | `web_fetch` | Read any URL's full text content | Ollama local / Direct HTTP fallback |
| | `paper_search` | 200M+ academic papers | Semantic Scholar |
| | `arxiv_search` | Preprints in CS, math, physics, stats | arXiv |
| | `wiki_search` | Wikipedia articles | Wikipedia |
| | `book_search` | Books | Open Library |

Search output shows only a summary line (`Found X result(s) via Ollama local.`). Full results are stored in `details` for internal use, keeping the chat clean.

## Skill

The `search-plus` skill ensures you search proactively and cite sources:

- **Always search** before answering factual questions
- **Always cite** the original link when using search results
- **5 search strategy patterns** (fact check, deep research, API usage, disambiguation, counter-claim)
- **6 anti-patterns** to avoid (no guessing, no unsourced claims, no memory-only answers)

## License

MIT
