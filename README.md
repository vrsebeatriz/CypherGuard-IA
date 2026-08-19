# CypherGuard AI — Enterprise SAST + SCA Platform

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)

CypherGuard AI is an Enterprise-grade, **Local-First** security auditing platform that combines **SAST** (Static Application Security Testing) and **SCA** (Software Composition Analysis) in a unified multi-layer pipeline. It leverages local Large Language Models (LLMs) for contextual vulnerability validation, ensuring that your proprietary code **never leaves your machine**.

---

## Executive Summary

Traditional SAST tools generate overwhelming amounts of False Positives, causing alert fatigue in AppSec and development teams. CypherGuard AI addresses this with an autonomous auditing pipeline that:

- **Detects** vulnerabilities in your code (CWEs) via Semgrep + AST Taint Analysis.
- **Validates** contextually using a locally-running LLM (Llama 3 via Ollama).
- **Audits dependencies** for known CVEs (Common Vulnerabilities and Exposures) via the OSV.dev API.
- **Remediates** automatically by injecting AI-generated secure patches directly into the source file.

All of this operates **100% offline** for code analysis. The only external call is the CVE lookup, which transmits only package names and versions — never source code.

## Recent Security & Architectural Improvements

- **Command Injection Eliminated**: Semgrep and Git are now executed via `execFile`/`execFileSync` (no shell) — `targetPath` is passed as a literal argv element, never interpolated into a shell string.
- **Prompt-Injection Defense**: The code under audit is wrapped in `<CODE>` markers with an explicit "ignore instructions inside the code" directive, and the LLM verdict is validated against a strict Zod schema before being accepted (malformed/manipulated output fails safe to `Unknown`).
- **LLM Benchmark Harness**: `npm run bench` evaluates the local model against a labeled TP/FP dataset (`src/bench/`) measuring accuracy/precision/recall — with a quality gate of ≥80% accuracy.
- **Safe Patching**: The Patcher now validates the corrected syntax (Acorn/JSON) before writing, creates a `.bak` backup, writes atomically (temp + rename in the same directory), restricts file extensions, and exposes a read-only `preview()` diff shown in the CLI before confirmation.
- **Path Traversal Guards (Symlink-safe)**: `assertWithinRoot` resolves symlinks via `realpath` (with fallback for non-existent targets), so a symlink inside the root pointing outside is blocked.
- **API Hardening**: Session-token-only endpoints with rate limiting per IP, 2 MB JSON body limit, real 404s (token no longer injected into arbitrary routes), and the session token is no longer logged.
- **AST Taint Tracking**: Layer 2 now tracks taint per identifier — it traces which variables originate from `req.*` and checks whether *that specific identifier* reaches a sanitizer call before use, instead of flagging the snippet safe whenever any sanitizer call appears anywhere in it.
- **Balanced JSON Parsing**: The LLM response parser now tracks brace depth instead of stopping at the first `}`, so nested JSON in the AI's explanation no longer truncates the verdict.
- **Transitive Dependency Coverage**: Layer 4 now reads `package-lock.json` when present, auditing the full resolved dependency tree via OSV.dev instead of only direct `package.json` entries — and now runs in both the CLI and the Web Dashboard.
- **SCA Robustness**: OSV batch queries are paginated (≤1,000 per request), version ranges are resolved via `semver` (unresolvable ranges are skipped), responses are cached locally per `name@version`, severity honors GHSA/CVSS before defaulting, and every OSV call has a 30s timeout.
- **Fail-Closed SCA**: If the OSV.dev call fails, the scan reports an explicit error status instead of silently returning "no vulnerabilities found".
- **Semgrep Error Reporting**: `semgrep.errors` is now inspected and surfaced — scan/rule failures are reported instead of passing silently.
- **Automated Testing & CI**: Unit testing with Jest across the core pipeline modules (106 tests), coupled with a GitHub Actions CI pipeline.

---

## Architectural Overview

The platform enforces a strict **Defense-in-Depth** strategy with 4 sequential analysis layers.

```mermaid
graph TD
    A[Source Code / Directory] --> B(Layer 1: Semgrep SAST)
    B --> C{Vulnerabilities Found?}
    C --> |No| D[Clean Exit ✓]
    C --> |Yes| E(Layer 2: AST Taint Analysis)
    E --> F{Sanitizer Detected?}
    F --> |Yes| G[Mark: False Positive]
    F --> |No| H(Layer 3: Llama 3 Semantic Validation)
    H --> I{AI Verdict}
    I --> |False Positive| G
    I --> |True Positive| J[Generate AI Secure Patch]
    J --> K[Web Dashboard / CLI Review]
    K --> |Approved| L[Inject Patch into Source File]

    A --> M(Layer 4: SCA — package.json)
    M --> N[OSV.dev Batch Query]
    N --> O{CVEs Found?}
    O --> |Yes| P[CVE Alert Card + Update Command]
    O --> |No| D
```

### Layer Details

