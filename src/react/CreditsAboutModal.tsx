import { hideCurrentModal } from '../globalState'
import { useIsModalActive } from './utilsApp'
import Button from './Button'
import Screen from './Screen'
import PixelartIcon, { pixelartIcons } from './PixelartIcon'

export default () => {
  const isModalActive = useIsModalActive('credits-about')

  if (!isModalActive) return null

  return (
    <Screen
      title=""
      backdrop
      style={{
        marginTop: '-15px',
      }}>
      <div style={{
        position: 'relative',
        backgroundColor: '#C2B089',
        border: '5px solid #7A5C3E',
        padding: '15px',
        width: '80%',
        margin: '0 auto',
        color: '#3F2A14',
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
        maxHeight: '70vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ textAlign: 'center', marginTop: 0, marginBottom: '0', fontSize: '8px' }}>Minecraft Open Source Edition</h2>

        <div style={{ marginBottom: '5px' }}>
          <small style={{ fontSize: '6px', marginBottom: '4px', fontStyle: 'italic' }}><i>What if Minecraft was an online game?</i></small>
          <p style={{ fontSize: '6px', marginBottom: '4px' }}>
            Hey! You are on the safest and fast modern Minecraft clone rewritten in JS. A huge work was done in the project, however many features would not be possible without these awesome projects:
          </p>
          <ul style={{ listStyleType: 'none', padding: 0, fontSize: '6px' }}>
            <li style={{ marginBottom: '2px' }}>- Everyone who provided awesome mods for the game</li>
            <li style={{ marginBottom: '2px' }}>- <span style={{ color: '#0000AA' }}><a style={{ color: '#0000AA', textDecoration: 'none' }} href="https://discord.com/users/gen6442" target="_blank" rel="noopener noreferrer">[Gen]</a></span> for rewriting the physics engine to be Grim-compliant</li>
            <li style={{ marginBottom: '2px' }}>- <span style={{ color: '#0000AA' }}><a style={{ color: '#0000AA', textDecoration: 'none' }} href="https://viaversion.com/" target="_blank" rel="noopener noreferrer">[ViaVersion]</a></span> for providing reliable sound id mappings</li>
            <li style={{ marginBottom: '2px' }}>- <span style={{ color: '#0000AA' }}><a style={{ color: '#0000AA', textDecoration: 'none' }} href="https://github.com/BlueMap-Minecraft/BlueMap" target="_blank" rel="noopener noreferrer">[Bluemap]</a></span> for providing block entity models like chest</li>
            <li style={{ marginBottom: '2px' }}>- <span style={{ color: '#0000AA' }}><a style={{ color: '#0000AA', textDecoration: 'none' }} href="https://github.com/misode/deepslate" target="_blank" rel="noopener noreferrer">[Deepslate]</a></span> for rendering 3d blocks in GUI (inventory)</li>
            <li style={{ marginBottom: '2px' }}>- <span style={{ color: '#0000AA' }}><a style={{ color: '#0000AA', textDecoration: 'none' }} href="https://www.npmjs.com/package/skinview3d" target="_blank" rel="noopener noreferrer">[skinview3d]</a></span> for rendering skins & player geometry</li>
            <li style={{ marginBottom: '2px' }}>- <span style={{ color: '#0000AA' }}><a style={{ color: '#0000AA', textDecoration: 'none' }} href="https://github.com/atxi/Polymer" target="_blank" rel="noopener noreferrer">[Polymer]</a></span> (c++ project) for providing fast & accurate server light implementation</li>
          </ul>

          <h3 style={{ marginTop: '7px', marginBottom: '5px', fontSize: '8px' }}>Major contributors:</h3>
          <ul style={{ listStyleType: 'none', padding: 0, fontSize: '6px' }}>
            <li style={{ marginBottom: '2px' }}>- <span style={{ color: '#0000AA' }}>Zartrix</span> - Development Lead</li>
            <li style={{ marginBottom: '2px' }}>- <span style={{ color: '#0000AA' }}>PrismarineJS</span> - Core Libraries</li>
            <li style={{ marginBottom: '2px' }}>- <span style={{ color: '#0000AA' }}>MinecraftJS</span> - Rendering Engine</li>
            <li>- And many more community contributors!</li>
          </ul>

          <div style={{ position: 'absolute', top: '1px', right: '1px', display: 'flex', justifyContent: 'center' }}>
            <div
              style={{ cursor: 'pointer', padding: '5px' }}
              onClick={() => hideCurrentModal()}
            >
              <PixelartIcon
                iconName={pixelartIcons.close}
                width={12}
                styles={{ color: '#3F2A14' }}
              />
            </div>
          </div>
        </div>
      </div>


    </Screen>
  )
}
