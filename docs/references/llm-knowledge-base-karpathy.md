How to create your own LLM knowledge bases today (full course):
If you're able to learn how to create an LLM knowledge base then you have essentially created your own "external brain" that you can utilise, on top of that, this could change how you run your business, your content, your network, your life, it can all be run through your own personalised external brains that you have access to. In fact, there's probably a market for creating this for local businesses in your community if you're able to connect to them and showcase them the value in creating an external brain for their entire business.
What happened?
Andrej Karpathy happened and showcased how he is using LLM knowledge bases which essentially work as external brains...
Andrej Karpathy
@karpathy
·
4月3日
LLM Knowledge Bases

Something I'm finding very useful recently: using LLMs to build personal knowledge bases for various topics of research interest. In this way, a large fraction of my recent token throughput is going less into manipulating code, and more into manipulating
さらに表示
So, I wanted to showcase this system in this complete guide, step by step, so I had some back and fourths with my mate claude and we decided that we'd chat through 3 versions to create LLM knowledge bases, here they are...
Pick your version:
Complete beginner > Click CTRL F and type: "YOUR FIRST KNOWLEDGE BASE"
Comfortable with AI tools > Click CTRL F and type: "THE FULL SYSTEM" and read it up to automation.
Builder / developer > Click CTRL F and type "THE FULL SYSTEM" and read it all the way through.
Before you do that ask yourself if you want to do this and read this:
Most people use AI like a search engine with amnesia.
You ask a question, get an answer, close the tab. Tomorrow you start from scratch. Nothing accumulates. Nothing compounds. You're burning tokens to rediscover the same context over and over again.
Karpathy's system flips this completely:
You collect raw material. Articles, papers, YouTube transcripts, PDFs, anything related to a topic you care about
The AI reads everything and writes a structured wiki. Summaries, concept explanations, connections between ideas, a master index
You ask questions against the wiki. It researches across its own compiled knowledge and gives you cited, synthesised answers
Every answer gets filed back into the wiki. So the next question benefits from all previous work
The AI periodically health-checks the wiki. Finding contradictions, gaps, outdated information, and fixing them
The result? A personal knowledge base that gets smarter every time you touch it.
After a month of feeding it, you have a deeply interlinked resource that no Google search could replicate. Because it's been synthesised, not just indexed.
This works for literally any topic. Crypto markets. Medical research. Legal case law. Competitive intelligence. Academic study. Philosophy. If you want to accumulate and connect knowledge over time, this is the system.
1: YOUR FIRST KNOWLEDGE BASE:
Zero tekkerzzz are required here (tekkerzzz is like British slang for a baller, which is British slang for someone who has skill with a football, which actually just means you got skills, I could have just said zero skills but that's not me, so zero tekkerzzz it is init)...
If you can install an app and copy-paste text, you can do this right now.
What you need
Obsidian (free). A note-taking app that works with plain text files. Download from obsidian.md. Mac, Windows, Linux, iOS, Android.
A Claude subscription ($20/month Pro at claude.ai). Or any AI chatbot you prefer: ChatGPT, Gemini, whatever.
That's it.
Step 1: Create your vault (2 minutes)
Open Obsidian. It'll ask you to create or open a "vault." A vault is just a folder on your computer where your notes live.
Click "Create new vault"
Name it something descriptive (e.g. "crypto-research" or "health-knowledge")
Choose where to save it (Documents folder is fine)
Click "Create"
You now have an empty vault. Obsidian watches this folder. Any markdown file you put inside will appear as a note automatically.
Step 2: Create two folders (1 minute)
In Obsidian's left sidebar, right-click and select "New folder". Create these two:
raw for your source material (articles, notes, anything you collect)
wiki for where the AI will build your compiled knowledge base
That's your entire starting structure.
Step 3: Add your first raw sources (5 minutes)
Pick a topic you're genuinely interested in. Find 3 to 5 good articles about it. For each one:
In Obsidian, right-click the raw folder > "New note"
Give it a descriptive name (e.g. "bitcoin-halving-2024-explainer")
Copy-paste the article text into the note
At the very top, add a line like: Source: [paste the URL here]
Don't overthink the formatting. Don't stress about structure. Just get the raw text in there.
Quick win: Install the Obsidian Web Clipper browser extension (free, Chrome/Firefox/Safari/Edge). It saves web pages directly into your vault as formatted markdown notes with one click. But for your first go, copy-paste is perfectly fine.
Step 4: Ask the AI to compile your wiki (5 minutes)
Open Claude (or your preferred AI). Copy and paste this prompt, replacing the bracketed sections:
markdown
I'm building a personal knowledge base about [YOUR TOPIC].

I have [NUMBER] source articles. I'm going to paste them below.
For each source, please:

1. Write a 200-word summary capturing the key points
2. List the main concepts mentioned (as a simple list)
3. Identify any connections between this source and the others

After processing all sources, please: 4. Write a "master index" listing every concept with a one-line
description 5. Write one "concept article" (300-500 words) for the single
most important concept across all sources

Format everything as markdown. Use [[double brackets]] around
concept names so they work as links in Obsidian.

Here are my sources:

[PASTE YOUR RAW NOTES HERE, separated by --- between each one]
Claude will produce structured output. Copy each section into a new note inside your wiki folder:
Save the summaries as individual notes (e.g. wiki/summary-bitcoin-halving.md)
Save the master index as wiki/index.md
Save the concept article in wiki/ with a descriptive name
Step 5: See the magic
Open Obsidian's Graph View (click the graph icon in the left sidebar, or press Ctrl/Cmd+G).
You'll see your notes as dots, connected by the [[wikilinks]] the AI created. This is your knowledge base, visualised as a network of connected ideas.
Click on any [[linked concept]] in a note. If a page exists for it, Obsidian opens it. If it doesn't exist yet, Obsidian offers to create it. This is how the wiki grows organically.
You now have a working knowledge base. Everything from here is about making it bigger, faster, and more powerful.
Growing Your Knowledge Base (The Daily Habit)
Once you have the basic structure, the workflow becomes dead simple:
Adding new sources
Whenever you read something worth keeping:
Clip or paste it into your raw folder
Open Claude and paste this:
markdown
I'm adding a new source to my knowledge base about [TOPIC].

Here is my current wiki index (so you know what already exists):
[PASTE the contents of wiki/index.md]

Here is the new source:
[PASTE the new article]

Please:

1. Write a summary of this source
2. Update my index with any new concepts
3. Note any connections to existing concepts (mark these with
   [[wikilinks]])
4. Flag anything that contradicts existing wiki content with ⚠️
   Save the outputs into your wiki folder, replacing the old index with the updated one
   Asking questions
   This is where it gets genuinely powerful. Once you have 10+ compiled articles:
   markdown
   Here is my knowledge base index:
   [PASTE wiki/index.md]

My question: [YOUR QUESTION]

Please research the answer using the concepts and sources in my
wiki. If you need to see specific articles, tell me which ones
and I'll paste them. Cite your sources using [[wikilinks]].

After answering, save the answer as a markdown file I can add
to my wiki.
The critical habit: always file the answer back into the wiki. Save it in your wiki folder. This is the compounding loop. Every question enriches the base for future questions.
Weekly health check
Once a week, paste your full index to Claude with this:
markdown
Here is my knowledge base index:
[PASTE wiki/index.md]

Please perform a health check:

1. Which concepts are mentioned but don't have their own article
   yet? (These are gaps I should fill)
2. Are any summaries likely outdated? (Flag anything over 6 months
   old)
3. What are 3 interesting questions I could research next?
4. Are there orphan concepts with no connections to other topics?
   Three interactions per week. One or two source additions, an occasional question, and a health check. That's all it takes for the knowledge base to grow steadily.
   2: THE FULL SYSTEM:
   The Full System: Architecture and Setup
   Everything above works with just Obsidian and Claude Chat. But if you want the system Karpathy actually described, where the AI handles file creation, maintenance, and indexing automatically, here's the complete architecture.
   The three-layer design
   Layer 1: Raw sources (raw/ folder). Your single source of truth. The AI reads from here but never modifies it. Articles, papers, repos, datasets, images all go here. Think of it as your library's intake shelf.
   Layer 2: The compiled wiki (wiki/ folder). AI-generated and AI-maintained. Summaries, concept articles, entity pages (people, organisations, tools), cross-links, indexes, and query outputs all live here. You rarely edit this directly. The AI does the writing.
   Layer 3: The schema (CLAUDE.md file). A configuration document that tells the AI how the wiki is structured, what naming conventions to follow, and what operations are available. This is the programme that controls the AI's behaviour. Lives in your vault's root folder.
   The four operational cycles
   These repeat continuously, compounding the wiki's value:
   Ingest. You add raw sources. The AI reads them and creates summaries, concept pages, and connections.
   Compile. The AI builds and updates wiki pages, maintains the index, and weaves new information into the existing structure.
   Query. You ask questions. The AI researches across the wiki and produces cited answers, which get filed back.
   Lint. The AI health-checks for contradictions, gaps, broken links, stale content, and missing pages. It fixes what it can and flags what it can't.
   The complete folder structure
   Create this inside your Obsidian vault:
   markdown
   my-knowledge-base/
   ├── raw/
   │ ├── articles/ ← Web-clipped articles
   │ ├── papers/ ← Academic papers, PDFs
   │ ├── repos/ ← Code documentation
   │ ├── datasets/ ← Dataset descriptions
   │ └── assets/ ← Images from sources
   ├── wiki/
   │ ├── index.md ← Master index (AI-maintained)
   │ ├── log.md ← Activity log (AI-maintained)
   │ ├── concepts/ ← One file per concept
   │ │ └── \_index.md ← Category overview
   │ ├── entities/ ← People, orgs, tools
   │ │ └── \_index.md
   │ ├── sources/ ← One summary per raw source
   │ │ └── \_index.md
   │ ├── syntheses/ ← Cross-cutting analyses
   │ │ └── \_index.md
   │ ├── outputs/ ← Filed query results
   │ │ └── \_index.md
   │ └── attachments/
   │ └── images/ ← AI-generated charts, diagrams
   ├── templates/ ← Note templates
   └── CLAUDE.md ← AI schema/instructions
   You don't need every subfolder on day one. Start with raw/, wiki/, and CLAUDE.md. Add subfolders as the wiki grows.
   Naming your files
   Use kebab-case (lowercase, words separated by hyphens) for all filenames:
   active-inference.md ✓
   Active Inference.md ✗
   active_inference.md ✗
   For source summaries, use author-year-short-title.md (e.g. friston-2010-free-energy.md). For concepts, use the concept name directly (e.g. transformer-architecture.md).
   Why this matters: kebab-case works across every operating system, is URL-friendly, and AI references it consistently. Trust me on this one. You'll thank yourself later when you have 200+ files.
   Setting Up Your AI Environment
   The fundamental workflow is identical regardless of which tool you pick. The AI reads your markdown files, processes them, and produces markdown output. What changes is how the AI accesses your files.
   Option A: Claude Chat (Easiest, No Technical Skill Required)
   This is what most people should start with.
   Claude Chat at claude.ai can't write files to your computer directly. You work in a copy-paste loop: upload or paste your files, ask Claude to process them, copy the output back into your vault.
   Setup:
   Go to claude.ai and sign in (Pro subscription at $20/month recommended)
   Create a Project (left sidebar > Projects > New Project)
   In the Project instructions, paste the contents of your CLAUDE.md file
   Upload your raw sources and existing wiki files to the Project
   Every conversation in that Project now has persistent context. Claude remembers your wiki structure and conventions across conversations.
   The workflow:
   Paste new sources > Claude generates wiki pages > you copy them into Obsidian
   Ask questions > Claude produces cited answers > you save them as notes
   Request a health check > Claude identifies issues > you apply fixes
   Yes, it's manual. But it works reliably and requires zero terminal knowledge.
   Option B: Claude Code (Most Powerful, Requires Terminal Comfort)
   Claude Code is Anthropic's command-line tool with full filesystem access. It reads, writes, creates, and modifies files directly. Ideal for automated wiki maintenance.
   Before choosing this option:
   You need basic terminal comfort (navigating folders, running commands)
   Minimum Pro subscription at $20/month, Max plans at $100 or $200/month for heavier usage
   No free tier for Claude Code
   Okay if you want to continue then go to Claude Code and start a session.
   Navigate to your vault folder in the terminal and type claude to start a session. Claude Code automatically reads your CLAUDE.md file from the vault root.
   Why this is powerful: Claude Code can read all your files, create new wiki pages, edit existing ones, run search tools, and execute scripts. All without you copying and pasting anything. A single prompt like "process all new files in raw/" triggers the entire ingest-compile cycle automatically.
   Option C: Other AI Tools
   Several alternatives support this workflow as well but I'm using Claude Code but Codex would also work because the core requirement for any tool is the same: read markdown files in, produce markdown files out.
   Writing CLAUDE.md: The Schema That Controls Everything
   The CLAUDE.md file is the single most important file in your system. It tells the AI exactly how your wiki is structured, what rules to follow, and what operations it can perform.
   Think of it as a job description for your AI research librarian.
   If you're using Claude Code, this file loads automatically at the start of every session. If you're using Claude Chat, paste it into your Project instructions or at the start of each conversation.
   The template (copy this, customise the first line)
   markdown

# LLM Knowledge Base — Schema

## Overview

Personal knowledge base on [YOUR TOPIC HERE — e.g., "DeFi protocols
and yield strategies" or "machine learning fundamentals"]. Raw sources
live in raw/. The compiled wiki lives in wiki/. You (the AI) maintain
all wiki content. I direct strategy; you execute compilation,
maintenance, and queries.

## Directory Structure

- raw/ — Source material (read-only for you, I add files here)
- wiki/index.md — Master index linking every page with a one-line
  summary
- wiki/log.md — Append-only changelog of all operations
- wiki/concepts/ — One article per concept
- wiki/entities/ — People, organisations, tools (one per file)
- wiki/sources/ — One summary per raw source document
- wiki/syntheses/ — Cross-cutting analysis articles
- wiki/outputs/ — Filed answers to my queries

## File Conventions

- All filenames: kebab-case, lowercase (e.g., active-inference.md)
- Source summaries: {author}-{year}-{short-title}.md
- ## Every page MUST have YAML frontmatter at the top:
  title: "Page Title"
  date_created: YYYY-MM-DD
  date_modified: YYYY-MM-DD
  summary: "One to two sentences describing this page"
  tags: [topic-tag, domain-tag]
  type: concept | entity | source | synthesis | output
  status: draft | review | final
  ***
- Use [[wikilinks]] for all internal cross-references
- Link only the first occurrence of a concept per section
- Bold key terms on first use in each article

## Operations

### INGEST (when I add new raw sources)

1. Read the new source document
2. Create a source summary in wiki/sources/
3. Identify concepts and entities mentioned
4. Create new concept/entity pages if they don't exist yet
5. Update existing pages with new information (append, don't
   rewrite from scratch)
6. Add [[wikilinks]] to connect new content to existing pages
7. Update wiki/index.md with new entries
8. Append to wiki/log.md

### QUERY (when I ask a question)

1. Read wiki/index.md to understand available content
2. Read the relevant wiki pages
3. Synthesise an answer with citations to wiki pages
4. Save the answer as wiki/outputs/{question-slug}.md
5. Update wiki/index.md and wiki/log.md

### LINT (periodic health check)

1. Find contradictions between pages
2. Find orphan pages (no inbound links)
3. Find broken [[wikilinks]]
4. Identify missing frontmatter fields
5. Flag stale content (source date >6 months, no updates)
6. Suggest new articles for frequently mentioned but unlinked
   concepts
7. Output a report and fix what you can automatically

## Page Creation Threshold

- Create a full concept/entity page when a subject appears in 2+
  sources
- For single-mention subjects, create a stub page (frontmatter +
  one-line definition + link back to the source that mentioned it)
- Never leave a [[wikilink]] pointing to nothing — always create
  at least a stub

## Quality Standards

- Summaries: 200-500 words, synthesise — don't copy
- Concept articles: 500-1500 words with a clear lead section
- Always trace claims to specific source pages
- Flag contradictions with ⚠️, noting both positions
- Prefer recency when sources conflict
  Keep this file concise. Every line eats into your AI context window budget. Tell the AI how to find information rather than including everything inline. The template above is deliberately under 80 lines. Resist the urge to over-specify.
  Supercharging Data Collection with the Web Clipper
  Manually copying articles works, but the Obsidian Web Clipper browser extension makes collection dramatically faster. One click turns a web page into a clean markdown note inside your vault.
  Installation
  Install the free, open-source extension from your browser's extension store (Chrome, Firefox, Safari, Edge). Click the Obsidian icon in your browser toolbar, then the gear icon to configure.
  Configuration
  Set these:
  General > Vault: Type your vault name exactly as it appears in Obsidian
  Templates > Default template > Note location: Set to raw/articles/
  Templates > Default template > Properties: Add these metadata fields:
  yaml

---

title: "{{title}}"
source: "{{url}}"
author: "{{author}}"
published: "{{published}}"
clipped: "{{date}}"
tags:

- raw
  type: article
  status: raw

---

Templates > Default template > Note content: Set to {{content}}
What this gives you
Reading an article worth saving? Click the Obsidian icon in your browser toolbar, confirm the template, click "Add to Obsidian". Done. The article appears as a formatted markdown note in your raw/articles/ folder, ready for the AI to process.
Making images work offline
By default, the Web Clipper saves images as web links, which break when pages go offline. Fix this with the Local Images Plus plugin:
In Obsidian: Settings > Community Plugins > Turn off Restricted Mode > Browse
Search for "Local images plus" and install it
In the plugin settings, set the download folder to raw/assets/
Run the "Localise attachments" command after clipping sessions
This downloads all referenced images locally. Everything works offline and the AI can reference images if you're using a vision-capable model.
Converting non-web sources
For PDFs, Word docs, and other files, use MarkItDown (a free tool by Microsoft):
bash
pip install markitdown
markitdown document.pdf > raw/papers/document-name.md
Not comfortable with the command line? Open the PDF, select all, copy, paste into a new note in raw/. Formatting won't be perfect, but the AI only needs the text content.
Wiki Compilation: Turning Raw Sources Into Structured Knowledge
This is the core operation. You've collected sources. Now the AI compiles them into a living wiki.
First-time compilation
If using Claude Code, navigate to your vault in the terminal and run: claude, and then enter:
markdown
Read CLAUDE.md for project conventions. Then read all files in
raw/articles/. For each raw source:

1. Create a source summary page in wiki/sources/
2. Identify key concepts and entities
3. Create concept pages in wiki/concepts/ and entity pages
   in wiki/entities/
4. Add cross-references between all related pages using
   [[wikilinks]]
5. Generate wiki/index.md with categorised links and one-line
   summaries
6. Generate wiki/log.md with entries for each operation
   Start with the first 5 sources, then continue with the rest.
   If using Claude Chat, upload your raw source files (or paste them) along with your CLAUDE.md, and use the same prompt. You'll need to copy each generated page into the correct folder manually.
   For ten articles, expect roughly 10 source summaries, 15 to 30 concept/entity pages, and a comprehensive index. Typically takes one conversation with a few follow-ups.
   Incremental compilation (adding new sources)
   After the initial build, each new source triggers an incremental update rather than reprocessing everything:
   markdown
   A new source has been added: raw/articles/new-article-title.md
   Read it, then read wiki/index.md to understand existing coverage.
   Produce:
7. A new source summary page
8. Updates to EXISTING pages (append, don't rewrite)
9. New concept/entity pages if needed
10. Updated index.md and log.md entries
    Flag any contradictions with existing wiki content using ⚠️
    This is the key efficiency principle: the AI integrates new sources into the existing structure rather than rebuilding from scratch. Fast and token-efficient.
    When things go wrong (and they will)
    The AI will occasionally produce imperfect output. Completely normal. Here's what you'll run into:
    Missing or malformed frontmatter. The AI sometimes forgets the YAML block at the top of a page, or gets the formatting wrong. Fix: remind it in your next prompt ("please ensure all pages have complete YAML frontmatter as specified in CLAUDE.md").
    Broken wikilinks. The AI creates a [[link]] to a page that doesn't exist yet. Fix: this is actually fine. In Obsidian, clicking a broken link offers to create the page. You can also ask the AI to create stub pages for all unlinked concepts during a lint pass.
    Hallucinated connections. The AI claims two concepts are related when the source material doesn't support it. Fix: this is exactly why you keep raw sources immutable. You can always check claims against the originals. Flag suspicious connections and ask the AI to verify with specific citations.
    Context window overflow. If your wiki gets large, the AI can't read everything at once. Fix: always start with the index file, then load only the specific pages needed.
    The Master Index: How the AI Navigates Your Wiki
    The index file is what makes this entire system work without complex database infrastructure. It's a table of contents the AI reads first, allowing it to decide which specific pages to load for any given task.
    What a good index looks like (example):
    markdown

---

title: "Wiki Index"
date_modified: 2026-04-06
total_articles: 47

---

# Wiki Index

## Overview

This wiki covers DeFi yield strategies and protocol analysis.
47 articles compiled from 32 raw sources.

## Concepts (18 articles)

- [[automated-market-maker]] — Mechanism for decentralised token
  exchange using liquidity pools instead of order books | sources: 5
- [[impermanent-loss]] — Opportunity cost faced by liquidity
  providers when token prices diverge | sources: 3
- [[yield-farming]] — Strategy of deploying capital across DeFi
  protocols to maximise returns | sources: 7

## Entities (12 articles)

- [[uniswap]] — Largest decentralised exchange by volume,
  pioneered the constant product AMM | sources: 6
- [[aave]] — Lending protocol enabling variable and stable rate
  borrowing | sources: 4

## Source Summaries (32 articles)

- [[adams-2024-uniswap-v4]] — "Uniswap v4: Architecture" | tags: paper, dex

## Recently Added

1. [2026-04-06] [[concentrated-liquidity]] (concept)
2. [2026-04-05] [[eigenlayer-restaking]] (concept)
   Each entry has a [[wikilink]], a roughly 50-word summary, key tags, and source count. This format lets the AI scan your entire wiki's contents in about 6,500 tokens for 100 articles. Trivially small compared to modern context windows.
   The activity log
   wiki/log.md is an append-only record tracking every operation:
   markdown

# Wiki Log

## [2026-04-06] ingest | Uniswap V4 Paper

- Created: wiki/sources/adams-2024-uniswap-v4.md
- Updated: wiki/concepts/automated-market-maker.md
- Created: wiki/concepts/concentrated-liquidity.md (new)

## [2026-04-06] query | How do AMM affect MEV?

- Filed: wiki/outputs/amm-hooks-mev-impact.md
  Full audit trail. Helps the AI understand what's been done recently.
  Asking Questions: The Compounding Loop
  Once your wiki reaches even 10 to 20 compiled articles, you can start asking complex questions that synthesise across multiple sources.
  The query prompt:
  markdown
  Read wiki/index.md. I want to understand: [YOUR QUESTION]

Research the answer across the wiki's content — read the relevant
pages, synthesise an answer with citations to specific wiki pages,
and save it as wiki/outputs/[question-slug].md. Update index.md
and log.md.
The AI reads the index, identifies relevant pages, reads them, and produces a cited answer. If using Claude Chat, you'll paste the index and relevant pages manually.
The crucial step is filing the answer back. Save it in wiki/outputs/. This is the compounding loop. Every question enriches the knowledge base for future queries.
Different output formats
Your wiki doesn't have to produce only text:
Slide presentations (using Marp format):
markdown
Answer my question as a Marp slideshow. Separate slides with ---
and use # for slide titles. Save to wiki/outputs/topic-slides.md
Data visualisations (if using Claude Code or another tool with code execution):
markdown
Generate a Python script that creates a chart comparing [data from
the wiki]. Save the image to wiki/attachments/images/
Comparison tables, decision frameworks, reading lists. The wiki is your canvas.
Obsidian Plugins
These free plugins transform Obsidian from a simple note viewer into a serious knowledge base interface (please DYOR on plugins you utilise, my LLM has suggested the following):
How to install plugins
Settings > Community Plugins > Turn off Restricted Mode > Browse. Search for the plugin name, click Install, then Enable.
The essentials
Dataview is the single most powerful plugin for this workflow. It treats your vault as a queryable database, reading all your YAML frontmatter automatically. Embed live queries in any note:
markdown
TABLE summary, tags, date_modified
FROM "wiki/concepts"
SORT date_modified DESC
This creates a live table of all your concept articles, sorted by most recently updated. Use it to build dashboards, find unprocessed sources, and identify gaps.
Templater auto-populates dates, filenames, and other variables when you create notes. Saves time when manually creating wiki pages.
Obsidian Git gives you automatic version control. Configure it to auto-commit every 30 minutes and push to a remote repo. Every change is tracked and reversible. Your safety net when the AI makes a mistake.
Tag Wrangler for bulk renaming and merging tags across your entire vault. Essential once your taxonomy grows.
Linter auto-formats notes on save. Enforces consistent YAML frontmatter, heading levels, spacing. Critical when the AI writes many files since formatting drifts.
Marp Slides renders markdown files as presentation slides. Any note with marp: true in its frontmatter becomes a slideshow. Export to PDF, HTML, or PowerPoint.
Homepage designates a note as your vault's landing page. Build a dashboard with Dataview queries showing recent activity and statistics.
Graph View (built in, no plugin needed)
Obsidian's Graph View visualises your wiki as an interactive network. Notes are dots. [[wikilinks]] are connecting lines. Highly connected concepts appear as larger nodes.
Use it to spot clusters of related knowledge, find orphan notes that need integration, and discover unexpected connections between topics.
Health Checks and Quality Maintenance
Periodic health checks prevent your wiki from decaying into a collection of disconnected notes. Run these weekly, or after every major batch of new sources.
The lint prompt:
markdown
Perform a health check on the wiki. Read all files in wiki/ and
report:

1. CONTRADICTIONS — claims in one article that conflict with
   another. List both sources.
2. ORPHAN PAGES — articles with no inbound [[wikilinks]].
   Suggest where to add links.
3. MISSING PAGES — concepts frequently referenced as [[wikilinks]]
   but lacking their own article. Create stubs for the top 5.
4. BROKEN LINKS — [[wikilinks]] pointing to non-existent pages.
5. INCOMPLETE METADATA — articles missing required frontmatter.
   Fix them.
6. STALE CONTENT — articles based on sources over 6 months old
   with no updates.
7. SUGGESTED QUESTIONS — 3-5 research questions worth exploring
   next.

Fix all issues you can automatically. For contradictions and major
gaps, create a report at wiki/outputs/lint-report-[today's date].md
Supplementary automated checks
If you're comfortable with the command line, these free tools catch structural issues the AI might miss:
markdownlint (npm install -g markdownlint-cli) enforces consistent markdown formatting
markdown-link-check (npm install -g markdown-link-check) validates all hyperlinks
Optional. The AI's semantic lint catches the important stuff. These catch formatting nits.
The two-model validation pattern
For high-stakes knowledge bases (medical research, legal analysis, investment theses), use two different AI models: one writes the wiki pages, a second independently validates them before they enter the "live" wiki.
This prevents compounding hallucinations. A real concern flagged by many commentators on Karpathy's original post.
Compile with Claude, validate with GPT-4o (or vice versa). If both agree, the content is likely sound. If they disagree, investigate.
Scaling: When Your Wiki Grows Large
How much can you fit?
At small scale (under roughly 100 articles), the index-file approach works brilliantly. The AI reads the index, picks relevant pages, loads only what it needs.
Adding search with QMD
QMD is a free, open-source local search engine built by Tobi Lütke (CEO of Shopify). Purpose-built for markdown knowledge bases. Combines keyword search, semantic (meaning-based) search, and AI reranking. All running locally on your machine with no cloud dependencies.
Automating the Entire Workflow
The manual copy-paste workflow works. But it's slow. The real power of this system unlocks when the wiki builds itself.
The Best and Easiest Way: Install a Ready-Made Plugin (2 Minutes)
Since Karpathy shared his pattern, the community has built ready-made Claude Code plugins that turn the entire wiki workflow into simple slash commands. You don't need to write any configuration, create any templates, or craft any prompts. Install, type two commands, done.
The fastest path is the wiki-skills plugin:
bash

# In Claude Code, run:

/plugin marketplace add kfchou/wiki-skills
/plugin install wiki-skills@kfchou/wiki-skills
You now have these commands:
/wiki-init scaffolds the entire folder structure in seconds
/wiki-ingest processes a raw source into the wiki (summary, concepts, entities, wikilinks, index update)
/wiki-query researches a question across your wiki and files the answer back
/wiki-lint runs a health check and fixes what it can
Your workflow becomes:
Drop articles into raw/ (via Web Clipper or copy-paste)
Type /wiki-ingest in Claude Code
Done. Open Obsidian and browse your wiki.
IMPORTANT:
If you don't want a plugin, or you want to understand what's happening under the hood, the rest of this section walks through five levels of DIY automation.
Level 1: One-Command Compilation (Claude Code CLI)
If you have Claude Code installed ($20/month Pro minimum), you can process every new source in your raw/ folder with a single command:
bash
claude -p "Read CLAUDE.md. Find all files in raw/ that don't yet have a corresponding summary in wiki/sources/. For each one: create a source summary, create or update concept and entity pages, add wikilinks, and update wiki/index.md and wiki/log.md."
That's it. Claude Code reads your raw sources, writes every markdown file, places them in the correct folders, creates all the cross-links, updates your index. Open Obsidian and everything is there.
The -p flag means "prompt." It runs non-interactively and exits when done.
Level 2: Custom Slash Commands (Type /compile and Walk Away)
Claude Code supports custom slash commands. Reusable workflows saved as markdown files, invoked with /command-name.
Create this file at .claude/commands/wiki-compile.md:
markdown

---

description: Compile new raw sources into the wiki
allowed-tools: Read, Write, Bash, Glob, Grep

---

# Wiki Compilation

Read CLAUDE.md for project conventions.

1. Scan raw/ for all source files
2. Read wiki/sources/ to identify which sources have already
   been processed
3. For each NEW (unprocessed) source:
   a. Create a source summary in wiki/sources/
   b. Identify key concepts and entities
   c. Create new concept/entity pages if they don't exist
   d. Update existing pages with new information (append only)
   e. Add [[wikilinks]] between related pages
4. Regenerate wiki/index.md with all pages listed
5. Append all operations to wiki/log.md
6. Report: how many sources processed, pages created, pages
   updated
   Now in any Claude Code session inside your vault, type:
   markdown
   /wiki-compile
   Claude reads the command file, follows every step, builds your wiki.
   Create similar commands for other operations:
   .claude/commands/wiki-lint.md > /wiki-lint for health checks
   .claude/commands/wiki-query.md > /wiki-query How do AMMs work? for research
   Level 3: Scheduled Tasks (The Wiki Builds Itself Every Day)
   This is where it gets properly autonomous. Claude Code supports scheduled tasks that run automatically without you typing anything.
   Using Claude Desktop (Mac/Windows):
   Open a task, type /schedule, configure:
   What: "Read CLAUDE.md. Process all new files in raw/. Compile into wiki."
   When: Daily at 9am (or whatever suits you)
   Repeat: Daily / weekdays / weekly
   Each run starts a fresh session, processes your raw sources, writes the wiki pages, exits. You clip articles throughout the day; the wiki compiles itself overnight.
   Using the CLI:
   markdown
   /loop 24h Read CLAUDE.md. Check for new files in raw/ that haven't been processed. Compile any new sources into wiki pages and update the index.
   Using cron (Mac/Linux):
   markdown
   crontab -e

# Runs compilation daily at 6am

0 6 \* \* _ cd ~/my-knowledge-base && claude -p "Read CLAUDE.md. Process all new raw/ files not yet in wiki/. Create summaries, concept pages, and update index." >> ~/kb-compile.log 2>&1
This runs in the background. Your wiki grows while you sleep.
Important notes:
Each scheduled run consumes your Claude usage quota
Desktop tasks only run while your computer is awake and Claude Desktop is open
Cron tasks require Claude Code to be installed and authenticated on the machine
Level 4: GitHub Actions (Cloud Automation, Computer Off)
The most robust setup. Your computer can be off. Compilation happens on GitHub's servers.
Store your vault in a GitHub repository
When you push new files to raw/, a GitHub Action triggers
Claude Code compiles the wiki
Updated wiki files commit back to the repo
Pull changes into your local Obsidian vault (or use Obsidian Git to auto-sync)
The workflow file (.github/workflows/compile-wiki.yml):
yaml
name: Compile Wiki
on:
push:
paths: - 'raw/\*\*'
schedule: - cron: '0 6 _ \* \*' # Daily at 6am UTC

jobs:
compile:
runs-on: ubuntu-latest
steps: - uses: actions/checkout@v4

      - name: Install Claude Code
        run: curl -fsSL https://claude.ai/install.sh | bash

      - name: Compile wiki
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude -p "Read CLAUDE.md. Process all raw/ files \
          not yet in wiki/. Create summaries, concept pages, \
          and update index."

      - name: Commit changes
        run: |
          git config user.name "Wiki Bot"
          git config user.email "bot@example.com"
          git add wiki/
          git diff --staged --quiet || git commit -m "Auto-compile wiki $(date +%Y-%m-%d)"
          git push

Cost note: This uses the Claude API (pay-per-token), not your subscription. You'll need an API key from console.anthropic.com. For 5 to 10 new sources, expect under $0.50 per run on Sonnet 4.6.
Level 5: Full Agent Skills (Self-Maintaining Wiki)
Claude Code supports Agent Skills that trigger automatically when it detects the right context. Unlike slash commands (which you invoke), skills activate on their own.
Create .claude/skills/wiki-maintainer/SKILL.md:
markdown

---

name: wiki-maintainer
description: Automatically maintain the knowledge base wiki.
Triggers when new files appear in raw/, when the user asks
questions about the wiki topic, or when a health check is
needed. Handles compilation, querying, and linting.
allowed-tools: Read, Write, Bash, Glob, Grep

---

# Wiki Maintainer

You are maintaining a personal knowledge base wiki.
Read CLAUDE.md in the project root for full conventions.

## When to activate

- User adds files to raw/ → run INGEST cycle
- User asks a question about the wiki topic → run QUERY cycle
- User mentions "health check" or "lint" → run LINT cycle
- More than 7 days since last lint (check wiki/log.md) →
  suggest a lint pass

## Ingest cycle

1. Glob raw/\*_/_.md to find all sources
2. Glob wiki/sources/\*_/_.md to find processed sources
3. Diff to identify unprocessed sources
4. For each new source: create summary, concept pages, entity
   pages, wikilinks
5. Update wiki/index.md and wiki/log.md

## Query cycle

1. Read wiki/index.md
2. Identify relevant pages from index summaries
3. Read those pages
4. Synthesise answer with [[wikilink]] citations
5. Save to wiki/outputs/{slug}.md
6. Update index and log

## Lint cycle

1. Check for contradictions, orphan pages, broken links
2. Check for missing frontmatter
3. Create stubs for frequently linked but non-existent pages
4. Fix automatically where possible
5. Write report to wiki/outputs/lint-report-{date}.md
   With this skill in place, just say "I added three new articles to raw/" and Claude knows exactly what to do. No commands needed.
   Start with Level 1. Layer on more automation as you get comfortable. Each level builds on the previous. Nothing breaks if you jump ahead.
   Synthetic Data Generation (Advanced)
   Once your wiki is mature, you can use it to create training data for a fine-tuned model that "knows" your domain in its weights.
   Feed each wiki article to Claude:
   markdown
   Given this wiki article, generate 5 question-answer pairs:

- 2 factual questions (who/what/when)
- 2 reasoning questions (why/how/compare)
- 1 synthesis question (connecting to other concepts)
  Output as JSON.
  From 100 wiki articles, expect 300 to 500 QA pairs. Enough to begin fine-tuning a smaller model via OpenAI's API (roughly $8 per million training tokens) or locally with QLoRA on a consumer GPU.
  Fine-tuning teaches the model your domain's vocabulary and reasoning patterns. It's poor at memorising specific facts, so those are better served by the wiki itself. The ideal setup? A fine-tuned model for behaviour combined with the wiki for specifics.
  Existing Tools and Community Implementations
  You're not building from zero. Several open-source projects already implement this pattern:
  llm-wiki-compiler with /wiki-init and /wiki-compile commands
  sage-wiki as a full CLI with compile, search, query, and serve commands (exposes wiki as an MCP server)
  CRATE as a Python CLI implementing the three-layer pattern, OpenAI-compatible, Obsidian-friendly
  QMD as a local search engine for markdown with keyword, vector, and hybrid search plus MCP server support
  Fabric with 140+ curated prompt patterns for standardised operations
  YAML Frontmatter Quick Reference
  Every wiki page should have metadata at the top. This enables Dataview queries, automated maintenance, and consistent AI processing.
  yaml

---

# Required for all pages

title: "Page Title"
date_created: 2026-04-06
date_modified: 2026-04-06
summary: "One to two sentences describing this page."
status: draft # draft | review | final
type: concept # concept | entity | source | synthesis | output
tags:

- topic-tag

# For source summaries (add these)

source_url: "https://example.com/article"
authors:

- "Author Name"

# For concepts (add these)

related:

- "[[related-page]]"
  source_count: 5
  confidence: established # established | emerging | speculative

---

Troubleshooting Common Issues
"The AI keeps rewriting pages instead of updating them." Add explicit instructions: "Append new information to existing sections. Do not rewrite content that hasn't changed. Preserve all existing wikilinks."
"My index is getting too long and unwieldy." Split into category indexes. Keep wiki/index.md as a lightweight overview (page title + one-line summary only). Put detailed summaries in each \_index.md file within subfolders.
"The AI hallucinates connections between unrelated topics." The most common quality issue. Mitigate by always tracing claims to specific source pages, running the two-model validation pattern for critical content, and including "only make connections explicitly supported by source material" in your CLAUDE.md.
"I hit Claude's usage limits before finishing compilation." Process sources in smaller batches (3 to 5 at a time). Use incremental compilation rather than reprocessing everything. If you regularly hit limits, consider Max ($100/month) or API pay-as-you-go.
"My wiki has duplicate concepts under different names." Happens naturally as the AI encounters the same idea phrased differently across sources. Add a lint rule to your CLAUDE.md: "Check for concept pages describing the same thing under different names. Merge them, keeping the most common name and adding redirects."
"I want to share my wiki with someone else." Everything is plain markdown files. Push the vault to a GitHub repo, share via cloud storage (Dropbox, Google Drive, iCloud), or deploy as a website using MkDocs Material (pip install mkdocs-material && mkdocs serve).
The Bottom Line
The shift Karpathy identified, from "AI as answer machine" to "AI as knowledge infrastructure," changes how individuals manage expertise. The system requires no programming background, no database administration, and no infrastructure beyond a free note-taking app and an AI subscription.
Three things make this different from normal AI usage:
The filing loop is the superpower. Every query saved back to the wiki enriches it for future queries. Compound returns on every interaction. No chat interface gives you this.
The AI is a compiler, not a search engine. It synthesises and connects ideas in ways that chunked retrieval never can. It understands the relationships between documents, not just their similarity.
Plain text is forever. Your knowledge base is a folder of markdown files, readable by any tool, on any operating system, for as long as computers exist. No vendor lock-in. No proprietary format. No opaque database.
Start small. Pick one topic. Clip five articles. Run the compilation. Ask a question. See what the wiki gives you back. Then keep feeding it.
