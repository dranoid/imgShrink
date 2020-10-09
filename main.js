const path = require("path");
const os = require("os");
const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  dialog,
} = require("electron");
const imagemin = require("imagemin");
const imageminMozJpeg = require("imagemin-mozjpeg");
const imageminPngQuant = require("imagemin-pngquant");
const slash = require("slash");
const log = require("electron-log");
const Settings = require("electron-store");
const settings = new Settings();

// set environment
process.env.NODE_ENV = "production";
const isDev = process.env.NODE_ENV !== "production" ? true : false;
// check platform
const isWindows = process.platform === "win32" ? true : false;
const isMac = process.platform === "darwin" ? true : false;
const isLinux = process.platform === "linux" ? true : false;

//load settings
const openFile = settings.get("openFile");
const defaultPath = settings.get("path");
//default settings for imageshrink
const restoreDef = {
  openFile: true,
  path: path.join(os.homedir(), "imageshrink"),
};

//prevent garbage collection
let mainWindow;
let aboutWindow;
let settingsWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: "ImageShrink",
    width: isDev ? 700 : 500,
    height: 600,
    icon: "./assets/icons/icon_256x256.png",
    resizable: isDev ? true : false,
    backgroundColor: "white",
    webPreferences: {
      nodeIntegration: true,
    },
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.loadFile("app/index.html");

  mainWindow.webContents.on("dom-ready", () => {
    mainWindow.webContents.send("set-path", defaultPath);
  });
}

function createAboutWindow() {
  aboutWindow = new BrowserWindow({
    title: "About ImageShrink",
    height: 300,
    width: 300,
    icon: "./assets/icons/icon_256x256.png",
    resizable: false,
    backgroundColor: "white",
  });

  aboutWindow.loadFile("./app/about.html");
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    title: "Settings",
    height: 350,
    width: 350,
    icon: "./assets/icons/icon_256x256.png",
    resizable: isDev ? true : false,
    backgroundColor: "white",
    modal: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
    },
  });
  settingsWindow.setMenuBarVisibility(false);

  settingsWindow.loadFile("app/settings.html");

  //to load the previous settings into the renderer when settingsWindow is opened
  settingsWindow.webContents.on("dom-ready", () => {
    settingsWindow.webContents.send("preset-loadout", {
      openFile,
      defaultPath,
    });
  });
}

const menuTemplate = [
  ...(isMac
    ? [
        {
          label: app.name,
          submenu: [
            {
              label: "About",
              click: createAboutWindow,
            },
          ],
        },
      ]
    : []),
  {
    label: "File",
    submenu: [
      {
        label: "Settings",
        accelerator: "CmdOrCtrl+K",
        click: createSettingsWindow,
      },

      {
        type: "separator",
      },
      isMac ? { role: "close" } : { role: "quit" },
    ],
  },
  ...(!isMac
    ? [
        {
          label: "Help",
          submenu: [
            {
              label: "About",
              click: createAboutWindow,
            },
          ],
        },
      ]
    : []),

  ...(isDev
    ? [
        {
          label: "Developer",
          submenu: [
            { role: "reload" },
            { role: "forcereload" },
            { type: "separator" },
            { role: "toggledevtools" },
          ],
        },
      ]
    : []),
];

ipcMain.on("image:minimize", (e, data) => {
  shrinkImage(data);
});

//set default path for the settingsWindow so that it can save it with electron store
ipcMain.on("get-default-path", (event) => {
  dialogPath(event, "default-path");
});

//save settings
ipcMain.on("save-settings", (e, options) => {
  settings.set("path", options.path);
  settings.set("openFile", options.openFileinFolder);
  settingsWindow.close();
  //Relaunch app - in a more complex app, the option will be given whether to restart now or later
  app.relaunch(); //find a way to know which one it is, try the status thing
  app.quit();
});

//restore default - send the restoreDef object to renderer
ipcMain.on("restore-default", (e) => {
  e.sender.send("default-object", restoreDef);
});

//to pick a custom path
ipcMain.on("choose-path", (e) => {
  dialogPath(e, "chosen-path");
});

app.on("ready", () => {
  createMainWindow();

  const mainMenu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(mainMenu);

  // mainWindow.on("ready", () => (mainWindow = null));
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

async function shrinkImage({ imgPath, quality, destination }) {
  try {
    const pngQuality = quality / 100;
    const files = await imagemin([slash(imgPath)], {
      destination: destination,
      plugins: [
        imageminMozJpeg({ quality }),
        imageminPngQuant({
          quality: [pngQuality, pngQuality],
        }),
      ],
    });

    log.info(files);
    if (openFile) {
      shell.openPath(destination);
    }
    mainWindow.webContents.send("Image:Done");
  } catch (err) {
    log.error(err);
  }
}

function dialogPath(eventHandler, returnChannelName) {
  const options = {
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
  };

  dialog
    .showOpenDialog(options)
    .then((result) => {
      eventHandler.sender.send(returnChannelName, result.filePaths);
    })
    .catch((err) => {
      log.error(err);
    });
}
