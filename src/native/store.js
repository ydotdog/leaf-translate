import { mkdir, readFile, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../shared/protocol.js';

export class CredentialStore {
  constructor(directory) { this.directory = directory; this.file = join(directory, 'credentials.json'); this.tail = Promise.resolve(); }
  async read() {
    try { return JSON.parse(await readFile(this.file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw new AppError('STORAGE', 'errorStorage'); return null; }
  }
  withState(fn) {
    const operation = this.tail.catch(()=>{}).then(async () => {
      await mkdir(this.directory, {recursive:true, mode:0o700}); await chmod(this.directory, 0o700);
      const lock = join(this.directory, '.lock'); let acquired = false;
      for (let i=0; i<300; i++) {
        try { await mkdir(lock); acquired=true; await writeFile(join(lock,'pid'), String(process.pid)); break; }
        catch (error) {
          if (error.code !== 'EEXIST') throw error;
          try { const pid=Number(await readFile(join(lock,'pid'),'utf8')); if(pid>0) { try {process.kill(pid,0);} catch(e) {if(e.code==='ESRCH') await rm(lock,{recursive:true,force:true});} } } catch {}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
      }
      if (!acquired) throw new AppError('BUSY', 'errorStorageBusy');
      try {
        const state = await this.read() || {version:1, hostId:`urn:uuid:${randomUUID()}`, active:null, profiles:[]};
        const result = await fn(state);
        const temp = `${this.file}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(state), {mode:0o600}); await rename(temp,this.file);
        return result;
      } finally { await rm(lock,{recursive:true,force:true}); }
    });
    this.tail=operation; return operation;
  }
}
