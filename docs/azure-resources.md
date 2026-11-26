# Azure resources (Team Falcons)

Subscription: Azure for Students. Resource group: `rg-lostfound-falcons`.
Region: Belgium Central. The subscription's policy only allows North Central US,
West US, Canada Central, Norway East and Belgium Central, and Azure SQL server
creation was refused in the three US regions at the time of setup.

| Resource | Name | Notes |
|---|---|---|
| Azure SQL server | `lfcampus-sql-dfsjl` | Entra-only admin, no SQL password |
| Azure SQL database | `lostfound` | Basic tier (5 DTU, 2 GB), schema from `src/backend/db/schema.sql` |
| Storage account | `lfcampuss2iv1` | Shared key access disabled, no public blobs |
| Blob containers | `listing-photos`, `claim-evidence` | Both private |
| Key Vault | `lfcampus-kv-s2iv1` | RBAC authorization; holds `jwt-secret` and `evidence-encryption-key` |

No secret values are stored in this repository. Apply the schema with
`node db/migrate.js` using `DB_AUTH=aad` (see `src/backend/.env.example`).

## Deployment

- Live URL: https://lfcampus-api-s2iv1.azurewebsites.net (App Service `lfcampus-api-s2iv1`, plan `lfcampus-plan`, B1).
  The API also serves the built React client from `public/`.
- Email: Communication Services `lfcampus-comm` with the Azure-managed domain (`lfcampus-email`).
- Identity: the App Service system-assigned identity has Storage Blob Data Contributor,
  Key Vault Secrets User, Communication and Email Service Owner, and a read/write database user.
- CI/CD: `.github/workflows/deploy.yml` signs in with the Entra app `gh-lostfound-deploy`
  (Contributor on this resource group only, federated credential for the `production`
  environment, no stored secret). Set these GitHub secrets (ids, not credentials):
  `AZURE_CLIENT_ID=c4a4254e-fdf5-4aa2-b713-d72fa89e40fc`,
  `AZURE_TENANT_ID=70de1992-07c6-480f-a318-a1afcba03983`,
  `AZURE_SUBSCRIPTION_ID=b03b3520-6916-4f6e-ac7c-d764e299a748`,
  and create a GitHub environment named `production`.
- Zip packages must use forward-slash entry names (Windows `Compress-Archive` does not),
  and the remote build (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`) runs `npm install`.
