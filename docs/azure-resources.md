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
