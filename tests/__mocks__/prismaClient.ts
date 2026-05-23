// Mock for @prisma/client used by Jest
export const PrismaClient = jest.fn().mockImplementation(() => ({
  game: {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  workspace: {
    upsert: jest.fn().mockResolvedValue({}),
  },
  finalGameScore: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({}),
  },
  $transaction: jest.fn().mockImplementation((ops: Array<Promise<unknown>>) => Promise.all(ops)),
  $disconnect: jest.fn().mockResolvedValue(undefined),
}));

// Re-export Prisma namespace for code paths that import `Prisma` for types
// (e.g., Prisma.InputJsonValue). Tests don't exercise those types directly.
export const Prisma = {};
