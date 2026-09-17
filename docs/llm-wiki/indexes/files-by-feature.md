# Files by Feature Index

Use to choose exact source paths before reading.

| Feature | Paths |
|---|---|
| bootstrap/routing | `src/main.ts`, `src/app/app.config.ts`, `src/app/app.routes.ts`, `src/app/app.component.*` |
| auth/session | `src/app/guards/*.ts`, `src/app/services/auth.service.ts`, `src/app/services/auth.interceptor.ts` |
| Experiment Studio | `src/app/pages/experiment-studio/`, `src/app/services/experiment-studio*.ts` |
| Dashboard | `src/app/pages/experiments-dashboard/`, `src/app/services/experiments-dashboard.service.ts` |
| algorithms/results | `src/app/core/algorithm-*.ts`, `src/app/core/constants/`, `src/app/models/*algorithm*.ts` |
| exports | `src/app/services/*export*.service.ts`, dashboard detail/compare components |
| shared frontend helpers | `src/app/core/route-path.utils.ts`, `src/app/core/share.utils.ts`, `src/app/core/pdf.utils.ts`, `src/app/core/result-label.utils.ts`, `src/app/core/data-model.utils.ts` |
| models | `src/app/models/` |
| runtime/build | `package.json`, `angular.json`, `src/proxy.conf.json`, Docker/nginx files, `src/assets/env.js` |
