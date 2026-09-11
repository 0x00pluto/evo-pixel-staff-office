import Phaser from 'phaser'
import type { AgentPersona } from '../catalog/types'
import { OfficeScene } from './OfficeScene'
import type { OfficeGameCallbacks, OfficeGameHandle } from './types'

export function createOfficeGame(
  parent: HTMLElement,
  agents: AgentPersona[],
  callbacks: OfficeGameCallbacks,
): OfficeGameHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || window.innerWidth,
    height: parent.clientHeight || Math.max(window.innerHeight - 40, 400),
    backgroundColor: '#1B2A41',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  })

  game.scene.add('OfficeScene', OfficeScene, true, { agents, callbacks })

  if (import.meta.env.DEV) {
    ;(window as unknown as { __officeGame?: Phaser.Game }).__officeGame = game
  }

  const onResize = () => {
    game.scale.resize(
      parent.clientWidth || window.innerWidth,
      parent.clientHeight || Math.max(window.innerHeight - 40, 400),
    )
  }
  window.addEventListener('resize', onResize)

  return {
    destroy: () => {
      window.removeEventListener('resize', onResize)
      game.destroy(true)
    },
    reloadAgents: (next) => {
      const scene = game.scene.getScene('OfficeScene') as OfficeScene | null
      scene?.reloadAgents(next)
    },
  }
}
