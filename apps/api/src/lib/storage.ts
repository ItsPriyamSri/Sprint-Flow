import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { env } from './env';

export interface StorageDriver {
  store(filename: string, buffer: Buffer): Promise<string>; // returns storageKey
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

class LocalStorageDriver implements StorageDriver {
  constructor(private readonly baseDir: string) {}

  async store(filename: string, buffer: Buffer): Promise<string> {
    const id = randomUUID();
    const ext = path.extname(filename).toLowerCase();
    const dir = path.join(this.baseDir, id);
    await fs.mkdir(dir, { recursive: true });
    const key = `${id}/file${ext}`;
    await fs.writeFile(path.join(this.baseDir, key), buffer);
    return key;
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(path.join(this.baseDir, storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    const dir = path.dirname(path.join(this.baseDir, storageKey));
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export const storage: StorageDriver = new LocalStorageDriver(path.resolve(env.STORAGE_LOCAL_DIR));
