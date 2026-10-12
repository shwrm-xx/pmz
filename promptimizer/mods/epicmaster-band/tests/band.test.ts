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

type FileBox = { text: string | null; global?: Record<string, string> }
const GDIR = '/home/u/.claude/promptimizer/epicmaster-live'

// Le fichier live tel que le test le sert à $.fs.read (null = absent) ; `global` = copies de
// projet sous <config>/promptimizer/epicmaster-live/ (nom -> contenu), listées par $.fs.list.
function serve(on: On, box: FileBox) {
  on('fs.read', ($, e) => {
    const p = String(e.path)
    if (box.global && p.startsWith(GDIR + '/') && box.global[p.slice(GDIR.length + 1)] !== undefined) {
      return { value: box.global[p.slice(GDIR.length + 1)] } as never
    }
    if (box.text === null || !p.endsWith('.vibe-agent/epicmaster-live.json')) {
      throw new Error('ENOENT')
    }
    return { value: box.text } as never // un hook sous un appel $ répond { value }
  })
  on('fs.list', ($, e) => {
    if (String(e.path) !== GDIR || !box.global) throw new Error('ENOENT')
    return { value: Object.keys(box.global).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) } as never
  })
  mock.env(on, { HOME: '/home/u' })
  bottom(on)
  mockClock = mock.clock(on, { now: NOW })
}
// La bande est celle de la session qui a saisi /epicmaster : les tests l'arment d'abord.
const arm = ($: { prompt: { submit: (e: { text: string }) => Promise<unknown> } }) => $.prompt.submit({ text: '/epicmaster' })
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

