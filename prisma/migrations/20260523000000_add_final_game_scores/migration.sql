-- CreateTable
CREATE TABLE "final_game_scores" (
    "game_uuid" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "event_code" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoring" JSONB NOT NULL,

    CONSTRAINT "final_game_scores_pkey" PRIMARY KEY ("game_uuid")
);

-- CreateIndex
CREATE INDEX "final_game_scores_workspace_id_idx" ON "final_game_scores"("workspace_id");
