const { contextBridge, ipcRenderer } = require('electron');

async function invoke(name, ...args) {
  const reply = await ipcRenderer.invoke('cockpit:' + name, ...args);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}
contextBridge.exposeInMainWorld('cockpitDesktop', {
  load: () => invoke('load'),
  commit: (workspace, revision) => invoke('commit', workspace, revision),
  inspectBackup: raw => invoke('inspect', raw),
  restore: (raw, revision) => invoke('restore', raw, revision),
  reset: revision => invoke('reset', revision),
  backup: () => invoke('backup'),
  openBackups: () => invoke('open-backups'),
  exportBackup: () => invoke('export')
});
