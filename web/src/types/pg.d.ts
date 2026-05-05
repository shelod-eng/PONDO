declare module "pg" {
  export type QueryResult<TRow = Record<string, unknown>> = {
    rows: TRow[];
  };

  export class Pool {
    constructor(config?: Record<string, unknown>);
    query<TRow = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
  }
}
