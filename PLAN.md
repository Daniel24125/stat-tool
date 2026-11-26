# StatTool — Architecture & Build Plan

## Stack
| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router, TS), Tailwind v4, shadcn/ui, TanStack Table, Plotly.js (scientific plots), React Flow (pipeline builder), Zustand |
| Auth | Auth0 (`@auth0/nextjs-auth0` v4); Next.js signs a short-lived JWT for the Python API (audience = stats API) |
| DB | Neon Postgres (prod), local Postgres container (dev) + Prisma |
| Jobs | FastAPI runs analyses as background tasks, writes `AnalysisRun` results and a `Notification` row to Postgres |
| Notifications | In-app bell + dashboard feed. Polls `/api/notifications` every ~10 s (SWR); no websockets (Vercel can't host them, and polling is enough for analysis-done events) |
| Python host (free) | **Google Cloud Run** (recommended: scales to zero, 2M requests/mo free, up to 32 GB RAM). Alternative: **Hugging Face Spaces (Docker)**, 16 GB RAM free, sleeps after 48 h idle. Avoid Render free (512 MB, cold starts ~1 min) for PLS/RSM workloads |
| File storage | Vercel Blob or S3 (uploaded CSV/XLSX, generated reports) |
| Stats API | FastAPI on Railway/Fly/Render; validates Auth0 access tokens |
| Python libs | numpy, pandas, scipy, statsmodels, scikit-learn, pingouin, scikit-posthocs, pyDOE3, pyod, statsmodels.mixedlm, matplotlib (report figs), python-docx, weasyprint |

## Data model (collaboration)
- `User` (auth0 sub, email)
- `Project` — container; `ProjectMember {userId, projectId, role: OWNER|EDITOR|VIEWER}`
- Sharing: owner types a name/email; autocomplete searches the app's own `User` table (rows are created on first login to StatTool), never the Auth0 tenant. Min 3 chars, max 8 results, shows name + masked email. No email is sent. Every route checks role server-side.
- Auth0 gating: a post-login Action tags users with `app_metadata.apps += "stattool"` (or restricts login to an allowed connection) so only StatTool users exist in the app.
- `Notification {userId, projectId, runId, kind, message, readAt}` — created on analysis complete/failed, member added, role changed
- `Dataset {projectId, blobUrl, schema(json), rows, cols, version}`
- `Pipeline {projectId, steps(json)}` — ordered, typed steps
- `AnalysisRun {pipelineId, datasetId, status, results(json), diagnostics(json), createdBy}`
- `Report {runId, format, blobUrl}`

All access checked server-side via membership role.

## Stats engine modules (FastAPI `/v1/...`)
1. **Profiling** — types, missingness, normality (Shapiro-Wilk n<5000 / Anderson-Darling / D'Agostino), skew/kurtosis, homoscedasticity (Levene/Brown-Forsythe), balance of design.
2. **Outliers (auto-select)** — candidates: IQR/Tukey fences, robust z (MAD), Grubbs/Rosner (normal univariate), Mahalanobis + MCD (multivariate Gaussian), Isolation Forest, LOF. Selector rule: univariate vs multivariate × normality × n × dimensionality; reports agreement across methods; user confirms removal (never silent).
3. **Significance (auto-suggest)**
   - 2 groups: t-test / Welch / Mann-Whitney / paired t / Wilcoxon
   - k groups: one-way ANOVA + Tukey HSD; Welch ANOVA + Games-Howell (unequal var); Kruskal-Wallis + Dunn (Holm); RM-ANOVA / Friedman
   - Two/three-way ANOVA (Type II/III SS chosen by balance), interactions, partial η², ω²
   - Decision tree is shown to the user with the reason for each choice.
4. **Multivariate** — PCA (scaling, scree, loadings, biplot, Hotelling T², Q residuals), PLS/PLS-DA (CV-chosen components, Q², R², VIP), MANOVA, two/three-way ANOVA, hierarchical clustering, k-means (silhouette), correlation (Pearson/Spearman auto).
5. **Regression & mixed models** — OLS, GLM (family suggested from response type), LMM; residual diagnostics, VIF, Cook's distance.
6. **DoE**
   - Screening: Plackett-Burman, fractional factorial (resolution III–V), Definitive Screening Design, full factorial
   - Optimization (RSM): CCD (circumscribed / inscribed / face-centered, rotatable), Box-Behnken, D-optimal
   - **Advisor**: inputs = #factors, #responses, run budget, curvature expected, blocking → recommends design, shows runs, df for error/lack-of-fit, aliasing
   - **Analysis**: model fit, ANOVA, lack-of-fit, R²/adj R²/pred R², adequate precision, PRESS, residual plots, Pareto of effects, Box-Cox, contour/3D surface, stationary point (canonical analysis), desirability optimization
   - **Trust verdict** (green/amber/red) from a rule set: residual df ≥ 3, lack-of-fit p > 0.05, pred R² within 0.2 of adj R², adequate precision > 4, normal residuals, no influential points, VIF < 10. Every rule is explained.
7. **Power analysis** — t-test, ANOVA, regression, sample size for DoE.
8. **Reports** — PDF + DOCX: methods paragraph, tables, figures, diagnostics, software versions.

## Pipeline builder
React Flow canvas or step list: Import → Clean/Impute → Outliers → Transform → Significance → Multivariate → DoE → Report. Each step has an "Auto" mode (engine picks) or "Manual". Pipelines are saved, versioned and re-run on new datasets.

## Citations page
- Auto-generated from versions in `requirements.txt` / `package.json` at build time (`/v1/meta/versions`)
- BibTeX / APA for: Python, NumPy, SciPy, pandas, statsmodels, scikit-learn, pingouin, scikit-posthocs, pyDOE3, PyOD, Plotly
- **Dynamic methods paragraph** built from the methods each run actually used, e.g.:
  > "Statistical analyses were performed in StatTool (v1.0) using Python 3.12 with SciPy 1.14 (Virtanen et al., 2020), statsmodels 0.14 (Seabold & Perktold, 2010) and scikit-learn 1.5 (Pedregosa et al., 2011). Normality was assessed with the Shapiro–Wilk test and homogeneity of variance with Levene's test. Outliers were identified by the robust Mahalanobis distance using the Minimum Covariance Determinant estimator (χ² cut-off, α = 0.025) and removed before analysis. Group differences were tested by two-way ANOVA (Type II sums of squares) followed by Tukey's HSD post-hoc test. Significance was set at α = 0.05. Multivariate structure was explored by PCA on autoscaled data, and a PLS regression model was validated by 7-fold cross-validation (Q²)."

## Other suggestions
- Effect sizes and 95 % CIs everywhere (not only p-values); multiple-testing correction (Holm/BH)
- Plots: violin+jitter, interaction plots, Q-Q, residual vs fitted, Pareto, contour/3D surface, biplot, VIP, dendrogram, correlation heatmap
- Reproducibility: each run stores dataset hash, parameters, library versions, and an exportable Python script
- Audit log per project; comments on results

## Phases
1. **Foundation** — monorepo (`apps/web`, `services/stats`), Auth0 login, Prisma schema, projects/members/invitations, dataset upload & profiling
2. **Core stats** — outliers, significance auto-selection, ANOVA/Tukey, regression/LMM, correlation
3. **Multivariate** — PCA, PLS/PLS-DA, clustering
4. **Pipelines** — builder, saved pipelines, run history
5. **DoE** — designer/advisor, RSM analysis, trust verdict
6. **Power, reports, citations page**
7. Deploy (Vercel + Railway), tests (pytest checked against reference datasets, Playwright E2E)

## Local run (Docker Compose)
`docker compose up` starts:
- `db` — postgres:16 (data volume); swap `DATABASE_URL` to Neon for prod
- `stats` — FastAPI (uvicorn, port 8000)
- `web` — Next.js (port 3000); runs `prisma migrate deploy` on start
- `minio` — S3-compatible file storage locally (Vercel Blob/R2 in prod)
Config via `.env` (`.env.example` provided). Auth0 still required locally (callback `http://localhost:3000/auth/callback`).

## Things you'll need to provide
- Auth0 tenant: Regular Web App (callback/logout URLs) + an API (audience) for the stats service
- Postgres URL, Blob/S3 credentials, Python host account
- Free file storage for prod: Cloudflare R2 (10 GB free, S3 API) recommended
