const electron = require('electron');
const Path = require("path");
const fs = require('fs');
const hound = require('hound');
const axios = require('axios');
const confPath = './src/config/dirpath.json';
const appInfoPath = './src/config/app_info.jocr';
const FormData = require('form-data');
const {encrypt, decrypt} = require("./src/utils/cypher");
const {app, BrowserWindow, Menu, nativeImage, Tray, ipcMain} = electron;
const Queue = require("./src/utils/Queue");

require('electron-reload')(__dirname, {});

let newWindow;
let mainWindow;
let watcher;
let tray = null;

//App de electron
app.whenReady().then(() => {
    watcher = createWatcher();
    mainWindow = isLogged() ? createMainWindow() : createLoginWindow();
});

app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
        if (isLogged()) createMainWindow();
        else createLoginWindow();
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

ipcMain.on('user:info', (e, userInfo) => {
    fs.writeFileSync(appInfoPath, encrypt(JSON.stringify(userInfo, null, 2)));

    if (newWindow) {
        newWindow.focus(); //focus to new window
        return;
    }

    if (!tray) {
        createTray();
    }

    newWindow = new BrowserWindow({//1. create new Window
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: false,
    });

    newWindow.loadFile(Path.join(__dirname, 'src/views/main.html'));

    newWindow.once('ready-to-show', () => { //when the new window is ready, show it up
        newWindow.show()
    })

    newWindow.on('closed', function () { //set new window to null when we're done
        newWindow = null
    })

    mainWindow.close(); //close the login window(the first window)
    mainWindow = newWindow;
    const menu = Menu.buildFromTemplate(templateMenu)
    Menu.setApplicationMenu(menu);
})

ipcMain.on('variable-request', function (event) {
    let watcherPath = JSON.parse(fs.readFileSync(confPath).toString());
    event.sender.send('variable-reply', {
        user: JSON.parse(decrypt(fs.readFileSync(appInfoPath).toString())),
        dirPath: watcherPath.dirpath,
    });
});

//
function isLogged() {
    return fs.readFileSync(appInfoPath).toString().trim() !== ''
}

function createMainWindow() {
    if (!tray) {
        createTray();
    }
    let win = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: false,
    });

    win.loadFile(Path.join(__dirname, 'src/views/main.html'));

    win.on("close", function (event) {
        event.preventDefault();
        win.hide();
    });
    win.on("restore", function (event) {
        win.show();
        tray.destroy();
    });

    const menu = Menu.buildFromTemplate(templateMenu)
    Menu.setApplicationMenu(menu);
    return win;
}

function createLoginWindow() {
    if (!tray) {
        createTray();
    }

    let win = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
    });
    win.loadFile(Path.join(__dirname, 'src/views/login.html'));

    win.on("close", function (event) {
        event.preventDefault();
        win.hide();
    });
    win.on("restore", function (event) {
        win.show();
        tray.destroy();
    });

    return win;
}

function createTray() {
    const icon = Path.join(__dirname, "/public/assets/logo.ico");
    const trayicon = nativeImage.createFromPath(icon);
    tray = new Tray(trayicon.resize({width: 16}));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Show App",
            click: () => {
                if (isLogged()) {
                    createMainWindow();
                } else {
                    createLoginWindow();
                }
            },
        },
        {
            label: "Quit",
            click: () => {
                app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
}

//
let b = false;
let list = new Queue();

function createWatcher() {
    let watcherPath = JSON.parse(fs.readFileSync(confPath).toString());
    let watcher = hound.watch(watcherPath.dirpath);
    watcher.on('create', (path, stats) => {
        console.log(path + ' was created');
        let ext = path.split('.').at(-1);
        if (ext !== 'jpg' && ext !== 'png' && ext !== 'jpeg' && ext !== 'pdf') {
            console.log('Archivo no válido');
            return;
        }
        list.enqueue(path);
        send();
    });
    return watcher;
}

function pause(milliseconds) {
    var dt = new Date();
    while ((new Date()) - dt <= milliseconds) { /* Do nothing */
    }
}

function send() {
    if(!b && list.isEmpty()){
        mainWindow.webContents.send('toast', {
            title: 'Archivos Cargados',
            text: 'Los archivos fueron cargados exitosamente.',
            icon: 'success',
        });
    }
    if (b || list.isEmpty() || !isLogged()) {
        return;
    }
    console.log('send called')
    b = true;

    let userInfo = JSON.parse(decrypt(fs.readFileSync(appInfoPath).toString()));
    const form = new FormData();
    let path = list.dequeue();
    pause(3000);
    form.append('file', fs.createReadStream(path), Path.posix.basename(path));
    console.log('File', path, 'has been send to request');
    axios.post(`http://localhost:8000/upload/${userInfo.idBranch}/${userInfo.id}/upload_files`, form, {
        headers: form.getHeaders(),
    }).then(response => {
        console.log(response.status)
        if (response.status === 200) {
            console.log(response.data);
        }
    }).catch(error => {
        console.log(error);
    }).finally(() => {
        b = false;
        send();
    });
}


const templateMenu = [
    {
        label: 'DevTools',
        accelerator: 'Ctrl+D',
        click(item, focusedWindow) {
            focusedWindow.toggleDevTools();
        }
    }
]