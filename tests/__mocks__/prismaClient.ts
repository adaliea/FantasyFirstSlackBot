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
  $transaction: jest.fn().mockImplementation((ops: Array<Promise<unknown>>) => Promise.all(ops)),
  $disconnect: jest.fn().mockResolvedValue(undefined),
}));
