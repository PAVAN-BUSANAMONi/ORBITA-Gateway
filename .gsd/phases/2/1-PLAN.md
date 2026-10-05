---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Credential Manager & Health Endpoint

## Objective
Create the credential manager with health tracking, cooldown logic, and selection algorithm. Create the health endpoint handler.

## Context
- .gsd/SPEC.md
- .gsd/DECISIONS.md (ADR-003: in-memory health, ADR-004: single failover, ADR-005: credential ID logging)
- src/config.js
- src/logger.js

## Tasks

<task type="auto">
  <name>Create src/credentials.js</name>
  <files>src/credentials.js</files>
  <action>
    Create a credential manager module that:

    1. Imports config and logger
    2. Maintains an in-memory Map of credential health state:
       - `healthy`: boolean
       - `lastFailure`: timestamp or null
       - `failureCount`: integer
    3. Exports:
       - `getCredential(excludeId?)`: Returns a healthy credential object `{ id, key }`.
         - If `excludeId` is provided, skip that credential (for failover).
         - Before selecting, check if any unhealthy credentials have passed cooldown — if so, mark them healthy again.
         - If no healthy credential is available, return null.
       - `markFailed(id)`: Mark a credential as unhealthy, record failure time.
       - `markSuccess(id)`: Reset failure count on success (keep it healthy).
       - `getHealthSummary()`: Returns an array of `{ id, healthy, lastFailure }` — never includes the key value.
       - `getCredentialCount()`: Returns total count of configured credentials.
    4. Use `config.keyCooldownMs` for cooldown duration
    5. Initialize health state from config.credentials on module load

    AVOID:
    - Including the actual API key in any health summary or return value except getCredential
    - Mutating the config object
    - Using setTimeout for cooldown (use timestamp comparison instead)
  </action>
  <verify>node -e "
    process.env.ROUTER_TOKEN='test';
    process.env.OPENROUTER_KEY_1='fake1';
    process.env.OPENROUTER_KEY_2='fake2';
    import('./src/credentials.js').then(m => {
      const cred = m.getCredential();
      console.log('got cred:', cred.id);
      m.markFailed(cred.id);
      const summary = m.getHealthSummary();
      console.log('summary has key?', JSON.stringify(summary).includes('fake'));
      console.log('unhealthy count:', summary.filter(s => !s.healthy).length);
      const failover = m.getCredential(cred.id);
      console.log('failover id:', failover ? failover.id : 'none');
      console.log('count:', m.getCredentialCount());
    })
  "
