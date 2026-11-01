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
END \$\$;
"
