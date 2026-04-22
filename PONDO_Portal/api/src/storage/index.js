import { randomUUID } from "crypto";
import { config } from "../config.js";
import { createMemoryStorage } from "./memory.js";
import { createPostgresStorage } from "./postgres.js";

export function createStorage() {
  const storage = config.useInMemory ? createMemoryStorage() : createPostgresStorage({ db: config.db });

  return {
    ...storage,

    newId() {
      return randomUUID();
    },
  };
}

