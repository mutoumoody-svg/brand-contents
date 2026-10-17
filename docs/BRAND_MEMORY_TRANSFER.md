# Existing Brand Knowledge

By default, all persistent app data resides in `data/users.db`, or `DATA_DIR/users.db` when configured. Production historically used `/var/www/brand-contents/data/users.db`. Verify `DATA_DIR` on the server before assuming this path.

- `brands`: brand facts, voice, keywords, forbidden phrases, examples, customer concerns, customer language and experience fields. Studio already reuses these records directly.
- `brand_analyses`: saved customer-comment reports. Studio now retrieves the latest four for writing context and displays all in the brand-memory panel. These are legacy AI analyses, not verified product facts or independently verified quotes.
- `xhs_writing_methods`: shared writing methods, not intrinsically assigned to individual brands. Select explicitly in Studio.
- `brand_writing_knowledge`: new pending/confirmed analyses and edited rules, isolated by brand.

Nothing must be re-analyzed just to use the existing records. If the new app runs against the same production database, no copying is required. Local preview uses its own database; a Git push does not include production data.

## Selective Transfer

Upload `scripts/brand-memory.js` to the server's `scripts/` directory. Run from the production project on Ubuntu:

```bash
cd /var/www/brand-contents
node scripts/brand-memory.js --export /home/ubuntu/brand-memory.json
```

Download only this export to a private local location (for example ignored `work/`). It contains business information and saved comment analyses, but excludes users/passwords, JWT secrets, API keys, environment files, writing jobs and unrelated content.

Run locally from the project directory:

```powershell
node scripts/brand-memory.js --import work/brand-memory.json
node scripts/brand-memory.js --import work/brand-memory.json --apply
```

The first command is read-only preview. Apply creates a consistent full SQLite backup first and then imports transactionally. Brand IDs are remapped by brand name; conflicting nonempty fields abort instead of overwriting. Repeating the same import skips duplicate records. If the export includes the new knowledge table, supply `--owner LOCAL_USER_ID`; ownership is deliberately not copied from production accounts. Source approval states are preserved, not automatically promoted.

Do not publish the export or database to GitHub. Keep the server export outside any web-served directory. Review and remove temporary exports after verifying the imported counts and brand mapping.
