// Tests de la fin de plan (US-179) sur terminal et desktop.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { APPROVE, QUESTION, SCOPE, denyRevise, denyScope } from '../hooks/plan-scope'

const SURFACES = ['terminal', 'desktop'] as const
const PLAN = '/home/u/.claude/plans/p.md'

type Box = { pmz: boolean; asked: number; answer: string | Error; nexted: number }
function setup(on: On, box: Box) {
  on('fs.read', () => {
    if (!box.pmz) throw new Error('ENOENT')
    return { value: '{}' } as never
  })
  on('ui.ask', () => {
    box.asked++
    if (box.answer instanceof Error) throw box.answer
    return { value: box.answer } as never
  })
  mock.env(on, { HOME: '/home/u' })
}
const attach = ($: any, planFilePath: string) =>
  $.prompt.attach?.({ type: 'plan_mode', detail: { planFilePath } })

describe('fin de plan', () => {
  test('libellés exacts', () => {
    expect([QUESTION, SCOPE, APPROVE]).toEqual(["Plan prêt : le découper en US avec Scope, ou l'approuver ?", 'Scope (recommandé)', 'Approuver le plan'])
    expect(denyScope(PLAN)).toContain(`--plan ${PLAN}`)
    expect(denyRevise('x')).toContain('révision du plan : x')
  })
  for (const surface of SURFACES) {
    test(`${surface} : hors PMZ ou sans planFile -> next, aucune question`, async ($, on) => {
      const box: Box = { pmz: false, asked: 0, answer: SCOPE, nexted: 0 }
      setup(on, box)
      await attach($, PLAN)
      const out = await $.tool.call({ tool: 'ExitPlanMode' } as never)
      expect(box.asked).toBe(0)
      expect((out as { deny?: string }).deny).toBeUndefined()
    }, { surface })
    test(`${surface} : Scope -> deny avec --plan, Approuver -> next, rejet -> next`, async ($, on) => {
      const box: Box = { pmz: true, asked: 0, answer: SCOPE, nexted: 0 }
      setup(on, box)
      await attach($, PLAN)
      const a = await $.tool.call({ tool: 'ExitPlanMode' } as never)
      expect((a as { deny?: string }).deny).toContain(`--plan ${PLAN}`)
      box.answer = APPROVE
      expect((await $.tool.call({ tool: 'ExitPlanMode' } as never) as { deny?: string }).deny).toBeUndefined()
      box.answer = new Error('closed')
      expect((await $.tool.call({ tool: 'ExitPlanMode' } as never) as { deny?: string }).deny).toBeUndefined()
      box.answer = 'plus court'
      expect((await $.tool.call({ tool: 'ExitPlanMode' } as never) as { deny?: string }).deny).toContain('plus court')
    }, { surface })
  }
})
