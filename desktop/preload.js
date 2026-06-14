const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("aiVideoWorkbench", {
  desktop: true,
  platform: process.platform,
});
