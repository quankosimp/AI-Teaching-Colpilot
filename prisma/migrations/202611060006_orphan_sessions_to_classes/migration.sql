-- Buổi tạo trước khi có Lớp (groupId rỗng) không còn lối vào trong giao diện mới.
-- Gom theo (gia sư, học sinh chính): mỗi cặp thành một lớp dạy kèm, tên "<môn> · <tên em>",
-- thêm mọi em từng có trong các buổi đó, rồi gắn các buổi vào lớp. Không xoá dữ liệu nào.
CREATE TEMP TABLE "_orphan_pairs" AS
SELECT gen_random_uuid() AS gid, x."teacherId", x."primaryStudentId"
FROM (SELECT DISTINCT "teacherId", "primaryStudentId" FROM "Session" WHERE "groupId" IS NULL) x;

INSERT INTO "StudentGroup" ("id", "teacherId", "name", "grade", "subject", "createdAt")
SELECT o.gid, o."teacherId", st."subject" || ' · ' || st."name", st."grade", st."subject", NOW()
FROM "_orphan_pairs" o JOIN "Student" st ON st."id" = o."primaryStudentId";

INSERT INTO "StudentGroupMember" ("groupId", "studentId")
SELECT DISTINCT o.gid, rm."studentId"
FROM "_orphan_pairs" o
JOIN "Session" s ON s."teacherId" = o."teacherId" AND s."primaryStudentId" = o."primaryStudentId" AND s."groupId" IS NULL
JOIN "RoomMember" rm ON rm."sessionId" = s."id"
ON CONFLICT DO NOTHING;

UPDATE "Session" s
SET "groupId" = o.gid, "groupName" = st."subject" || ' · ' || st."name"
FROM "_orphan_pairs" o JOIN "Student" st ON st."id" = o."primaryStudentId"
WHERE s."groupId" IS NULL AND s."teacherId" = o."teacherId" AND s."primaryStudentId" = o."primaryStudentId";

DROP TABLE "_orphan_pairs";
