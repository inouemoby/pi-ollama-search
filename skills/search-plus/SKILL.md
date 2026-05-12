---
name: search-plus
description: Comprehensive search toolkit. Web search, academic papers (Semantic Scholar + arXiv), Wikipedia, books, images. Use proactively — your knowledge cutoff is real, and search bridges the gap. When in doubt, SEARCH.
---

# Search Plus — Complete Search Toolkit

You have access to a powerful suite of search tools. **USE THEM AGGRESSIVELY.** Your training data has a cutoff date. Search is your bridge to reality.

## Critical Rules

1. **DEFAULT TO SEARCHING.** If the user asks about anything factual, current, or specific — search first, then respond. Do NOT rely on your memory alone.
2. **SEARCH BEFORE CODING.** Before writing code that uses an API or library, search for the latest docs, version changes, or deprecations.
3. **SEARCH BEFORE CLAIMING.** Before stating a fact confidently, verify it. A wrong fact is worse than "I don't know."
4. **MULTI-SOURCE.** Use multiple search tools for important claims. Cross-reference web_search with paper_search or wiki_search.

## Available Tools

| Tool | Best For | Source |
|------|----------|--------|
| `web_search` | General web queries, news, documentation, current events | Ollama Cloud |
| `web_fetch` | Reading full page content from a URL | Ollama Cloud |
| `paper_search` | Academic papers, citations, literature review | Semantic Scholar (200M+ papers) |
| `arxiv_search` | Preprints in CS, math, physics, stats | arXiv |
| `wiki_search` | Definitions, encyclopedic facts, biographies | Wikipedia |
| `book_search` | Finding books by title/author/subject | Open Library |
| `image_search` | Finding images matching a description | Web search |

## When to Use Each Tool

### web_search — general queries
```
Use for: "What's new in React 19?" | "best practices for Kubernetes in 2026" | "Python 3.13 release notes"
```

### web_fetch — deep reading
```
Use AFTER web_search to read a specific promising result in full.
Use for: reading documentation pages, blog posts, API references.
```

### paper_search — academic rigor
```
Use for: "papers on attention mechanisms" | "latest research on RNA folding" | "who proved the Poincaré conjecture"
Each result shows: title, authors, year, citation count, venue, abstract.
```

### arxiv_search — bleeding edge
```
Use for: "latest diffusion model papers" | "quantum computing preprints 2026"
arXiv hosts preprints BEFORE peer review. Complement with paper_search.
```

### wiki_search — definitions & background
```
Use for: "what is a monad?" | "history of the printing press" | "capital of Burkina Faso"
Good for quick facts, NOT for cutting-edge technical details.
```

### book_search — published books
```
Use for: "books about compiler design" | "Steven Pinker books" | "books on Japanese history"
```

### image_search — find visuals
```
Use for: "ER diagram example" | "Gothic cathedral architecture" | "Python logo"
```

## Search Strategy Patterns

### Pattern 1: Fact Check
```
User: "Is Python 3.13 faster than 3.12?"
  1. web_search("Python 3.13 performance benchmarks")
  2. web_fetch the most credible benchmark result
  3. Answer with data, not opinion
```

### Pattern 2: Deep Research
```
User: "What's the state of AI code generation?"
  1. paper_search("AI code generation survey")
  2. web_search("best AI coding tools 2026")
  3. wiki_search("automated programming")
  4. Synthesize across sources
```

### Pattern 3: API / Library Usage
```
User: "Write code using the new Anthropic SDK"
  1. web_search("anthropic python sdk latest version 2026")
  2. web_fetch the official docs installation page
  3. Write code based on actual docs, not memory
```

### Pattern 4: Disambiguation
```
User: "What is Mercury?"
  1. wiki_search("Mercury")
  2. Check if planet, element, or Roman god is most relevant
  3. Ask clarifying question if ambiguous, or cover all briefly
```

### Pattern 5: Counter-Claim
```
User: "I heard Rust is slower than C++"
  1. web_search("Rust vs C++ performance benchmark 2026")
  2. paper_search("Rust performance evaluation")
  3. Present evidence, not opinion
```

## Error Handling

If a search returns nothing:
- Try different keywords
- Try a different tool (wiki vs web vs paper)
- If all fail: tell the user honestly and ask for clarification

If results seem wrong or outdated:
- Cross-reference with another tool
- Check dates on results
- Flag uncertainty to user

## Anti-Patterns — DO NOT

- ❌ "Based on my training data..." — SEARCH instead
- ❌ "I believe..." without citing a source — SEARCH instead
- ❌ Guessing an API method name — SEARCH instead
- ❌ Assuming a library version — SEARCH instead
- ❌ Answering factual questions from memory alone — SEARCH instead
- ❌ Only using one search when stakes are high — use multiple

## Remember

Your knowledge has a cutoff. The web does not. Every search makes you smarter. Every unsourced claim is a potential error. **When in doubt, search. When not in doubt, search anyway.**
