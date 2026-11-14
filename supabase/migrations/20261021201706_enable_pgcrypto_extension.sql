-- Enable pgcrypto extension for pgp_sym_encrypt / pgp_sym_decrypt
-- Used by user_ai_keys encryption functions.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
