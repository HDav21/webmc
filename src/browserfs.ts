import * as fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import fs from 'fs'
import sanitizeFilename from 'sanitize-filename'
import { oneOf } from '@zardoy/utils'
import * as browserfs from 'browserfs'
import { options, resetOptions } from './optionsStorage'

import { fsState, loadSave } from './loadSave'
import { installResourcepackPack, installTexturePackFromHandle, updateTexturePackInstalledState } from './resourcePack'
import { miscUiState } from './globalState'
import { setLoadingScreenStatus } from './appStatus'
import { VALID_REPLAY_EXTENSIONS, openFile } from './packetsReplay/replayPackets'
import { getFixedFilesize } from './downloadAndOpenFile'
import { packetsReplayState } from './react/state/packetsReplayState'
import { createFullScreenProgressReporter } from './core/progressReporter'
import { showNotification } from './react/NotificationProvider'
import { resetAppStorage } from './react/appStorageProvider'
const { GoogleDriveFileSystem } = require('google-drive-browserfs/src/backends/GoogleDrive')

browserfs.install(window)
const defaultMountablePoints = {
  '/data': { fs: 'IndexedDB' },
  '/resourcepack': { fs: 'InMemory' }, // temporary storage for currently loaded resource pack
  '/temp': { fs: 'InMemory' }
}
const fallbackMountablePoints = {
  '/resourcepack': { fs: 'InMemory' }, // temporary storage for downloaded server resource pack
  '/temp': { fs: 'InMemory' }
}
browserfs.configure({
  fs: 'MountableFileSystem',
  options: defaultMountablePoints,
}, async (e) => {
  if (e) {
    browserfs.configure({
      fs: 'MountableFileSystem',
      options: fallbackMountablePoints,
    }, async (e2) => {
      if (e2) {
        showNotification('Unknown FS error, cannot continue', e2.message, true)
        throw e2
      }
      showNotification('Failed to access device storage', `Check you have free space. ${e.message}`, true)
      miscUiState.fsReady = true
      miscUiState.singleplayerAvailable = false
    })
    return
  }
  await updateTexturePackInstalledState()
  miscUiState.fsReady = true
  miscUiState.singleplayerAvailable = true
})

export const copyFilesAsyncWithProgress = async (pathSrc: string, pathDest: string, throwRootNotExist = true, addMsg = '') => {
  const stat = await existsViaStats(pathSrc)
  if (!stat) {
    if (throwRootNotExist) throw new Error(`Cannot copy. Source directory ${pathSrc} does not exist`)
    console.debug('source directory does not exist', pathSrc)
    return
  }
  if (!stat.isDirectory()) {
    await fs.promises.writeFile(pathDest, await fs.promises.readFile(pathSrc) as any)
    console.debug('copied single file', pathSrc, pathDest)
    return
  }

  try {
    setLoadingScreenStatus('Copying files')
    let filesCount = 0
    const countFiles = async (path: string) => {
      const files = await fs.promises.readdir(path)
      await Promise.all(files.map(async (file) => {
        const curPath = join(path, file)
        const stats = await fs.promises.stat(curPath)
        if (stats.isDirectory()) {
          // Recurse
          await countFiles(curPath)
        } else {
          filesCount++
        }
      }))
    }
    console.debug('Counting files', pathSrc)
    await countFiles(pathSrc)
    console.debug('counted', filesCount)
    let copied = 0
    await copyFilesAsync(pathSrc, pathDest, (name) => {
      copied++
      setLoadingScreenStatus(`Copying files${addMsg} (${copied}/${filesCount}): ${name}`)
    })
  } finally {
    setLoadingScreenStatus(undefined)
  }
}

export const openWorldFromHttpDir = async (fileDescriptorUrls: string[]/*  | undefined */, baseUrlParam) => {
  // todo try go guess mode
  let indexFileUrl
  let index
  let baseUrl
  for (const url of fileDescriptorUrls) {
    let file
    try {
      setLoadingScreenStatus(`Trying to get world descriptor from ${new URL(url).host}`)
      const controller = new AbortController()
      setTimeout(() => {
        controller.abort()
      }, 3000)
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url, { signal: controller.signal })
      // eslint-disable-next-line no-await-in-loop
      file = await response.json()
    } catch (err) {
      console.error('Error fetching file descriptor', url, err)
    }
    if (!file) continue
    if (file.baseUrl) {
      baseUrl = new URL(file.baseUrl, baseUrl).toString()
      index = file.index
    } else {
      index = file
      baseUrl = baseUrlParam ?? url.split('/').slice(0, -1).join('/')
    }
    indexFileUrl = url
    break
  }
  if (!index) throw new Error(`The provided mapDir file is not valid descriptor file! ${fileDescriptorUrls.join(', ')}`)

  fsState.saveLoaded = false
  fsState.isReadonly = true
  fsState.syncFs = false
  fsState.inMemorySave = false
  fsState.remoteBackend = true
  fsState.usingIndexFileUrl = indexFileUrl
  fsState.remoteBackendBaseUrl = baseUrl

  await mountRemoteFsBackend(fsState)

  await loadSave()
}

