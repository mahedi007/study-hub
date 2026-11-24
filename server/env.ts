import type { User } from '../shared/types';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  SIGNING_KEY?: string;
  SUPER_ADMIN_EMAIL?: string;
  AUTH_SECRET?: string;
  SETUP_CODE?: string;
  PASSWORD_ITERATIONS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  CONTENT_ORIGIN?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User };
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
