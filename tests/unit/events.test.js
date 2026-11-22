import { describe, expect, it } from 'vitest';
import { EVT, clearEvents, createEvents, pushEvent } from '../../src/core/events.js';

describe('createEvents', () => {
  it('préalloue `capacity` objets distincts, file vide', () => {
    const events = createEvents(4);
    expect(events.count).toBe(0);
    expect(events.dropped).toBe(0);
    expect(events.items).toHaveLength(4);
    expect(new Set(events.items).size).toBe(4);
    for (const item of events.items) expect(item).toEqual({ type: 0, x: 0, y: 0, a: 0, b: 0 });
  });
});

describe('pushEvent', () => {
  it('remplit tous les champs du premier slot libre', () => {
    const events = createEvents(4);
    pushEvent(events, EVT.EXPLOSION, 10.5, -3, 7, 9);
    expect(events.count).toBe(1);
    expect(events.items[0]).toEqual({ type: EVT.EXPLOSION, x: 10.5, y: -3, a: 7, b: 9 });
  });

  it('a et b valent 0 par défaut', () => {
    const events = createEvents(2);
    pushEvent(events, EVT.SHOT, 1, 2);
    expect(events.items[0]).toEqual({ type: EVT.SHOT, x: 1, y: 2, a: 0, b: 0 });
  });

  it('range les événements dans l’ordre d’arrivée', () => {
    const events = createEvents(4);
    pushEvent(events, EVT.SHOT, 1, 1);
    pushEvent(events, EVT.IMPACT, 2, 2);
    pushEvent(events, EVT.LANDED, 3, 3);
    expect(events.count).toBe(3);
    expect(events.items.slice(0, 3).map((e) => e.type)).toEqual([EVT.SHOT, EVT.IMPACT, EVT.LANDED]);
  });

  it('file pleine : événement perdu, dropped incrémenté, aucune exception', () => {
    const events = createEvents(2);
    pushEvent(events, EVT.SHOT, 1, 1, 1, 1);
    pushEvent(events, EVT.IMPACT, 2, 2, 2, 2);
    expect(() => pushEvent(events, EVT.CAPTURED, 3, 3, 3, 3)).not.toThrow();
    expect(events.count).toBe(2);
    expect(events.dropped).toBe(1);
  });

  it('file pleine : les éléments déjà présents restent intacts', () => {
    const events = createEvents(2);
    pushEvent(events, EVT.SHOT, 1, 1, 1, 1);
    pushEvent(events, EVT.IMPACT, 2, 2, 2, 2);
    const first = events.items[0];
    const second = events.items[1];
    pushEvent(events, EVT.CAPTURED, 3, 3, 3, 3);
    pushEvent(events, EVT.CAPTURED, 4, 4, 4, 4);
    expect(events.dropped).toBe(2);
    expect(events.items[0]).toBe(first);
    expect(events.items[1]).toBe(second);
    expect(first).toEqual({ type: EVT.SHOT, x: 1, y: 1, a: 1, b: 1 });
    expect(second).toEqual({ type: EVT.IMPACT, x: 2, y: 2, a: 2, b: 2 });
  });

  it('dépassement massif : count plafonné, dropped = nombre d’événements perdus', () => {
    const events = createEvents(8);
    for (let i = 0; i < 100; i++) pushEvent(events, EVT.SHOT, i, i);
    expect(events.count).toBe(8);
    expect(events.dropped).toBe(92);
    expect(events.items).toHaveLength(8);
  });

  it('capacité 0 : tout est perdu sans exception', () => {
    const events = createEvents(0);
    expect(() => pushEvent(events, EVT.SHOT, 0, 0)).not.toThrow();
    expect(events.count).toBe(0);
    expect(events.dropped).toBe(1);
  });
});

describe('clearEvents', () => {
  it('remet count à 0', () => {
    const events = createEvents(4);
    pushEvent(events, EVT.SHOT, 1, 1);
    pushEvent(events, EVT.SHOT, 2, 2);
    clearEvents(events);
    expect(events.count).toBe(0);
  });

  it('ne touche pas au compteur dropped', () => {
    const events = createEvents(1);
    pushEvent(events, EVT.SHOT, 1, 1);
    pushEvent(events, EVT.SHOT, 2, 2);
    pushEvent(events, EVT.SHOT, 3, 3);
    expect(events.dropped).toBe(2);
    clearEvents(events);
    expect(events.dropped).toBe(2);
  });

  it('réutilise les mêmes objets après clear (zéro allocation)', () => {
    const events = createEvents(3);
    const items = events.items;
    const refs = [...items];
    pushEvent(events, EVT.SHOT, 1, 1, 1, 1);
    pushEvent(events, EVT.SHOT, 2, 2, 2, 2);
    clearEvents(events);
    pushEvent(events, EVT.EXPLOSION, 9, 8, 7, 6);
    expect(events.items).toBe(items);
    expect(events.items).toHaveLength(3);
    for (let i = 0; i < 3; i++) expect(events.items[i]).toBe(refs[i]);
    expect(refs[0]).toEqual({ type: EVT.EXPLOSION, x: 9, y: 8, a: 7, b: 6 });
  });

  it('un push après clear réécrit a et b à 0 (pas de valeur périmée)', () => {
    const events = createEvents(2);
    pushEvent(events, EVT.SHOT, 1, 1, 5, 6);
    clearEvents(events);
    pushEvent(events, EVT.SHOT, 2, 2);
    expect(events.items[0]).toEqual({ type: EVT.SHOT, x: 2, y: 2, a: 0, b: 0 });
  });

  it('la file est de nouveau utilisable jusqu’à sa capacité après clear', () => {
    const events = createEvents(2);
    for (let i = 0; i < 5; i++) pushEvent(events, EVT.SHOT, i, i);
    clearEvents(events);
    pushEvent(events, EVT.SHOT, 0, 0);
    pushEvent(events, EVT.SHOT, 0, 0);
    expect(events.count).toBe(2);
    expect(events.dropped).toBe(3);
    pushEvent(events, EVT.SHOT, 0, 0);
    expect(events.dropped).toBe(4);
  });
});
