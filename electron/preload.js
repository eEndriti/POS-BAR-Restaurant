const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pos", {
  appName: "Kasa Bar & Restorant",
  version: "1.0.0",
  getUsers: () => ipcRenderer.invoke("auth:getUsers"),
  login: (userId, pin) => ipcRenderer.invoke("auth:login", { userId, pin }),
  getSession: () => ipcRenderer.invoke("session:get"),
  getTables: () => ipcRenderer.invoke("tables:getAll"),
});
