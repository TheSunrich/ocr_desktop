const electron = require('electron');
const url = require('url');
const path = require('path');
const fs = require('fs');
const hound = require('hound');
const axios = require('axios');
const confPath = './src/config/dirpath.json';
const appInfoPath = './src/config/app_info.jocr';
const FormData = require('form-data');


const crypto = require('crypto');
const Path = require("path");
const algorithm = 'aes-256-ctr';
const ENCRYPTION_KEY = Buffer.from('FoCKvdLslUuB4y3EZlKate7XGottHski1LmyqJHvUhs=', 'base64'); // or generate sample key Buffer.from('FoCKvdLslUuB4y3EZlKate7XGottHski1LmyqJHvUhs=', 'base64');
const IV_LENGTH = 16;

const {app, BrowserWindow, Menu, nativeImage, Tray, ipcMain} = electron;

function encrypt(text) {
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (text) {
        let textParts = text.split(':');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
    return undefined;
}

require('electron-reload')(__dirname, {});

let newWindow;
let mainWindow;
let watcher;
let tray = null;


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

    win.loadFile(path.join(__dirname, 'src/views/main.html'));

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

ipcMain.on('variable-request', function (event) {
    let watcherPath = JSON.parse(fs.readFileSync(confPath).toString());
    event.sender.send('variable-reply', {
        user: JSON.parse(decrypt(fs.readFileSync(appInfoPath).toString())),
        dirPath: watcherPath.dirpath,
    });
});

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
    win.loadFile(path.join(__dirname, 'src/views/login.html'));

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
    const icon = path.join(__dirname, "/public/assets/logo.ico");
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

function createWatcher() {
    let watcherPath = JSON.parse(fs.readFileSync(confPath).toString());
    let watcher = hound.watch(watcherPath.dirpath);
    watcher.on('create', (path, stats) => {
        console.log(path + ' was created');
        let ext = path.split('.').at(-1);
        const userInfo = decrypt()
        if (userInfo) {
            console.log('Usuario no identificado');
            return;
        }
        if (ext !== 'jpg' && ext !== 'png' && ext !== 'jpeg' && ext !== 'pdf') {
            console.log('Archivo no válido');
            return;
        }

        const form = new FormData();
        form.append('file', fs.createReadStream(path), Path.posix.basename(path));
        setTimeout(() => {
            console.log('File', path, 'has been send to request');
            axios.post('http://localhost:8000/upload/1/1/upload_files', form, {
                headers: form.getHeaders(),
            }).then(response => {
                console.log(response.status)
                if (response.status === 200) {
                    console.log(response.data);
                }
            }).catch(error => {
                if (error.response.status >= 400 && error.response.status < 500) {
                    console.log('Error');
                    console.log(error.response.response.data);
                }
            });
        }, 8000);
    });
    return watcher;
}

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

    newWindow.loadFile(path.join(__dirname, 'src/views/main.html'));

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


const templateMenu = [
    {
        label: 'DevTools',
        accelerator: 'Ctrl+D',
        click(item, focusedWindow) {
            focusedWindow.toggleDevTools();
        }
    }
]