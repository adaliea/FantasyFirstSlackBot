-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "uuid" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "alliance_size" INTEGER NOT NULL,
    "available_teams" JSONB NOT NULL DEFAULT '[]',
    "players" JSONB NOT NULL DEFAULT '[]',
    "game_owner_slack_id" TEXT NOT NULL,
    "game_name" TEXT NOT NULL,
    "has_started" BOOLEAN NOT NULL DEFAULT false,
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "last_messages_ts_array" JSONB NOT NULL DEFAULT '[]',
    "target_players_per_game" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "games_workspace_id_idx" ON "games"("workspace_id");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
