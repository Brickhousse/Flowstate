import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { migrateProject, ProjectFormatError } from '../src/model/migrate';
import type { Project, ProjectMeta } from '../src/model/types';

export class StorageError extends Error {
  status: 400 | 404 | 422;
  constructor(message: string, status: 400 | 404 | 422) {
    super(message);
    this.status = status;
  }
}

export interface Storage {
  list(): Promise<ProjectMeta[]>;
  load(id: string): Promise<Project>;
  save(raw: unknown): Promise<void>;
  remove(id: string): Promise<void>;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

type RenameFn = (from: string, to: string) => Promise<void>;
type WriteFileFn = (path: string, data: string) => Promise<void>;

export function createFileStorage(
  dir: string,
  fs: { rename: RenameFn; writeFile?: WriteFileFn } = { rename },
): Storage {
  const writeFileFn: WriteFileFn = fs.writeFile ?? ((path, data) => writeFile(path, data, 'utf8'));
  const pathFor = (id: string) => {
    if (!ID.test(id)) throw new StorageError('Invalid project id.', 400);
    return join(dir, `${id}.json`);
  };

  async function replace(from: string, to: string, attempts = 6): Promise<void> {
    for (let i = 0; ; i++) {
      try {
        await fs.rename(from, to);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        if (i >= attempts - 1 || !LOCK_CODES.has(code)) {
          await rm(from, { force: true });
          throw err;
        }
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
      }
    }
  }

  return {
    async list() {
      await mkdir(dir, { recursive: true });
      const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
      const metas = await Promise.all(
        files.map(async (file): Promise<ProjectMeta> => {
          const id = file.slice(0, -'.json'.length);
          const path = join(dir, file);
          const info = await stat(path);
          try {
            const data = JSON.parse(await readFile(path, 'utf8')) as { name?: unknown };
            return { id, name: typeof data.name === 'string' ? data.name : 'Untitled', updatedAt: info.mtimeMs };
          } catch {
            return { id, name: `${id} (unreadable)`, updatedAt: info.mtimeMs };
          }
        }),
      );
      return metas.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async load(id) {
      let text: string;
      try {
        text = await readFile(pathFor(id), 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageError('Project not found.', 404);
        throw err;
      }
      try {
        return migrateProject(JSON.parse(text));
      } catch (err) {
        if (err instanceof SyntaxError || err instanceof ProjectFormatError) {
          throw new StorageError(`Project file is unreadable: ${err.message}`, 422);
        }
        throw err;
      }
    },

    async save(raw) {
      let project: Project;
      try {
        project = migrateProject(raw);
      } catch (err) {
        if (err instanceof ProjectFormatError) throw new StorageError(err.message, 400);
        throw err;
      }
      const target = pathFor(project.id);
      await mkdir(dir, { recursive: true });
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      try {
        await writeFileFn(tmp, JSON.stringify(project));
      } catch (err) {
        await rm(tmp, { force: true });
        throw err;
      }
      await replace(tmp, target);
    },

    async remove(id) {
      await rm(pathFor(id), { force: true });
    },
  };
}
