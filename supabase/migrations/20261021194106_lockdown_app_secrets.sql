/*
# Lock down app_secrets table privileges

app_secrets holds the master encryption key for user API keys. Despite RLS
being enabled with no policies (deny-by-default), the default Postgres
table privileges granted SELECT to anon and authenticated roles via the
public schema grant. Revoke those so only the owner (postgres) and service
role can read it.
*/

REVOKE ALL ON app_secrets FROM anon, authenticated;
GRANT SELECT ON app_secrets TO service_role;
