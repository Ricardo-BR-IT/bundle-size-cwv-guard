# Bundle Size & Core Web Vitals Budget Guard

> **Category:** Performance | **Pricing:** $29/mo per organization | **Vendor:** Ricardo Vieira Forge Cloud

## Why Use This Action?

Single npm dependency imports silently bloat JS/CSS bundles by 200KB+, degrading LCP/FCP and SEO rankings before anyone notices.

**Competitive Edge:** Existing tools require external SaaS dashboards or complex webpack plugins; teams want a framework-agnostic dist/ gzipped budget gate directly in PR summaries.

## Quick Start (Copy-Paste Workflow)

```yaml
name: Bundle Size & CWV Budget Guard
on: [pull_request]

jobs:
  bundle-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - name: Check Bundle & CWV Budget
        uses: ricardovieiraforge/bundle-size-cwv-guard@v1
        with:
          dist-dir: 'dist'
          max-js-kb: '250'
          max-css-kb: '60'
          max-total-kb: '450'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `dist-dir` | Build output directory to inspect | `False` | `dist` |
| `max-js-kb` | Maximum gzipped JS budget in KB | `False` | `250` |
| `max-css-kb` | Maximum gzipped CSS budget in KB | `False` | `60` |
| `max-total-kb` | Maximum total gzipped asset budget in KB | `False` | `450` |

## Outputs

| Output | Description |
|--------|-------------|
| `total-kb` | Total raw bundle size in KB |
| `gzip-kb` | Total gzipped bundle size in KB |
| `budget-passed` | true if all budgets pass |

## Local Verification

```bash
node --check src/index.js
node src/index.js --self-test
```

## License

MIT — Built by Ricardo Vieira Forge Cloud (souza@usa.com).
