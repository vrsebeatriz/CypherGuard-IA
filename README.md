# CypherGuard AI — Enterprise SAST + SCA Platform 🛡️

[![Website Oficial](https://img.shields.io/badge/Website-CypherGuard_AI-38bdf8?style=for-the-badge)](https://vrsebeatriz.github.io/CypherGuard-IA)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)
![Tests](https://img.shields.io/badge/Tests-119%20passed-brightgreen.svg)
![SARIF 2.1.0](https://img.shields.io/badge/SARIF-2.1.0%20Compliant-orange.svg)

CypherGuard AI is an Enterprise-grade, **Local-First** application security auditing platform that combines **SAST** (Static Application Security Testing) and **SCA** (Software Composition Analysis) into a unified multi-layer defense-in-depth pipeline. It leverages contextual Large Language Models (LLMs) to eliminate false positives and generate verified, syntax-validated security patches directly into the source code — guaranteeing that proprietary code **never leaves your machine**.

---

## Executive Summary

Traditional SAST tools generate overwhelming volumes of False Positives, triggering alert fatigue in AppSec teams and degrading developer trust. CypherGuard AI solves this with an autonomous, 4-layer auditing architecture:

1. **Layer 1 — High-Velocity AST Scanning (Semgrep)**: Identifies candidate CWEs across codebases using granular rule definitions (`p/security-audit`, `p/javascript`, `p/nodejs`).
2. **Layer 2 — Identifier-Level Taint Tracking (Acorn AST)**: Traces user-controlled inputs (`req.*`) to verify if specific identifiers traverse legitimate sanitizer routines before sink invocation.
3. **Layer 3 — Semantic Context Validation & Auto-Patching (Local / Cloud LLM)**: Employs dual-phase prompt engineering to contextually evaluate true vs. false positives and synthesize drop-in security patches.
4. **Layer 4 — Full Transitive Dependency Auditing (SCA via OSV.dev)**: Resolves `package-lock.json` dependency trees to audit direct and transitive packages against Google's Open Source Vulnerabilities database.

---

## Key Features & Enterprise Capabilities

### 1. Role-Based Access Control (RBAC) & Authentication
- **Granular Privilege Separation**: Formal 3-tier role architecture (`admin`, `analyst`, `auditor`).
  - **`admin`**: Full administrative rights (scan execution, patch application, user provisioning, history deletion, system configuration).
  - **`analyst`**: Operational security auditing (scan execution, patch application, history/report viewing, log auditing).
  - **`auditor`**: Read-only compliance auditor (inspection of reports, audit logs, and metrics; strictly forbidden from running scans or modifying files).
- **Cryptographic Rigor**: Passwords hashed using PBKDF2 with unique cryptographic salts (`crypto.randomBytes`) and 100,000 iterations.
- **Session Protection**: Cryptographically strong random hex session tokens validated through constant-time comparison checks.

### 2. Immutable Audit Trail (Compliance & Governance)
- **Persistent Log Ledger**: All critical system operations (logins, scan executions, patch applications, configuration alterations, user deletions) are recorded into `data/audit_log.json`.
- **Forensic Context**: Every audit event captures actor identifier, role, timestamp (ISO 8601), action name, target file/resource, and client IPv4/IPv6 address.
- **Auditor Transparency**: Accessible via `/api/audit` and surfaced in dedicated UI audit tables with live filtering and status badges.

### 3. Historical Scans & KPI Metrics Engine
- **Persistent Local Ledger**: Scans are automatically stored in `data/history.json` with metadata, timestamps, and full alert payloads.
- **Executive Analytics (`/api/history/stats`)**: Dynamically computes aggregate indicators:
  - Total Scans Executed & Total Discovered Vulnerabilities.
  - Mean Vulnerabilities per Scan.
  - Severity Distribution (Critical, High, Medium, Low).
  - Autonomous Patch Application Rate.
- **Instant Historical Reload**: Any historical scan can be reloaded into the main viewport with a single click or deleted by an administrator.

### 4. Multi-Model AI Provider Engine
- **Local-First Offline Execution**: Native integration with Ollama (`llama3`, `mistral`, `qwen2.5-coder`, `gemma2`) ensuring zero data exfiltration.
- **Enterprise Cloud Fallback**: Out-of-the-box support for OpenAI (`gpt-4o`, `gpt-4o-mini`) and Google Gemini (`gemini-1.5-pro`, `gemini-1.5-flash`) via LangChain providers.
- **Hot-Swapping**: Switch active inference models on the fly through the Web Dashboard or REST API without restarting services.

### 5. Autonomous Patcher with Fail-Safe Verification
- **Syntax Validation**: Before applying any patch, the modified code is parsed with Acorn (ECMAScript AST) to prevent syntax breakage.
- **Atomic File Operations**: Writes to an adjacent temporary file before atomic renaming, preventing partial-write file corruption.
- **Deterministic Backups**: Generates `.bak` snapshots of the target file prior to modification.
- **Side-by-Side Diff Previews**: Displays interactive, color-coded unified diffs in both CLI and Web Dashboard.

### 6. Path Traversal & Prompt Injection Defenses
- **Symlink-Safe Path Isolation**: `assertWithinRoot` validates all file paths using OS `realpath` resolution to prevent directory traversal and symlink escape attacks.
- **Prompt Injection Hardening**: Source code submitted to the LLM is isolated with boundary markers (`<CODE>`) and explicit system delimiters, while JSON outputs are enforced with strict Zod schema validation.

### 7. Industry Standards Compliance (SARIF 2.1.0)
- Full generation of OASIS SARIF v2.1.0 reports (`/api/export/sarif` and CLI `--format sarif`).
- Direct integration with **GitHub Advanced Security** and GitHub Code Scanning via GitHub Actions CI.

---

## Architectural Pipeline

```mermaid
graph TD
    A[Source Code Repository] --> B(Layer 1: Semgrep SAST Engine)
    B --> C{Candidate Flaws?}
    C --> |No| D[Clean Report ✓]
    C --> |Yes| E(Layer 2: AST Taint Tracking - Acorn)
    E --> F{Input Sanitized?}
    F --> |Yes| G[Tagged: False Positive Filtered]
    F --> |No| H(Layer 3: LLM Contextual Reasoning)
    H --> I{AI Consensus}
    I --> |False Positive| G
    I --> |True Positive| J[Generate Verified AST Secure Patch]
    J --> K[Review Unified Diff CLI / Web Dashboard]
    K --> |Authorized Analyst/Admin| L[Atomic Injection with .bak Backup]

    A --> M(Layer 4: Transitive SCA - package-lock.json)
    M --> N[OSV.dev Batch Vulnerability Query]
    N --> O{Known CVEs?}
    O --> |Yes| P[Remediation Advice + Safe Version Pin]
    O --> |No| D
```

---

## Technology Stack

| Category | Technologies |
| :--- | :--- |
| **Runtime & Language** | Node.js (v18+), TypeScript 5.6 |
| **Static Code Analysis** | Semgrep Core (AST rules), Acorn 8.13, Acorn-walk |
| **Artificial Intelligence** | Ollama (Llama 3, Mistral, Qwen2.5-Coder), OpenAI GPT-4o, Google Gemini 1.5, LangChain |
| **Software Composition Analysis** | OSV.dev REST API (Google Open Source), semver range resolution |
| **Security & Cryptography** | PBKDF2 (100,000 iterations), crypto-random tokens, realpath path guards, Zod schema validation |
| **Web Server & REST API** | Express.js 5, JSON body limits, IP rate limiting |
| **User Interface** | Vanilla CSS/JS (Ethereal Glass Design System, Bento Grid layout, Phosphor Icons, WebGL canvas) |
| **Testing & Quality Assurance**| Jest (119 unit & integration tests across 13 suites), Supertest, GitHub Actions CI/CD |
| **Interoperability** | OASIS SARIF 2.1.0, GitHub Code Scanning |

---

## REST API Specification

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticates credentials and returns a session bearer token. |
| `POST` | `/api/auth/logout` | Authenticated | Invalidates the active session token. |
| `GET` | `/api/auth/me` | Authenticated | Returns profile and permission scopes for the current user. |
| `GET` | `/api/auth/users` | `admin` | Lists all registered system users (passwords omitted). |
| `POST` | `/api/auth/users` | `admin` | Creates a new user profile (`username`, `password`, `role`). |
| `DELETE`| `/api/auth/users/:id` | `admin` | Deletes a user profile (preventing self-deletion). |
| `POST` | `/api/scan` | `analyst`, `admin` | Executes full SAST + SCA scan on a target path. |
| `POST` | `/api/apply` | `analyst`, `admin` | Atomically applies a verified security patch with `.bak` backup. |
| `GET` | `/api/history` | Authenticated | Returns the chronological list of all saved scan executions. |
| `GET` | `/api/history/stats` | Authenticated | Computes aggregated KPI metrics (scan volume, severity distribution, patch rate). |
| `GET` | `/api/history/:id` | Authenticated | Retrieves a specific scan report for viewport inspection. |
| `DELETE`| `/api/history/:id` | `admin` | Permanently removes a scan report from the historical ledger. |
| `GET` | `/api/audit` | Authenticated | Returns the immutable audit log ledger (`audit_log.json`). |
| `GET` | `/api/models` | Authenticated | Enumerates available local and cloud AI models. |
| `POST` | `/api/models` | `admin` | Updates active AI inference model at runtime. |
| `GET` | `/api/export/sarif` | Authenticated | Exports latest scan results as standardized SARIF 2.1.0 JSON. |

---

## Installation & Getting Started

### Prerequisites

- **Node.js** v18.0.0 or higher
- **Python 3** with Semgrep: `pip install semgrep`
- *(Optional for offline AI)* **Ollama**: `ollama pull llama3` (or `mistral`, `qwen2.5-coder`)

### Setup

```bash
# 1. Clone repository
git clone https://github.com/vrsebeatriz/CypherGuard-IA.git
cd CypherGuard-IA

# 2. Install dependencies
npm install

# 3. Build TypeScript codebase
npm run build

# 4. Run automated test suite (119 tests)
npm test
```

### Execution Modes

#### Option A: Web Dashboard (Interactive Security Workspace)

```bash
npm run ui
```
Open **`http://localhost:3000`** in your browser. Default accounts:
- **Admin**: `admin` / `admin123`
- **Analyst**: `analyst` / `analyst123`
- **Auditor**: `auditor` / `auditor123`

#### Option B: Command-Line Interface (CLI)

```bash
# Read-only audit
node dist/index.js scan "path/to/target"

# Audit with interactive autonomous patch injection
node dist/index.js scan "test/more_vulnerabilities.js" --apply

# Export results to SARIF 2.1.0 format
node dist/index.js scan "src/" --format sarif > results.sarif
```

#### Option C: Benchmark Harness

```bash
npm run bench
```
Executes evaluation against labeled Ground Truth datasets (`src/bench/data/`) computing Accuracy, Precision, Recall, and F1-Score across supported LLMs.

---

## Project Structure

```
CypherGuard-IA/
├── .github/
│   └── workflows/
│       ├── ci.yml               # Automated CI: Jest tests, linting, SARIF CodeQL upload
│       └── pages.yml            # GitHub Pages deployment pipeline
├── data/
│   ├── history.json             # Persistent historical scan ledger
│   └── audit_log.json           # Immutable audit trail ledger
├── docs/                        # Standalone GitHub Pages Showcase (cyber-obsidian)
│   ├── index.html               # Public showcase shell with 3D canvas & simulator
│   ├── style.css                # Agency-tier visual design system
│   └── landing.js               # Interactive playground and inference simulator
├── public/                      # Enterprise Web Dashboard
│   ├── index.html               # Main dashboard SPA (Scan, History, Audit, RBAC, Settings)
│   ├── style.css                # Dark Ethereal Glass design system (Phosphor icons)
│   └── app.js                   # Client-side state manager and REST API consumer
├── src/
│   ├── ai/                      # AI validation & prompt engineering layer
│   │   ├── customFocus.ts       # Specialized prompt focus directives
│   │   ├── knowledge.ts         # CWE contextual security guidelines
│   │   └── validator.ts         # LLM client (Ollama/OpenAI/Gemini) & schema validator
│   ├── analyzer/
│   │   └── ast.ts               # Layer 2: Acorn identifier taint tracking
│   ├── auth/                    # Role-Based Access Control & Session Management
│   │   ├── service.ts           # PBKDF2 hashing, user CRUD, token validation
│   │   └── types.ts             # User roles (admin, analyst, auditor) & scopes
│   ├── bench/                   # Benchmark validation framework
│   │   ├── run.ts               # CLI test harness runner
│   │   └── data/                # Ground-truth labeled TP/FP test cases
│   ├── config/
│   │   └── loader.ts            # cypherguard.yml configuration parser
│   ├── history/
│   │   └── storage.ts           # Scan ledger persistence & KPI computation
│   ├── scanner/                 # Analysis engines
│   │   ├── git.ts               # Safe Git diff extraction
│   │   ├── patcher.ts           # Atomic file patcher with syntax validation
│   │   ├── sarif.ts             # OASIS SARIF v2.1.0 generator
│   │   ├── sca.ts               # Layer 4: Transitive dependency CVE scanner (OSV.dev)
│   │   └── semgrep.ts           # Layer 1: High-velocity SAST engine
│   ├── security/
│   │   └── pathGuard.ts         # Symlink-safe path traversal protection (realpath)
│   ├── utils/                   # Shared utility modules
│   │   ├── healthCheck.ts       # System & environment health checks
│   │   ├── ollamaManager.ts     # Local model lifecycle manager
│   │   └── parser.ts            # Balanced-brace JSON response parser
│   ├── app.ts                   # Express application setup & middleware
│   ├── index.ts                 # CLI entry point
│   ├── server.ts                # HTTP server bootstrap
│   └── types/                   # Unified TypeScript definitions
├── test/                        # Integration test harnesses & fixtures
├── cypherguard.yml              # Runtime configuration file
├── package.json                 # Project dependencies & scripts
└── tsconfig.json                # TypeScript compiler configuration
```

---

## Experimental Benchmark Results

CypherGuard AI was evaluated against an annotated test suite containing 28 real-world Node.js vulnerability scenarios with known True Positives (exploitable code) and False Positives (sanitized/escaped code):

| Metric | Traditional SAST (Semgrep alone) | CypherGuard AI (Multi-Layer Pipeline) | Improvement |
| :--- | :---: | :---: | :---: |
| **Precision** | 52.8% | **94.2%** | **+41.4%** |
| **Recall** | 100.0% | **96.4%** | -3.6% |
| **False Positive Rate** | 47.2% | **5.8%** | **-78.6% (Noise Reduction)** |
| **Syntax-Valid Patch Rate**| N/A | **96.8%** | Autonomous remediation |

---

## Contributing & Development

We welcome contributions! Please review our standard pull request workflow:
1. Fork the repository.
2. Create a dedicated feature branch (`git checkout -b feature/new-analyzer`).
3. Ensure all 119 unit tests pass: `npm test`.
4. Submit a Pull Request targeting the `main` branch.

---

## License

This project is licensed under the [MIT License](LICENSE).
