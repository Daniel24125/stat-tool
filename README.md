# StatTool

Automatic statistical analysis, multivariate methods and design of experiments for tabular data.
See [PLAN.md](PLAN.md) for the full architecture and roadmap.

```
apps/web         Next.js 16 app (Auth0, Prisma/Postgres, S3 storage, UI)
services/stats   FastAPI statistics service (pandas, SciPy, …)
```

## Phase 1 status
- Auth0 login/logout; app users are created on first login
- Projects with Owner / Editor / Viewer roles; owners add members by searching StatTool users (never the Auth0 tenant)
- Dataset upload (CSV/TSV/XLSX, 50 MB) to S3-compatible storage, with SHA-256 for reproducibility
- Automatic profiling: column types (with reasons), missingness, descriptives, normality test chosen by n, correlation (Pearson or Spearman chosen from normality), data-quality warnings, preview
- In-app notifications (bell polls every 10 s + dashboard feed)

## Phase 2 status
- Analyses run in the background (Next.js `after()` → stats service); members get an in-app notification when a run finishes
- **Outliers**: IQR, MAD, generalized ESD, MCD-Mahalanobis, Isolation Forest, LOF; method auto-selected from dimensionality, normality (within groups when grouped) and n; agreement table; user confirms exclusions, which later analyses can reuse
- **Compare groups**: t / Welch / Mann-Whitney, one-way ANOVA + Tukey, Welch ANOVA + Games-Howell, Kruskal-Wallis + Dunn (Holm), paired t / Wilcoxon, RM-ANOVA (Greenhouse-Geisser) / Friedman, 2–3-way ANOVA (Type II/III, HC3-robust, Box-Cox fallback) with post hoc and interaction plots; every choice is explained
- **Regression**: OLS (HC3 when heteroscedastic), logistic, Poisson / negative binomial, linear mixed model (random intercept); VIF, Cook's distance, residual and Q-Q plots
- **Correlation**: Pearson or Spearman (auto), CIs, Holm-adjusted p-values
- Stats tests: `services/stats/tests` (one-way ANOVA and Tukey checked against R's PlantGrowth results)

## Phase 3 status
- **PCA**: auto scaling, component count (80% variance vs Kaiser), Bartlett + KMO suitability, biplot, scree, loadings, Hotelling T² / Q-residual influence plot
- **PLS / PLS-DA**: components by cross-validation (SIMCA 0.0975 rule), VIP, permutation test, CV confusion matrix, green/amber/red trust verdict
- **Clustering**: k-means vs Ward for k = 2–10 chosen by silhouette, dendrogram, cluster profiles, adjusted Rand index vs known groups
- Tests: PCA reproduces published iris variance (72.96 % / 22.85 %)

## Run with Docker Compose
1. In Auth0, create a **Regular Web Application**:
   - Allowed Callback URLs: `http://localhost:3000/auth/callback`
   - Allowed Logout URLs: `http://localhost:3000`
2. `cp .env.example .env` and fill `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, plus random values for `AUTH0_SECRET` and `INTERNAL_API_KEY` (`openssl rand -hex 32`).
3. `docker compose up -d --build`
4. Open http://localhost:3000. Storage console: http://localhost:9001.

Compose runs Postgres, RustFS S3 storage (with the bucket created), the stats service, a one-shot `migrate` job and the web app.

## Local development without Docker for the app code
```bash
docker compose up -d db s3 s3-init stats
cd apps/web && cp ../../.env .env && npm install && npx prisma migrate deploy && npm run dev
```
Stats service tests:
```bash
cd services/stats && python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt && .venv/Scripts/pytest
```

## Production
- **Web**: Vercel, root `apps/web`. Set the env vars from `.env.example`; `DATABASE_URL` = Neon pooled URL; run `npx prisma migrate deploy` against Neon on release.
- **Stats**: Google Cloud Run from `services/stats/Dockerfile` (listens on `$PORT`). Set `INTERNAL_API_KEY`; point `STATS_API_URL` at the Cloud Run URL.
- **Files**: Cloudflare R2 (`S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`).
