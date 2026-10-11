// Tests de la bande epicmaster (US-137, critères 1, 2, 3, 4, 5, 6) sur terminal et desktop.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-09T12:00:00.000Z')
const iso = (minAgo: number) => new Date(NOW - minAgo * 60000).toISOString()
const SURFACES = ['terminal', 'desktop'] as const
const PROPS = {
  hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 11 }, view: {},
}
const BAND = { plugin: 'epicmaster-band', component: 'AbovePrompt', props: PROPS } as const

type FileBox = { text: string | null }

// Le fichier live tel que le test le sert à $.fs.read (null = absent).
function serve(on: On, box: FileBox) {
  on('fs.read', ($, e) => {
    if (box.text === null || !String(e.path).endsWith('.vibe-agent/epicmaster-live.json')) {
      throw new Error('ENOENT')
    }
    return { value: box.text } as never // un hook sous un appel $ répond { value }
  })
  bottom(on)
  mockClock = mock.clock(on, { now: NOW })
}
let mockClock: ReturnType<typeof mock.clock>

// Ce que le moteur ferait sous les plugins : la saisie passe, la bande reste vide.
function bottom(on: On) {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e as never) as { Box: unknown }
    return h(Box as never, { key: 'engine-band' }) as never
  })
}

function live(over: Record<string, unknown> = {}, lots?: Record<string, unknown>) {
  return JSON.stringify({
    v: 1, updated_at: iso(1), epic: 'Bande epicmaster', wave: 2, waves: 3, to_decide: 2,
    lots: lots ?? {
      135: { id: 135, title: 'Spec', status: 'done', started_at: iso(50), done_at: iso(30) },
      136: { id: 136, title: 'Fichier live', status: 'done', started_at: iso(40), done_at: iso(20) },
      137: { id: 137, title: 'Bande', status: 'running', started_at: iso(12), updated_at: iso(1), model: 'opus', effort: 'high', tokens: 21000 },
      138: { id: 138, title: 'Install', status: 'pending', depends_on: [137] },
    },
    agents: {},
    ...over,
  })
}

// Fichier produit par le VRAI writer (lib/epicmaster-live.js : seedFromPlan + recordStart/Done/Note
// --decide, tokens réels) — régénéré par un script bac à sable, pas écrit à la main (lot #142).
const REAL_WRITER = `{"v":1,"updated_at":"2026-10-09T11:55:00.000Z","lots":{"1":{"id":1,"title":"Spec","status":"done","wave":1,"model":"sonnet","effort":"low","tokens":33000,"tokens_basis":"measured","depends_on":[],"started_at":"2026-10-09T11:10:00.000Z","done_at":"2026-10-09T11:20:00.000Z","updated_at":"2026-10-09T11:20:00.000Z","owner":"master/lot-1","verify":"ok"},"2":{"id":2,"title":"Fichier","status":"failed","wave":1,"model":"opus","effort":"high","tokens":41000,"tokens_basis":"measured","depends_on":[],"started_at":"2026-10-09T11:10:00.000Z","done_at":"2026-10-09T11:35:00.000Z","updated_at":"2026-10-09T11:35:00.000Z","owner":"master/lot-2","note":"verify rouge : test X","verify":"failed"},"3":{"id":3,"title":"Bande","status":"running","wave":2,"model":"sonnet","effort":"medium","tokens":60000,"tokens_basis":"base","depends_on":[1],"started_at":"2026-10-09T11:55:00.000Z","done_at":null,"updated_at":"2026-10-09T11:55:00.000Z","owner":"master/lot-3"},"4":{"id":4,"title":"Doc","status":"pending","wave":2,"model":"haiku","effort":"low","tokens":60000,"tokens_basis":"base","depends_on":[1],"started_at":null,"done_at":null,"updated_at":"2026-10-09T11:00:00.000Z"}},"agents":{},"epic":"Plan","wave":{"current":2,"total":2},"finished":false,"to_decide":[{"id":2,"title":"Fichier","reason":"verify rouge : test X"}]}`

const ENGINE = { key: 'engine-band' } // ce que dessine le moteur quand la bande passe la main
const toggle = { key: 'em-toggle' }
type UI = {
  find: (q: { type?: string; key?: string; text?: string | RegExp }) => Promise<{ text: string; props: Record<string, unknown> } | undefined>
  findAll: (q: { type?: string; key?: string; text?: string | RegExp }) => Promise<{ text: string; props: Record<string, unknown> }[]>
}
const text = async (ui: UI, re: RegExp) => (await ui.find({ type: 'Text', text: re }))
const segments = async (ui: UI) => (await ui.findAll({ type: 'Text', text: /^[■□]$/ }))