const openWorldZipInner = async (file: File | ArrayBuffer, name = file['name']) => {
  // await new Promise<void>(async resolve => {
  //   browserfs.configure({
  //     // todo
  //     fs: 'MountableFileSystem',
  //     options: {
  //       ...defaultMountablePoints,
  //       '/world': {
  //         fs: 'ZipFS',
  //         options: {
  //           zipData: Buffer.from(file instanceof File ? (await file.arrayBuffer()) : file),
  //           name
  //         }
  //       }
  //     },
  //   }, (e) => {
  //     if (e) throw e
  //     resolve()
  //   })
  // })

  fsState.saveLoaded = false
  fsState.isReadonly = true
  fsState.syncFs = true
  fsState.inMemorySave = false
  fsState.remoteBackend = false

  if (fs.existsSync('/world/level.dat')) {
    await loadSave()
  } else {
    const dirs = fs.readdirSync('/world')
    const availableWorlds: string[] = []
    for (const dir of dirs) {
      if (fs.existsSync(`/world/${dir}/level.dat`)) {
        availableWorlds.push(dir)
      }
    }

    if (availableWorlds.length === 0) {
      if (await tryToDetectResourcePack()) return
      alert('No worlds found in the zip')
      return
    }

    if (availableWorlds.length === 1) {
      await loadSave(`/world/${availableWorlds[0]}`)
      return
    }

    alert(`Many (${availableWorlds.length}) worlds found in the zip!`)
    // todo prompt picker
    // const selectWorld
  }
}

export const openWorldZip = async (...args: Parameters<typeof openWorldZipInner>) => {
  try {
    return await openWorldZipInner(...args)
  } finally {
    // possiblyCleanHandle()
  }
}

export const resetLocalStorage = () => {
  resetOptions()
  resetAppStorage()
}

window.resetLocalStorage = resetLocalStorage

export const openFilePicker = (specificCase?: 'resourcepack') => {
  // create and show input picker
  let picker: HTMLInputElement = document.body.querySelector('input#file-zip-picker')!
  if (!picker) {
    picker = document.createElement('input')
    picker.type = 'file'
    picker.accept = specificCase ? '.zip' : [...VALID_REPLAY_EXTENSIONS, '.zip'].join(',')

    picker.addEventListener('change', () => {
      const file = picker.files?.[0]
      picker.value = ''
      if (!file) return
      if (specificCase === 'resourcepack') {
        if (!file.name.endsWith('.zip')) {
          const doContinue = confirm(`Are you sure ${file.name.slice(-20)} is .zip file? ONLY .zip files are supported. Continue?`)
          if (!doContinue) return
        }
        void installResourcepackPack(file, createFullScreenProgressReporter()).catch((err) => {
          setLoadingScreenStatus(err.message, true)
        })
      } else {
        // eslint-disable-next-line no-lonely-if
        if (VALID_REPLAY_EXTENSIONS.some(ext => file.name.endsWith(ext)) || file.name.startsWith('packets-replay')) {
          void file.text().then(contents => {
            openFile({
              contents,
              filename: file.name,
              filesize: file.size
            })
          })
        } else {
          void openWorldZip(file)
        }
      }
    })
    picker.hidden = true
    document.body.appendChild(picker)
  }

  picker.click()
}

const tryToDetectResourcePack = async () => {
  const askInstall = async () => {
    // todo investigate browserfs read errors
    return alert('ATM You can install texturepacks only via options menu.')
    // if (confirm('Resource pack detected, do you want to install it?')) {
    //   await installTexturePackFromHandle()
    // }
  }

  if (fs.existsSync('/world/pack.mcmeta')) {
    await askInstall()
    return true
  }
  // const jszip = new JSZip()
  // let loaded = await jszip.loadAsync(file)
  // if (loaded.file('pack.mcmeta')) {
  //   loaded = null
  //   askInstall()
  //   return true
  // }
  // loaded = null
}


const SUPPORT_WRITE = true

export const openWorldDirectory = async (dragndropHandle?: FileSystemDirectoryHandle) => {
  //   let _directoryHandle: FileSystemDirectoryHandle
  //   if (dragndropHandle) {
  //     _directoryHandle = dragndropHandle
  //   } else {
  //     try {
  //       _directoryHandle = await window.showDirectoryPicker({
  //         id: 'select-world', // important: this is used to remember user choice (start directory)
  //       })
  //     } catch (err) {
  //       if (err instanceof DOMException && err.name === 'AbortError') return
  //       throw err
  //     }
  //   }
  //   const directoryHandle = _directoryHandle

  //   const requestResult = SUPPORT_WRITE && !options.preferLoadReadonly ? await directoryHandle.requestPermission?.({ mode: 'readwrite' }) : undefined
  //   const writeAccess = requestResult === 'granted'

  //   const doContinue = writeAccess || !SUPPORT_WRITE || options.disableLoadPrompts || confirm('Continue in readonly mode?')
  //   if (!doContinue) return
  //   await new Promise<void>(resolve => {
  //     browserfs.configure({
  //       fs: 'MountableFileSystem',
  //       options: {
  //         ...defaultMountablePoints,
  //         '/world': {
  //           fs: 'FileSystemAccess',
  //           options: {
  //             handle: directoryHandle
  //           }
  //         }
  //       },
  //     }, (e) => {
  //       if (e) throw e
  //       resolve()
  //     })
  //   })

  //   localFsState.isReadonly = !writeAccess
  //   localFsState.syncFs = false
  //   localFsState.inMemorySave = false
  //   localFsState.remoteBackend = false
  //   await loadSave()
}
