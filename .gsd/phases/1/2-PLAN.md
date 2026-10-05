---
phase: 1
plan: 2
wave: 1
---

# Plan 1.2: Project Scaffolding & Environment

## Objective
Set up the project scaffolding: .gitignore, .env.example, updated package.json with correct scripts and metadata, and the .env template.

## Context
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- package.json (existing — needs updates)
- .gitignore (existing — empty)
- .env (existing — empty)

## Tasks

<task type="auto">
  <name>Update .gitignore</name>
  <files>.gitignore</files>
  <action>
    Replace the empty .gitignore with proper rules:

    ```
    node_modules/
    .env
    *.log
    ```

    AVOID:
    - Ignoring .env.example (it should be tracked)
    - Overly broad patterns that could hide source files
  </action>
  <verify>node -e "const fs = require('fs'); const gi = fs.readFileSync('.gitignore','utf8'); console.log('has .env:', gi.includes('.env')); console.log('has node_modules:', gi.includes('node_modules'))"</verify>
  <done>.gitignore contains .env, node_modules/, and *.log rules</done>
</task>

<task type="auto">
  <name>Create .env.example and update .env</name>
  <files>.env.example, .env</files>
  <action>
    Create `.env.example` with placeholder values:

    ```
    # ORBITA-Gateway Configuration
    PORT=3000
    HOST=127.0.0.1
    ROUTER_TOKEN=change-this-local-password

    # OpenRouter Configuration
    OPENROUTER_BASE_URL=https://openrouter.ai/api
    OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free

    # Credential Credentials (add your keys below)
    OPENROUTER_KEY_1=
    OPENROUTER_KEY_2=
    OPENROUTER_KEY_3=

    # Tuning
    KEY_COOLDOWN_MS=30000
    REQUEST_TIMEOUT_MS=120000
    ```

    Update `.env` with the same structure but with `ROUTER_TOKEN=local-dev-token` and leave all OPENROUTER_KEY fields empty. The user will add real keys later.

    AVOID:
    - Putting real API keys in .env.example
    - Putting real API keys in .env (user will add manually)
  </action>
  <verify>node -e "const fs = require('fs'); console.log('.env.example exists:', fs.existsSync('.env.example')); const ex = fs.readFileSync('.env.example','utf8'); console.log('has ROUTER_TOKEN placeholder:', ex.includes('change-this')); console.log('no real keys:', !ex.match(/sk-[a-zA-Z0-9]{20,}/))"</verify>
  <done>.env.example exists with placeholders only, .env has same structure with local-dev-token</done>
</task>

<task type="auto">
  <name>Update package.json</name>
  <files>package.json</files>
  <action>
    Update package.json to have:
    - `"description": "Local API gateway between Claude Code and OpenRouter"`
    - `"main": "src/server.js"`
    - `"type": "module"` — use ES modules throughout the project
    - Scripts:
      - `"start": "node src/server.js"`
      - `"dev": "node --watch src/server.js"`
      - `"test": "node --test test/*.test.js"`
    - `"private": true`
    - `"engines": { "node": ">=18.0.0" }`
    - Keep existing `dotenv` dependency

    AVOID:
    - Removing the dotenv dependency
    - Adding unnecessary dependencies
  </action>
  <verify>node -e "const p = require('./package.json'); console.log('main:', p.main); console.log('start:', p.scripts.start); console.log('dev:', p.scripts.dev); console.log('test:', p.scripts.test); console.log('dotenv:', !!p.dependencies.dotenv)"</verify>
  <done>package.json has correct main, scripts (start/dev/test), type module, and dotenv dependency</done>
</task>

## Success Criteria
- [ ] .gitignore properly ignores .env and node_modules
- [ ] .env.example contains only placeholders
- [ ] .env has development defaults (no real keys)
- [ ] package.json has start, dev, test scripts
- [ ] package.json specifies type: module and engines >= 18
