import EventEmitter from 'events'

window.reportError = window.reportError ?? console.error
window.bot = undefined
window.following = undefined
window.THREE = undefined
window.localServer = undefined
window.worldView = undefined
window.viewer = undefined
window.loadedData = undefined
window.customEvents = new EventEmitter()
window.agentSkinMap = new Map() // Map of username -> skin URL for custom agent skins