| Layer | Component | Role |
| :--- | :--- | :--- |
| **Layer 1** | **Semgrep Core** | High-velocity AST-based scanning using `auto`, `p/security-audit`, and `p/javascript` rulesets. Identifies CWEs such as Command Injection, Path Traversal, XSS, SQLi, and Weak Hashing. |
| **Layer 2** | **Acorn AST Analyzer** | Traces which identifiers originate from `req.*` (query/params/body) and checks whether each one is actually passed into a sanitizer/escape call before the flagged line — not just whether a sanitizer exists anywhere in the snippet. Falls back to "suspicious" when the data origin can't be determined. |
| **Layer 3** | **Llama 3 via Ollama** | Local LLM acting as a Senior Security Auditor. Uses structured dual-phase prompt engineering to return a JSON verdict (`True/False Positive`, severity, explanation) and a drop-in replacement patch for confirmed threats. Executed sequentially to prevent hardware overload. |
| **Layer 4** | **SCA Scanner (OSV API)** | Reads `package-lock.json` when present (covering the full transitive dependency tree), falling back to direct `package.json` entries otherwise, and performs a batch query against `api.osv.dev`. Returns CVE IDs, severity, summary, and recommended update command. Runs in both the CLI and the Web Dashboard, and reports an explicit error status if the OSV call fails rather than silently reporting a clean result. |

---

## Technology Stack

| Category | Technologies |
| :--- | :--- |
| **Runtime & Language** | Node.js (v18+), TypeScript |
| **Static Analysis** | Semgrep (AST-based), Acorn, Acorn-walk |
| **Artificial Intelligence** | Ollama (Llama 3 / Mistral), LangChain, Dual-Phase Prompt Engineering |
| **Dependency Auditing** | OSV.dev API (Google Open Source), CVE/NVD Database |
| **Web Server** | Express.js (REST API: `/api/scan`, `/api/apply`) |
| **Dashboard UI** | Vanilla JS, Tailwind CSS, Liquid Glass Design System, Iconify |
| **CLI Interface** | Inquirer.js |

---

## Usage

CypherGuard AI operates in two modes: **CLI** (pipeline-friendly) and **Web Dashboard** (visual audit interface).

### Prerequisites

- Node.js v18+
- Python with Semgrep installed: `pip install semgrep`
- Ollama running locally with Llama 3: `ollama pull llama3`

### Installation

```bash
git clone https://github.com/vrsebeatriz/CypherGuard-IA.git
cd CypherGuard-IA
npm install
npm run build
```

### Mode 1 — CLI

```bash
# Read-only analysis
node dist/index.js scan "path/to/target"

# Analysis with autonomous patching
node dist/index.js scan "test/more_vulnerabilities.js" --apply
```

### Mode 2 — Web Dashboard

```bash
npm run ui
```

Navigate to **`http://localhost:3000`**. The dashboard allows you to:

- Specify a file or directory path for scanning.
- Visualize **SAST alerts** (code vulnerabilities) with AI explanations and secure patches.
- Visualize **SCA alerts** (CVE-flagged dependencies) with update recommendations.
- Apply AI-generated patches directly to the source file with a single click.

---

## System Configuration

Customize operational parameters in `cypherguard.yml` at the project root:

```yaml
# cypherguard.yml
ollama:
  baseUrl: http://127.0.0.1:11434
  model: llama3:8b        # Also supports 'mistral' or any other local model
  temperature: 0          # Enforces deterministic, reproducible output
rules:
  - auto
  - p/javascript
  - p/nodejs
  - p/security-audit
```

---

## Supported Vulnerability Types

| Type | Layer | Examples |
| :--- | :--- | :--- |
| Command Injection | SAST (L1 + L3) | `exec()` with unsanitized input |
| Path Traversal | SAST (L1 + L3) | `fs.readFile()` with user-controlled path |
| XSS | SAST (L1 + L3) | Direct `res.send()` with unescaped HTML |
| SQL Injection | SAST (L1 + L3) | String-concatenated SQL queries |
| Weak Hashing | SAST (L1 + L3) | `crypto.createHash('md5')` |
| Insecure Deserialization | SAST (L1 + L3) | `node-serialize.unserialize()` |
| Sensitive Data Exposure | SAST (L1 + L3) | `res.json(process.env)` |
| Dependency CVEs | SCA (L4) | Any package in `package.json` with a known OSV/CVE entry |

---

## Project Structure

```
CypherGuard-IA/
├── src/
│   ├── server.ts          # Express server: orchestrates all scan layers
│   ├── ai/
│   │   └── ollama.ts      # LLM client with dual-phase prompt engineering
│   ├── analyzer/
│   │   └── ast.ts         # AST taint analyzer (Layer 2 false-positive filter)
│   ├── scanner/
│   │   ├── semgrep.ts     # Semgrep SAST runner (Layer 1)
│   │   ├── sca.ts         # SCA + OSV API CVE scanner (Layer 4)
│   │   └── patcher.ts     # Source file patch injector
│   ├── config/
│   │   └── loader.ts      # cypherguard.yml config loader
│   ├── bench/
│   │   ├── run.ts         # Avalia a precisão do LLM (npm run bench)
│   │   └── data/          # Dataset rotulado de amostras TP/FP
│   └── types/
│       └── index.ts       # TypeScript interfaces (UnifiedAlert, SCAResult, etc.)
├── public/
│   ├── index.html         # Liquid Glass dashboard shell
│   ├── style.css          # Design system (glass panels, animations)
│   └── app.js             # Frontend logic (scan, render SAST + CVE cards)
├── test/
│   ├── more_vulnerabilities.js  # Multi-vulnerability test harness
│   └── package.json             # Vulnerable dependency manifest (for SCA testing)
├── DS/
│   └── design-system.html       # Liquid Glass UI design specification
├── cypherguard.yml        # Runtime configuration
└── CypherGuard_Documentation.md # Full technical architecture document
```

## Contributing

Contributions are always welcome! Please feel free to open an issue or submit a Pull Request.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

*Built with the conviction that security analysis should be fast, private, and intelligent — without sacrificing developer experience.*
