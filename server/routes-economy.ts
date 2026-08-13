import { Elysia, t } from 'elysia';
import { authenticatedAccount } from './http-auth';
import { buyMarketListing, buyOfficialOffer, cancelMarketListing, createMarketListing, listInventory, listMarketListings, listStoreOffers } from './economy-service';

export const economyRoutes = new Elysia({ name: 'economy-routes' })
  .get('/api/shop/offers', ({ request, set }) => {
    if (!authenticatedAccount(request)) { set.status = 401; return { error: 'Sign in first.' }; }
    return { offers: listStoreOffers() };
  })
  .post('/api/shop/offers/:id/buy', ({ request, params, set }) => {
    const account = authenticatedAccount(request);
    if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
    try { return buyOfficialOffer(account.id, params.id, request.headers.get('idempotency-key') ?? undefined); }
    catch (error) { set.status = 409; return { error: error instanceof Error ? error.message : 'Purchase failed.' }; }
  })
  .get('/api/inventory', ({ request, set }) => {
    const account = authenticatedAccount(request);
    if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
    return { items: listInventory(account.id) };
  })
  .get('/api/market/listings', ({ request, set }) => {
    if (!authenticatedAccount(request)) { set.status = 401; return { error: 'Sign in first.' }; }
    return { listings: listMarketListings() };
  })
  .post('/api/market/listings', ({ request, body, set }) => {
    const account = authenticatedAccount(request);
    if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
    try { return { listing: createMarketListing(account.id, body.itemId, body.price) }; }
    catch (error) { set.status = 409; return { error: error instanceof Error ? error.message : 'Could not list item.' }; }
  }, { body: t.Object({ itemId: t.String({ minLength: 1 }), price: t.Integer({ minimum: 1, maximum: 1_000_000 }) }) })
  .post('/api/market/listings/:id/buy', ({ request, params, set }) => {
    const account = authenticatedAccount(request);
    if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
    try { return buyMarketListing(account.id, params.id, request.headers.get('idempotency-key') ?? undefined); }
    catch (error) { set.status = 409; return { error: error instanceof Error ? error.message : 'Market purchase failed.' }; }
  })
  .delete('/api/market/listings/:id', ({ request, params, set }) => {
    const account = authenticatedAccount(request);
    if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
    try { cancelMarketListing(account.id, params.id); return { ok: true }; }
    catch (error) { set.status = 409; return { error: error instanceof Error ? error.message : 'Could not cancel listing.' }; }
  });
