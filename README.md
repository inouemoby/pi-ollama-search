# pi-ollama-search

Complete search toolkit for [pi coding agent](https://github.com/earendil-works/pi-mono). **web_search is your default for any factual query** — it covers news, forums, docs, blogs, and the entire open web. Plus academic papers, Wikipedia, books, and page fetching. All free, no API keys.

## Install

```bash
pi install git:github.com/inouemoby/pi-ollama-search
```

## Tools

| Priority | Tool | What It Searches |
|----------|------|------------------|
| **#1** | `web_search` | The ENTIRE web — news, StackOverflow, Reddit, GitHub Issues, blogs, docs, reviews, everything |
| | `web_fetch` | Read any URL's full text content |
| | `paper_search` | 200M+ academic papers via Semantic Scholar |
| | `arxiv_search` | Preprints in CS, math, physics, stats |
| | `wiki_search` | Wikipedia articles |
| | `book_search` | Books via Open Library |

## Skill

The `search-plus` skill aggressively redirects the LLM away from memory-based answers:

> "web_search is your DEFAULT for ANY factual query. Use proactively — your knowledge cutoff is real. When in doubt, SEARCH. When not in doubt, SEARCH ANYWAY."

Five search strategy patterns + six anti-patterns (no guessing, no "based on my training data", no unsourced claims).

## License

MIT
