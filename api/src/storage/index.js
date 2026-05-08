import { randomUUID } from "crypto";
import { appConfig } from "../config.js";
import { createMemoryStorage } from "./memory.js";
import { createPostgresStorage } from "./postgres.js";

export function createStorage() {
  const storage = appConfig.useInMemory ? createMemoryStorage() : createPostgresStorage({ db: appConfig.db });

  return {
    ...storage,

    newId() {
      return randomUUID();
    },
  };
}

