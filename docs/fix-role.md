# Fix: Admin-Rolle auf admin+trainer setzen

## Problem
User `dbl70@web.de` hatte die Rolle `admin`, konnte aber nicht als Trainer agieren.
Die Rolle muss `admin+trainer` sein, damit sowohl Admin-Dashboard als auch Trainer-Portal funktionieren.

## SQL (Supabase SQL Editor ausführen)

```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"admin+trainer"')
WHERE email = 'dbl70@web.de';
```

## Verifizieren

```sql
SELECT email, raw_user_meta_data->>'role' AS role
FROM auth.users
WHERE email = 'dbl70@web.de';
```
