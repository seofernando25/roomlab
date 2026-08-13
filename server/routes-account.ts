import { Elysia, t } from 'elysia';
import { createAccountSession, renameAccount, revokeSession } from './auth-service';
import { grantStarterInventory } from './economy-service';
import { authenticatedAccount, clearSessionCookie, sessionCookie, sessionToken } from './http-auth';

export const accountRoutes = new Elysia({ name: 'account-routes' })
  .get('/api/session', ({ request }) => ({ account: authenticatedAccount(request) }))
  .post('/api/session/claim', ({ body, set }) => {
    try {
      const created = createAccountSession(body.username);
      grantStarterInventory(created.account.id);
      set.headers['set-cookie'] = sessionCookie(created.token);
      return { account: created.account };
    } catch (error) {
      set.status = 409;
      return { error: error instanceof Error ? error.message : 'Could not create account.' };
    }
  }, { body: t.Object({ username: t.String({ minLength: 3, maxLength: 18 }) }) })
  .patch('/api/me', ({ request, body, set }) => {
    const account = authenticatedAccount(request);
    if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
    try { return { account: renameAccount(account.id, body.username) }; }
    catch (error) { set.status = 409; return { error: error instanceof Error ? error.message : 'Could not rename account.' }; }
  }, { body: t.Object({ username: t.String({ minLength: 3, maxLength: 18 }) }) })
  .post('/api/session/logout', ({ request, set }) => {
    revokeSession(sessionToken(request));
    set.headers['set-cookie'] = clearSessionCookie();
    return { ok: true };
  });
