# pi-ollama-search

Complete search toolkit for [pi coding agent](https://github.com/earendil-works/pi-mono). **web_search is your default for any factual query** — it covers news, forums, docs, blogs, and the entire open web. Plus academic papers, Wikipedia, and books. All free, no API keys.

## Install

```bash
pi install git:github.com/inouemoby/pi-ollama-search
```

Automatically installs `@ollama/pi-web-search` as a dependency — no extra steps needed.

## Tools

| Priority | Tool | What It Searches | Source |
|----------|------|------------------|--------|
| **#1** | `web_search` | The ENTIRE web — news, StackOverflow, Reddit, GitHub Issues, blogs, docs, reviews, everything | @ollama/pi-web-search |
| | `web_fetch` | Read any URL's full text content | @ollama/pi-web-search |
| | `paper_search` | 200M+ academic papers | Semantic Scholar |
| | `arxiv_search` | Preprints in CS, math, physics, stats | arXiv |
| | `wiki_search` | Wikipedia articles | Wikipedia |
| | `book_search` | Books | Open Library |

## Skill

The `search-plus` skill aggressively redirects the LLM away from memory-based answers:

> "web_search is your DEFAULT for ANY factual query. Use proactively — your knowledge cutoff is real. When in doubt, SEARCH. When not in doubt, SEARCH ANYWAY."

Five search strategy patterns + six anti-patterns (no guessing, no "based on my training data", no unsourced claims).

## License

MIT
