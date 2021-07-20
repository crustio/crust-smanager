export interface SDatabase {
  getConfig: (name: string) => Promise<string | null>;
}
