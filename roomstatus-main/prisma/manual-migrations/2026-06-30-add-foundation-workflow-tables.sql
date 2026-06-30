-- Foundation + Daily Cleanliness Inspection
-- Apply this migration via Supabase MCP `apply_migration` in a Supabase-management chat.
-- Migration name suggestion: "add_foundation_workflow_tables"
--
-- Mirrors prisma/schema.prisma additions. All table/column names use Prisma's
-- quoted PascalCase identifiers so the Prisma client works against this DB.

-- WorkflowDefinition
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shape" TEXT NOT NULL,
    "rolesAllowed" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkflowDefinition_slug_key" ON "WorkflowDefinition"("slug");

-- WorkflowItem
CREATE TABLE "WorkflowItem" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkflowItem_workflowId_fkey"
      FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkflowItem_workflowId_idx" ON "WorkflowItem"("workflowId");

-- WorkflowSubmission
CREATE TABLE "WorkflowSubmission" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowSubmission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkflowSubmission_workflowId_fkey"
      FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkflowSubmission_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkflowSubmission_workflowId_date_key"
  ON "WorkflowSubmission"("workflowId", "date");
CREATE INDEX "WorkflowSubmission_date_idx" ON "WorkflowSubmission"("date");
CREATE INDEX "WorkflowSubmission_workflowId_status_idx"
  ON "WorkflowSubmission"("workflowId", "status");

-- WorkflowRow
CREATE TABLE "WorkflowRow" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "note" TEXT,
    "lastUpdatedById" TEXT,
    "lastUpdatedAt" TIMESTAMP(3),
    CONSTRAINT "WorkflowRow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkflowRow_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "WorkflowSubmission"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowRow_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkflowRow_lastUpdatedById_fkey"
      FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkflowRow_submissionId_roomId_key"
  ON "WorkflowRow"("submissionId", "roomId");
CREATE INDEX "WorkflowRow_roomId_idx" ON "WorkflowRow"("roomId");

-- WorkflowCell
CREATE TABLE "WorkflowCell" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "itemText" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastUpdatedById" TEXT NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowCell_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkflowCell_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "WorkflowSubmission"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowCell_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "WorkflowItem"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkflowCell_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkflowCell_lastUpdatedById_fkey"
      FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkflowCell_submissionId_roomId_itemId_key"
  ON "WorkflowCell"("submissionId", "roomId", "itemId");
CREATE INDEX "WorkflowCell_submissionId_idx" ON "WorkflowCell"("submissionId");
CREATE INDEX "WorkflowCell_roomId_idx" ON "WorkflowCell"("roomId");
CREATE INDEX "WorkflowCell_itemId_idx" ON "WorkflowCell"("itemId");

-- WorkflowRowImage
CREATE TABLE "WorkflowRowImage" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowRowImage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkflowRowImage_rowId_fkey"
      FOREIGN KEY ("rowId") REFERENCES "WorkflowRow"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowRowImage_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkflowRowImage_rowId_idx" ON "WorkflowRowImage"("rowId");
