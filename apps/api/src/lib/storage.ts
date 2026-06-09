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

class S3StorageDriver implements StorageDriver {
  private readonly bucket: string;
  private readonly region: string;

  constructor(bucket: string, region: string) {
    if (!bucket || !region) {
      throw new Error('S3_BUCKET and S3_REGION are required when STORAGE_DRIVER=s3');
    }
    this.bucket = bucket;
    this.region = region;
  }

  private async getClient() {
    // Imported lazily so local-driver builds don't need the AWS SDK installed
    const { S3Client } = await import('@aws-sdk/client-s3');
    // Credentials come from the ECS task role via the default provider chain —
    // never pass AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY directly.
    return new S3Client({ region: this.region });
  }

  async store(filename: string, buffer: Buffer): Promise<string> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const id = randomUUID();
    const ext = path.extname(filename).toLowerCase();
    const key = `uploads/${id}/file${ext}`;
    const client = await this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
      }),
    );
    return key;
  }

  async read(storageKey: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async remove(storageKey: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}

export const storage: StorageDriver =
  env.STORAGE_DRIVER === 's3'
    ? new S3StorageDriver(env.S3_BUCKET, env.S3_REGION)
    : new LocalStorageDriver(path.resolve(env.STORAGE_LOCAL_DIR));
