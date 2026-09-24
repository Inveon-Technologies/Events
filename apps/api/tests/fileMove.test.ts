import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { moveFile } from '../src/services/fileMove';

describe('moveFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'movefile-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('moves a file within one filesystem', async () => {
    const from = path.join(dir, 'a.png');
    const to = path.join(dir, 'b.png');
    await fs.writeFile(from, 'data');
    await moveFile(from, to);
    expect(await fs.readFile(to, 'utf8')).toBe('data');
    await expect(fs.access(from)).rejects.toThrow();
  });

  it('falls back to copy + delete when rename crosses filesystems (EXDEV, e.g. a mounted Docker volume)', async () => {
    const from = path.join(dir, 'a.png');
    const to = path.join(dir, 'b.png');
    await fs.writeFile(from, 'data');
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' }));

    await moveFile(from, to);

    expect(await fs.readFile(to, 'utf8')).toBe('data');
    await expect(fs.access(from)).rejects.toThrow();
  });

  it('still surfaces any other error', async () => {
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await expect(moveFile(path.join(dir, 'x'), path.join(dir, 'y'))).rejects.toThrow('denied');
  });
});