describe('bande epicmaster', () => {
  test('critère 1 : une ligne compacte (epic, vague, barre, compteurs)', async ($, on) => {
    serve(on, { text: live() })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect((await ui.find({ key: 'em-line' }))).toBeDefined()
      expect(await text(ui, /◆ Bande epicmaster · vague 2\/3/)).toBeDefined()
      const segs = await segments(ui)
      expect(segs.map(x => x.props.color)).toEqual(['success', 'success', 'warning', 'inactive'])
      expect(await text(ui, /^ ✓2 ⟳1 ⧗1$/)).toBeDefined()
      expect(await text(ui, /verify rouge/)).toBeUndefined()
      expect((await ui.find(toggle))?.props.label).toBe('Détails')
      expect(await text(ui, /#137 Bande/)).toBeUndefined()
      expect(await ui.find(ENGINE)).toBeUndefined()
      await ui.unmount()
    }
  })

  test('critère 3 : verify rouge en couleur danger avec son id', async ($, on) => {
    serve(on, {
      text: live({}, {
        41: { id: 41, title: 'A', status: 'running', started_at: iso(5), updated_at: iso(1) },
        42: { id: 42, title: 'B', status: 'done', verify: 'failed', started_at: iso(9) },
      }),
    })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const red = await text(ui, /1 ✗ verify rouge #42/)
      expect(red?.props.color).toBe('error')
      expect((await segments(ui)).map(x => x.props.color)).toEqual(['warning', 'error'])
      await ui.unmount()
    }
  })

  test('critère 4 : Détails déplie (lots en vol + en attente), Masquer replie', async ($, on) => {
    serve(on, { text: live() })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      await ui.press(toggle)
      expect(await text(ui, /⟳ #137 Bande · opus·high · 12 min · ~21k tokens/)).toBeDefined()
      expect(await text(ui, /⧗ #138 Install · attend #137/)).toBeDefined()
      expect(await text(ui, /#135 Spec/)).toBeUndefined() // un lot fait n'a pas de ligne
      expect((await ui.find(toggle))?.props.label).toBe('Masquer')
      await ui.press(toggle)
      expect(await text(ui, /#137 Bande/)).toBeUndefined()
      expect((await ui.find(toggle))?.props.label).toBe('Détails')
      await ui.unmount()
    }
  })

  test('critère 5 : absent, illisible, invalide ou périmé -> rien, sans erreur', async ($, on) => {
    const box: FileBox = { text: null }
    serve(on, box)
    const cases: (string | null)[] = [
      null,
      '{ pas du json',
      '[]',
      JSON.stringify({ v: 1, lots: 'x' }),
      JSON.stringify({ v: 1, lots: {} }),
      live({}, { 9: { id: 9, title: 'Z', status: 'running', started_at: iso(500), updated_at: iso(400) } }),
      live({ updated_at: iso(7 * 60) }), // > 6 h : session maître éteinte
    ]
    for (const surface of SURFACES) {
      for (const t of cases) {
        box.text = t
        const ui = await $.ui.mount({ ...BAND, surface })
        expect(await ui.find(ENGINE)).toBeDefined()
        expect(await ui.find({ key: 'em-line' })).toBeUndefined()
        expect(await ui.find(toggle)).toBeUndefined()
        await ui.unmount()
      }
    }
  })

  test('critère 6 : plan terminé -> récap, puis disparaît à la saisie suivante', async ($, on) => {
    serve(on, {
      text: live({}, {
        1: { id: 1, title: 'A', status: 'done', started_at: iso(30) },
        2: { id: 2, title: 'B', status: 'done', started_at: iso(20) },
        3: { id: 3, title: 'C', status: 'done', started_at: iso(10) },
      }),
    })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await text(ui, /^◆ epicmaster terminé · 3\/3 ✓ · 2 à trancher$/)).toBeDefined()
      expect(await ui.find(toggle)).toBeUndefined()
      await ui.unmount()
    }
    await $.prompt.submit({ text: 'suite' })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await text(ui, /epicmaster terminé/)).toBeUndefined()
      expect(await ui.find(ENGINE)).toBeDefined()
      await ui.unmount()
    }
  })

  test('critère 2 : la bande suit le fichier live sans action utilisateur', async ($, on) => {
    const box: FileBox = { text: live() }
    serve(on, box)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/projet', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await text(ui, /^ ✓2 ⟳1 ⧗1$/)).toBeDefined()
    box.text = live({ updated_at: iso(0) }, {
      135: { id: 135, title: 'Spec', status: 'done' },
      136: { id: 136, title: 'Fichier live', status: 'done' },
      137: { id: 137, title: 'Bande', status: 'done' },
      138: { id: 138, title: 'Install', status: 'running', started_at: iso(0), updated_at: iso(0) },
    })
    expect(await text(ui, /^ ✓2 ⟳1 ⧗1$/)).toBeDefined() // pas encore sondé
    await mockClock.advance(2500)
    expect(await text(ui, /^ ✓3 ⟳1 ⧗0$/)).toBeDefined()
    await ui.unmount()
  })
  test('lot #142 : fichier du vrai writer — vague, à trancher, verify rouge, tokens', async ($, on) => {
    serve(on, { text: REAL_WRITER })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await text(ui, /◆ Plan · vague 2\/2/)).toBeDefined()
      expect(await text(ui, /^ ✓1 ⟳1 ⧗1$/)).toBeDefined()
      const red = await text(ui, /1 ✗ verify rouge #2/)
      expect(red?.props.color).toBe('error')
      await ui.unmount()
    }
  })
})
