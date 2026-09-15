export class CorruptRecordError extends Error {
  constructor(store: string, key: string) {
    super(`Corrupt record in store "${store}" for key "${key}"`);
    this.name = 'CorruptRecordError';
  }
}
