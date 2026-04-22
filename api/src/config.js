import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4100),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  useInMemory: String(process.env.USE_IN_MEMORY || "true").toLowerCase() === "true",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "pondo",
    ssl: String(process.env.DB_SSL || "false").toLowerCase() === "true",
  },
};
