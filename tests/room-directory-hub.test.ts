import { describe, expect, test } from 'bun:test';
import { RoomDirectoryHub } from '../server/room-directory-hub';
import type { RoomDirectoryServerMessage } from '../src/online/types';

describe('room directory realtime hub', () => {
  test('new subscribers get a revision snapshot and changes broadcast without polling', () => {
    const hub = new RoomDirectoryHub();
    const alice: RoomDirectoryServerMessage[] = [];
    const bob: RoomDirectoryServerMessage[] = [];
    hub.attach({ id: 'alice', send: (message) => alice.push(message) });
    expect(alice).toEqual([{ type: 'ready', revision: 0 }]);

    hub.changed();
    expect(alice.at(-1)).toEqual({ type: 'rooms-changed', revision: 1 });

    hub.attach({ id: 'bob', send: (message) => bob.push(message) });
    expect(bob).toEqual([{ type: 'ready', revision: 1 }]);
    hub.changed();
    expect(alice.at(-1)).toEqual({ type: 'rooms-changed', revision: 2 });
    expect(bob.at(-1)).toEqual({ type: 'rooms-changed', revision: 2 });

    hub.detach('alice');
    hub.changed();
    expect(alice.at(-1)).toEqual({ type: 'rooms-changed', revision: 2 });
    expect(bob.at(-1)).toEqual({ type: 'rooms-changed', revision: 3 });

    hub.attach({ id: 'dead', send: () => { throw new Error('closed'); } });
    expect(() => hub.changed()).not.toThrow();
    expect(bob.at(-1)).toEqual({ type: 'rooms-changed', revision: 4 });
  });
});
