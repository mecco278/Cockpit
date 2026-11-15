export async function createDesktopRepository(api) {
  let data = await api.load(), busy = false;
  async function persist(operation) {
    if (busy) throw new Error('正在保存，请稍后再试。');
    busy = true;
    try { data = await operation(); }
    finally { busy = false; }
  }
  return {
    get state() { return data.workspace; },
    get revision() { return data.revision; },
    get writable() { return true; },
    get status() { return data; },
    async commit(fn) {
      const next = structuredClone(data.workspace), result = fn(next);
      await persist(() => api.commit(next, data.revision));
      return result;
    },
    restore(raw, revision) { return persist(() => api.restore(raw, revision)); },
    reset(revision = data.revision) { return persist(() => api.reset(revision)); },
    async backup() {
      // Update backup metadata only; a concurrent save may have already advanced the workspace.
      const backup = await api.backup();
      data = { ...data, ...backup };
      return backup;
    }
  };
}
