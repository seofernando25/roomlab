import { describe, expect, test } from 'bun:test';
import { clientAddress, effectiveOrigin } from '../server/security';

describe('proxy-aware request security', () => {
  test('direct requests use the actual request origin', () => {
    const request = new Request('http://127.0.0.1:3001/api/rooms', { headers: { host: '127.0.0.1:3001' } });
    expect(effectiveOrigin(request, false, undefined)).toBe('http://127.0.0.1:3001');
  });

  test('trusted proxy requests use the external forwarded origin', () => {
    const request = new Request('http://roomlab:3000/api/rooms', { headers: {
      host: 'roomlab:3000',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'rooms.example.com',
      'x-forwarded-for': '203.0.113.17, 10.0.0.2',
    } });
    expect(effectiveOrigin(request, true, undefined)).toBe('https://rooms.example.com');
    expect(clientAddress(request, '10.0.0.2', true)).toBe('203.0.113.17');
  });

  test('forwarded headers are ignored unless proxy trust is explicit', () => {
    const request = new Request('http://roomlab:3000/api/rooms', { headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'evil.example',
      'x-forwarded-for': '203.0.113.17',
    } });
    expect(effectiveOrigin(request, false, undefined)).toBe('http://roomlab:3000');
    expect(clientAddress(request, '10.0.0.2', false)).toBe('10.0.0.2');
  });

  test('explicit app origin wins when deployment has a known canonical URL', () => {
    const request = new Request('http://roomlab:3000/api/rooms');
    expect(effectiveOrigin(request, false, 'https://rooms.example.com/')).toBe('https://rooms.example.com');
  });
});
