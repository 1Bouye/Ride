import { PrismaClient } from "@prisma/client";

declare global {
  var prismadb: PrismaClient | undefined;
}

// Configure Prisma with connection timeout and logging
const prisma = global.prismadb || new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty',
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Helper function to check if error is a connection error
export const isConnectionError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error.message || error.toString();
  const connectionErrorIndicators = [
    'Server selection timeout',
    'No available servers',
    'ReplicaSetNoPrimary',
    'fatal alert',
    'I/O error',
    'P2010', // Prisma connection error code
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
  ];
  
  return connectionErrorIndicators.some(indicator => 
    errorMessage.includes(indicator)
  );
};

// Helper function to retry database operations
export const retryDatabaseOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (!isConnectionError(error) || attempt === maxRetries) {
        throw error;
      }
      
      console.warn(
        `[Prisma] Connection error on attempt ${attempt}/${maxRetries}. Retrying in ${delayMs}ms...`
      );
      
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  
  throw lastError;
};

// Test database connection on startup with retry
const testConnection = async () => {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      await prisma.$connect();
      console.log('[Prisma] ✅ Database connection established');
      return;
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error('[Prisma] ❌ Database connection failed after retries:', error.message);
        console.error('[Prisma] 💡 Troubleshooting tips:');
        console.error('   1. Check if MongoDB Atlas cluster is running (not paused)');
        console.error('   2. Verify DATABASE_URL in .env file is correct');
        console.error('   3. Check IP whitelist in MongoDB Atlas Network Access');
        console.error('   4. Verify SSL/TLS settings in connection string');
        console.error('   5. Check network connectivity');
      } else {
        console.warn(`[Prisma] ⚠️  Connection attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
};

testConnection();

if (process.env.NODE_ENV === "production") global.prismadb = prisma;

export default prisma;
