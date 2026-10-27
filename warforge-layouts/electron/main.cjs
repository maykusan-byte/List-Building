const {
  app,
  BrowserWindow,
  net,
  protocol,
  shell,
  session,
} = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SCHEME = "warforge-layouts";
const ORIGIN = `${SCHEME}://app`;
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function isAppUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === `${SCHEME}:` &&
      url.hostname === "app" &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function openExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      void shell.openExternal(url.href);
  } catch {
    /* Malformed destinations are ignored. */
  }
}

function createWindow() {
  const window = new BrowserWindow({
    title: "Warforge Layouts",
    width: 1440,
    height: 1000,
    minWidth: 390,
    minHeight: 640,
    backgroundColor: "#f5f4ef",
    show: false,
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.removeMenu();
  window.once("ready-to-show", () => {
    if (process.env.WARFORGE_LAYOUTS_SMOKE !== "1") window.show();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  void window.loadURL(`${ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) => {
      callback(
        isAppUrl(contents.getURL()) &&
          permission === "clipboard-sanitized-write",
      );
    },
  );
  protocol.handle(SCHEME, async (request) => {
    try {
      if (!isAppUrl(request.url))
        return new Response("Forbidden", { status: 403 });
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const root = path.resolve(app.getAppPath(), "dist");
      const target = path.resolve(
        root,
        pathname === "/" ? "index.html" : pathname.slice(1),
      );
      const relative = path.relative(root, target);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        return new Response("Forbidden", { status: 403 });
      return await net.fetch(pathToFileURL(target).href);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  createWindow();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
