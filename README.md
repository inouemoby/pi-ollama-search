# pi-ollama-search

Comprehensive search toolkit for [pi coding agent](https://github.com/earendil-works/pi-mono). Augments Ollama Cloud's built-in web search with academic, encyclopedia, book, and image search — all free, no API keys required.

## Install

```bash
pi install git:github.com/inouemoby/pi-ollama-search
```

## Tools

| Tool | Source | Requires |
|------|--------|----------|
| `web_search` | Ollama Cloud | (built-in via @ollama/pi-web-search) |
| `web_fetch` | Ollama Cloud | (built-in via @ollama/pi-web-search) |
| `paper_search` | Semantic Scholar | Free, no key |
| `arxiv_search` | arXiv API | Free, no key |
| `wiki_search` | Wikipedia API | Free, no key |
| `book_search` | Open Library | Free, no key |
| `image_search` | Ollama Cloud web_search | Free |

## Skill

The `search-plus` skill aggressively teaches the LLM to search proactively:

- 5 search strategy patterns (fact check, deep research, API usage, disambiguation, counter-claim)
- 6 anti-patterns to avoid (guessing, unsourced claims, memory-only answers)
- Core rule: "When in doubt, search. When not in doubt, search anyway."

## License

MIT
