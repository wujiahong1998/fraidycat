//
// src/electron-index.js
//
// Electron-specific customizations and window dressing. Also, notification of
// updates are down at the end.
//
// import 'babel-polyfill'
import '../../js/environment'
import images from '../../images/*.png'
const { Worker, isMainThread, parentPort } = require('worker_threads')
const { app, BrowserWindow, ipcMain, webContents, Menu, shell, Tray } = require('electron')
const path = require('path')
const openAboutWindow = require('about-window').default
const log = require('electron-log')
const { autoUpdater } = require('electron-updater')

const isMac = process.platform === 'darwin'

//
// Setup the common actions and menus that may be used.
//
var bg = null, win = null

const about = () => openAboutWindow({
  icon_path: path.resolve(__dirname, "../../", images['flatcat-512']),
  win_options: {
    autoHideMenuBar: true,
    resizable: false
  }
})

const quit = () => {
  app.isQuitting = true
  app.quit() 
}

function link(label, url)
{
  return { label, click: () => shell.openExternal(url) }
}

const template = [
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { label: 'About Fraidycat', click: about },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideothers' },
      { role: 'unhide' },
      { type: 'separator' },
      { label: 'Quit Fraidycat', accelerator: 'CmdOrCtrl+Q', click: quit }
    ]
  }] : []),
  {
    label: 'File',
    submenu: [
      { label: 'Show', accelerator: 'CmdOrCtrl+N',
        click: () => win && win.show() },
      { label: 'Hide', accelerator: 'CmdOrCtrl+W',
        click: () => win && win.hide() }
    ]
  },
  { role: 'editMenu' },
  {
    label: 'View',
    submenu: [
      { role: 'resetzoom' },
      { role: 'zoomin' },
      { role: 'zoomout' }
    ]
  },
  {
    role: 'help',
    submenu: [
      link('Fraidyc.at', 'https://fraidyc.at/'),
      link('Search Issues', 'https://github.com/kickscondor/fraidycat/issues')
    ]
  }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

//
// This is the context menu on input boxes, for copy/paste and such.
// Attached down in createWindow().
//
const selectionMenu = Menu.buildFromTemplate([
  {role: 'copy'},
  {type: 'separator'},
  {role: 'selectall'},
])

const inputMenu = Menu.buildFromTemplate([
  {role: 'undo'},
  {role: 'redo'},
  {type: 'separator'},
  {role: 'cut'},
  {role: 'copy'},
  {role: 'paste'},
  {type: 'separator'},
  {role: 'selectall'},
])

//
// Manage window open/close
//
function createWindow() {
  bg = new BrowserWindow({
    webPreferences: {nodeIntegration: true},
    show: false
  })

  bg.loadURL(`file://${path.resolve(__dirname, "../../background.html")}`)

  win = new BrowserWindow({
    width: 900,
    height: 680,
    show: false,
    webPreferences: {nodeIntegration: true},
    icon: path.resolve(__dirname, "../../", images['flatcat-32'])
  })

  //
  // Add context menu to text inputs. (by gabriel)
  // https://github.com/electron/electron/issues/4068#issuecomment-274159726
  //
  win.webContents.on('context-menu', (e, props) => {
    const { selectionText, isEditable } = props
    if (isEditable) {
      inputMenu.popup(win)
    } else if (selectionText && selectionText.trim() !== '') {
      selectionMenu.popup(win)
    }
  })

  //
  // Open links in the default browser.
  //
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== e.sender.getURL()) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  win.loadURL(`file://${path.resolve(__dirname, "../../index.html")}`)
  win.once("ready-to-show", () => {
    win.setMenuBarVisibility(false)
    win.show()
  })
  win.on("close", ev => {
    if (app.isQuitting) {
      win = null
    } else {
      ev.preventDefault()
      win.hide()
    }
    return false
  })
}

//
// Ensure there is only one Fraidycat window running. Fetching all of these
// feeds is taxing and work shouldn't be duplicated.
//
var canRun = app.requestSingleInstanceLock()
if (!canRun) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  //
  // Central messaging channel. The two foreground and background pass messages
  // through here.
  //
  ipcMain.handle("fraidy", (e, msg) => {
    if (msg.receiver) {
      webContents.fromId(msg.receiver).send('fraidy', msg)
    } else {
      for (var wc of webContents.getAllWebContents()) {
        if (wc.id !== msg.sender) {
          wc.send('fraidy', msg)
        }
      }
    }
  })

  //
  // On Windows and Linux, a systray icon is used to keep the app in the
  // background and allow follows to update there.
  //
  var tray
  app.once("ready", () => {
    if (!isMac) {
      tray = new Tray(path.resolve(__dirname, "../../", images['flatcat-32']))
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Fraidycat', click: () => win.show() },
        // { label: 'Background', click: () => bg.show() }, // DEBUG
        { label: 'About', click: about },
        { label: 'Quit', click: quit }
      ])
      tray.setToolTip('Fraidycat')
      tray.setContextMenu(contextMenu)
      tray.on("click", () => win.show())
    }
    createWindow()
    autoUpdater.checkForUpdates()
  })

  app.on("quit", () => {
    if (isMac) {
      app.isQuitting = true
    }
  })

  app.on("window-all-closed", () => {
    if (!isMac) {
      app.quit()
    }
  })

  app.on("activate", () => {
    if (win === null) {
      createWindow()
    }
  })
}

//
// Update notifications setup and debug
//
autoUpdater.logger = log
// autoUpdater.logger.transports.file.level = 'info'