// Plan semé avec vagues (wave_plan + wave/scope par lot, comme lib/epicmaster-live.js seedFromPlan).
function waved() {
  return JSON.stringify({
    v: 1, updated_at: iso(1), epic: 'Multi', wave: { current: 2, total: 3 }, finished: false, to_decide: [],
    wave_plan: [
      { index: 1, ids: [9], parallel: false, label: 'Socle' },
      { index: 2, ids: [10, 11], parallel: true, label: 'Providers' },
      { index: 3, ids: [12], parallel: false, label: 'Page web' },
    ],
    lots: {
      9: { id: 9, title: 'Socle', status: 'done', wave: 1, started_at: iso(40), done_at: iso(20) },
      10: { id: 10, title: 'Registre', status: 'running', wave: 2, model: 'opus', effort: 'high', started_at: iso(12), updated_at: iso(1), scope: 'registre testé' },
      11: { id: 11, title: 'TheFork', status: 'pending', wave: 2 },
      12: { id: 12, title: 'Page', status: 'pending', wave: 3, depends_on: [10, 11] },
    },
    agents: {},
  })
}

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
    await arm($)
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
    await arm($)
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
    await arm($)
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
    await arm($)
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
    await arm($)
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

  test('immédiat : /epicmaster affiche la bande avant tout fichier live, et sans lui rien avant', async ($, on) => {
    serve(on, { text: null })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await text(ui, /plan en préparation/)).toBeUndefined()
      // (pas d'arm ici : c'est l'objet du test)
      await ui.unmount()
    }
    await $.prompt.submit({ text: '/epicmaster' })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await text(ui, /^◆ epicmaster · plan en préparation… $/)).toBeDefined()
      await ui.unmount()
    }
  })

  test('critère 2 : la bande suit le fichier live sans action utilisateur', async ($, on) => {
    const box: FileBox = { text: live() }
    serve(on, box)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await arm($)
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
  test('desktop : session démarrée sans surface (app desktop), la bande suit quand même le fichier', async ($, on) => {
    const box: FileBox = { text: live() }
    serve(on, box)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await arm($)
    await $.session.start({ cwd: '/projet', surface: null, isInteractive: false })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await text(ui, /^ ✓2 ⟳1 ⧗1$/)).toBeDefined()
    box.text = live({ updated_at: iso(0) }, {
      135: { id: 135, title: 'Spec', status: 'done' },
      136: { id: 136, title: 'Fichier live', status: 'done' },
      137: { id: 137, title: 'Bande', status: 'done' },
      138: { id: 138, title: 'Install', status: 'running', started_at: iso(0), updated_at: iso(0) },
    })
    await mockClock.advance(2500)
    expect(await text(ui, /^ ✓3 ⟳1 ⧗0$/)).toBeDefined()
    await ui.unmount()
  })
  test('lot #142 : fichier du vrai writer — vague, à trancher, verify rouge, tokens', async ($, on) => {
    serve(on, { text: REAL_WRITER })
    await arm($)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await text(ui, /◆ Plan · vague 2\/2/)).toBeDefined()
      expect(await text(ui, /^ ✓1 ⟳1 ⧗1$/)).toBeDefined()
      const red = await text(ui, /1 ✗ verify rouge #2/)
      expect(red?.props.color).toBe('error')
      await ui.unmount()
    }
  })
  test('une bande par session : sans /epicmaster saisi dans la session, rien (même avec un fichier live)', async ($, on) => {
    serve(on, { text: live() })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ key: 'em-line' })).toBeUndefined()
      expect(await ui.find(ENGINE)).toBeDefined()
      await ui.unmount()
    }
  })

  test('/epicband : force la bande sans /epicmaster, plan semé avant compris ; /epicband off la retire', async ($, on) => {
    serve(on, { text: live({ seeded_at: iso(30) }) })
    const out = await $.command.run({ command: 'epicband' })
    expect(out.text).toMatch(/Bande epicmaster affichée · Bande epicmaster/)
    let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ key: 'em-line' })).toBeDefined()
    await ui.unmount()
    const off = await $.command.run({ command: 'epicband', args: 'off' })
    expect(off.text).toMatch(/masquée/)
    ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ key: 'em-line' })).toBeUndefined()
    expect(await ui.find(ENGINE)).toBeDefined()
    await ui.unmount()
  })

  test('/epicband : sans fichier local, prend la copie de projet la plus récente ; rien -> message, attente', async ($, on) => {
    const box: FileBox = { text: null, global: {} }
    serve(on, box)
    const none = await $.command.run({ command: 'epicband' })
    expect(none.text).toMatch(/Aucun plan epicmaster actif/)
    let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await text(ui, /aucun plan actif, en attente/)).toBeDefined()
    await ui.unmount()
    box.global!['vieux-aaaa.json'] = live({ epic: 'Ancien', seeded_at: iso(90) })
    box.global!['recent-bbbb.json'] = live({ epic: 'Récent', seeded_at: iso(40) })
    await $.command.run({ command: 'epicband' })
    ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await text(ui, /◆ Récent/)).toBeDefined()
    await ui.unmount()
  })

  test('plan local semé AVANT le /epicmaster de la session -> ignoré', async ($, on) => {
    serve(on, { text: live({ seeded_at: iso(30) }) })
    await arm($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ key: 'em-line' })).toBeUndefined()
    expect(await text(ui, /plan en préparation/)).toBeDefined()
    await ui.unmount()
  })

  test('copie de projet : seule celle semée après le /epicmaster de la session, puis retenue', async ($, on) => {
    const box: FileBox = {
      text: null,
      global: {
        'cocina-aaaa.json': live({ epic: 'Autre projet', seeded_at: iso(20) }), // semée avant : autre session
      },
    }
    serve(on, box)
    await arm($)
    let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await text(ui, /Autre projet/)).toBeUndefined()
    await ui.unmount()
    box.global!['promptimiser-bbbb.json'] = live({ epic: 'Mon projet', seeded_at: iso(0), updated_at: iso(0) })
    ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await text(ui, /◆ Mon projet/)).toBeDefined()
    await ui.unmount()
    // un autre projet sème ensuite : la session garde le sien
    await mockClock.advance(60000)
    box.global!['cocina-aaaa.json'] = live({ epic: 'Autre projet', seeded_at: new Date(NOW + 30000).toISOString(), updated_at: new Date(NOW + 30000).toISOString() })
    ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await text(ui, /◆ Mon projet/)).toBeDefined()
    expect(await text(ui, /Autre projet/)).toBeUndefined()
    await ui.unmount()
  })
  test('vagues : barre groupée, détail « Vague N (#ids) · libellé », lots en vol sous la vague en cours', async ($, on) => {
    serve(on, { text: waved() })
    await arm($)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await text(ui, /◆ Multi · vague 2\/3/)).toBeDefined()
      expect(await text(ui, /^■ ■□ □$/)).toBeDefined() // une espace entre deux vagues
      await ui.press(toggle)
      expect((await text(ui, /^ {2}✓ Vague 1 \(#9\) · Socle$/))?.props.color).toBe('success')
      expect((await text(ui, /^ {2}⟳ Vague 2 \(#10, #11\) · Providers · 12 min$/))?.props.color).toBe('warning')
      expect(await text(ui, /^ {6}⟳ #10 Registre · opus·high · 12 min/)).toBeDefined()
      expect(await text(ui, /^ {2}⧗ Vague 3 \(#12\) · Page web$/)).toBeDefined()
      expect(await text(ui, /^ {2}⧗ #12/)).toBeUndefined() // plus de ligne par lot en attente
      await ui.press(toggle) // replié pour la surface suivante (état de session)
      await ui.unmount()
    }
  })

  test('bouton Plan : à gauche de Détails, ouvre le panneau du plan complet', async ($, on) => {
    serve(on, { text: waved() })
    const opened: string[] = []
    on('ui.open', ($, e) => { opened.push(String(e.id)); return { value: { isPlaced: true } } as never })
    await arm($)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const all = (await ui.findAll({ type: 'Button' })).map(b => b.props.label)
      expect(all).toEqual(['Plan', 'Détails'])
      await ui.press({ key: 'em-plan' })
      await ui.unmount()
    }
    expect(opened).toEqual(['epicmaster-plan', 'epicmaster-plan'])
    const pane = await $.ui.mount({
      plugin: 'epicmaster-band', surface: 'desktop', component: 'Pane', requestId: 'epicmaster-plan',
      props: { title: 'Plan', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } } as never,
    })
    const md = String((await pane.find({ key: 'em-plan-md' }))?.props.text)
    expect(md).toContain('### ⟳ Vague 2 — Providers')
    expect(md).toContain('**#10 Registre** — `opus · high` · en cours')
    expect(md).toContain('Fait quand : registre testé')
    await pane.unmount()
  })
})
