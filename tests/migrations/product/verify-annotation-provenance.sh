#!/usr/bin/env bash
set -euo pipefail
: "${MIGRATION_TEST_DATABASE_URL:?Set MIGRATION_TEST_DATABASE_URL to an empty, dedicated PostgreSQL database}"
task_root="$(cd "$(dirname "$0")/../../.." && pwd)"
task_tmp="$(mktemp -d)"
trap 'rm -rf "$task_tmp"' EXIT
mkdir -p "$task_tmp/migrations"
cp "$task_root/prisma/schema.prisma" "$task_tmp/schema.prisma"
cp "$task_root/prisma/migrations/migration_lock.toml" "$task_tmp/migrations/"
cp -r "$task_root"/prisma/migrations/20261031000[1-4]* "$task_tmp/migrations/"
DATABASE_URL="$MIGRATION_TEST_DATABASE_URL" node "$task_root/node_modules/prisma/build/index.js" migrate deploy --schema "$task_tmp/schema.prisma"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$task_root/tests/migrations/product/legacy-annotations.sql"
cp -r "$task_root/prisma/migrations/202611010001_annotation_owner" "$task_tmp/migrations/"
DATABASE_URL="$MIGRATION_TEST_DATABASE_URL" node "$task_root/node_modules/prisma/build/index.js" migrate deploy --schema "$task_tmp/schema.prisma"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$task_root/tests/migrations/product/direct-annotation.sql"
cp -r "$task_root"/prisma/migrations/20261101000[2-4]* "$task_tmp/migrations/"
DATABASE_URL="$MIGRATION_TEST_DATABASE_URL" node "$task_root/node_modules/prisma/build/index.js" migrate deploy --schema "$task_tmp/schema.prisma"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$task_root/tests/migrations/product/assert-annotation-provenance.sql"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$task_root/tests/migrations/product/duplicate-sources.sql"
cp -r "$task_root/prisma/migrations/202611010005_duplicate_source_claims" "$task_tmp/migrations/"
DATABASE_URL="$MIGRATION_TEST_DATABASE_URL" node "$task_root/node_modules/prisma/build/index.js" migrate deploy --schema "$task_tmp/schema.prisma"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$task_root/tests/migrations/product/assert-duplicate-sources.sql"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$task_root/tests/migrations/product/historical-deleted-duplicate.sql"
cp -r "$task_root/prisma/migrations/202611010006_historical_duplicate_sources" "$task_tmp/migrations/"
DATABASE_URL="$MIGRATION_TEST_DATABASE_URL" node "$task_root/node_modules/prisma/build/index.js" migrate deploy --schema "$task_tmp/schema.prisma"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$task_root/tests/migrations/product/assert-historical-deleted-duplicate.sql"
DATABASE_URL="$MIGRATION_TEST_DATABASE_URL" node "$task_root/node_modules/prisma/build/index.js" migrate deploy --schema "$task_tmp/schema.prisma"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$task_root/tests/migrations/product/assert-historical-deleted-duplicate.sql"
cp -r "$task_root/prisma/migrations/202611010007_annotation_shared_and_evidence_auto" "$task_tmp/migrations/"
cp -r "$task_root/prisma/migrations/202611010008_ai_request_fields" "$task_tmp/migrations/"
DATABASE_URL="$MIGRATION_TEST_DATABASE_URL" node "$task_root/node_modules/prisma/build/index.js" migrate deploy --schema "$task_tmp/schema.prisma"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Annotation' AND column_name='sharedWithClass') THEN
    RAISE EXCEPTION 'sharedWithClass column missing on Annotation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Evidence' AND column_name='isAuto') THEN
    RAISE EXCEPTION 'isAuto column missing on Evidence';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceRevision' AND column_name='isAuto') THEN
    RAISE EXCEPTION 'isAuto column missing on EvidenceRevision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AIRequest' AND column_name='editedText') THEN
    RAISE EXCEPTION 'editedText column missing on AIRequest';
  END IF;
END \$\$;
"
# Upgrade an already-applied 008 without rewriting its checksum or losing AI history.
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "AIRequest" (id,"sessionId","studentId",kind,prompt,"promptVersion","responseText","contextSummary",provider,model,"modelVersion",status,"actorId")
VALUES ('90909090-9090-4090-8090-909090909090','44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','suggestion','legacy prompt','v1','legacy response','legacy context','mock','mock','v1','ready','11111111-1111-4111-8111-111111111111');
SQL
cp -r "$task_root/prisma/migrations/202611010009_ai_teaching_modes" "$task_tmp/migrations/"
DATABASE_URL="$MIGRATION_TEST_DATABASE_URL" node "$task_root/node_modules/prisma/build/index.js" migrate deploy --schema "$task_tmp/schema.prisma"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
      WHERE t.typname='AIKind' AND e.enumlabel IN ('explain','leading_question','example','difficulty')) <> 4 THEN
    RAISE EXCEPTION 'Teaching modes missing after additive upgrade';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "AIRequest" WHERE id='90909090-9090-4090-8090-909090909090'
      AND kind='suggestion' AND "responseText"='legacy response') THEN
    RAISE EXCEPTION 'Existing AI history lost during upgrade';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='202611010008_ai_request_fields'
      AND checksum='352e6ae7428c7f7e59b44705a74d2060baa1b748903414b274b2be06d235604d') THEN
    RAISE EXCEPTION 'Applied migration 008 checksum changed';
  END IF;
END $$;
SQL

cp -r "$task_root/prisma/migrations/202611010010_ai_plan_sources" "$task_tmp/migrations/"
DATABASE_URL="$MIGRATION_TEST_DATABASE_URL" node "$task_root/node_modules/prisma/build/index.js" migrate deploy --schema "$task_tmp/schema.prisma"
psql "$MIGRATION_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "AIRequest" WHERE id='90909090-9090-4090-8090-909090909090' AND "sourceClaimRefs"='[]'::jsonb AND "responseText"='legacy response') THEN
    RAISE EXCEPTION 'Legacy AI request changed when adding plan provenance';
  END IF;
END $$;
SQL
