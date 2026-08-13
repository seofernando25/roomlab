import { randomUUID } from 'node:crypto';
import { getCatalogueObject, listCatalogueObjects } from '../src/domain/catalogue-registry';
import type { InventoryItemDto, MarketListingDto, StoreOfferDto, UserId } from '../src/online/types';
import { db, nowIso, transaction } from './database';

interface OfferRow { id: string; prototype_id: string; label: string; price: number; active: number; }
interface ItemRow {
  id: string; prototype_id: string; state: 'inventory' | 'placed' | 'listed'; room_id: string | null;
  entity_id: string | null; acquired_at: string;
}
interface ListingRow {
  id: string; item_id: string; prototype_id: string; seller_user_id: string; seller_username: string; price: number; created_at: string;
}

const STARTER_ITEMS = ['chair', 'chair', 'sofa', 'table', 'lamp', 'plant', 'vase', 'vase', 'stairs-block', 'stairs-block', 'stairs-block', 'ramp-metal'] as const;

export function seedStoreOffers(): void {
  const insert = db.query(`INSERT OR IGNORE INTO store_offers(id, prototype_id, label, price, active, sort_order) VALUES(?, ?, ?, ?, 1, ?)`);
  listCatalogueObjects().forEach((definition, index) => {
    insert.run(`official:${definition.id}`, definition.id, definition.label, priceFor(index, definition.category), index);
  });
}

export function grantStarterInventory(userId: UserId): void {
  const count = db.query<{ count: number }, [string]>('SELECT COUNT(*) count FROM item_instances WHERE owner_user_id = ?').get(userId)?.count ?? 0;
  if (count) return;
  const now = nowIso();
  transaction(() => {
    const insert = db.query('INSERT INTO item_instances(id, prototype_id, owner_user_id, state, acquired_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)');
    for (const prototypeId of STARTER_ITEMS) insert.run(randomUUID(), prototypeId, userId, 'inventory', now, now);
  });
}

export function listStoreOffers(): readonly StoreOfferDto[] {
  return db.query<OfferRow, []>('SELECT id, prototype_id, label, price, active FROM store_offers WHERE active = 1 ORDER BY sort_order, id').all()
    .map((row) => ({ id: row.id, prototypeId: row.prototype_id, label: row.label, price: row.price, active: Boolean(row.active) }));
}

export function listInventory(userId: UserId): readonly InventoryItemDto[] {
  return db.query<ItemRow, [string]>(`
    SELECT id, prototype_id, state, room_id, entity_id, acquired_at
    FROM item_instances WHERE owner_user_id = ? ORDER BY acquired_at DESC, id
  `).all(userId).map(toItemDto);
}

export function inventoryItem(userId: UserId, itemId: string): InventoryItemDto | null {
  return itemByIdForOwner(itemId, userId);
}

export function inventoryPrototypeSet(userId: UserId): ReadonlySet<string> {
  return new Set(listInventory(userId).filter((item) => item.state === 'inventory').map((item) => item.prototypeId));
}

export function buyOfficialOffer(userId: UserId, offerId: string, requestId: string = randomUUID()): { item: InventoryItemDto; balance: number } {
  return withOperationReceipt(userId, requestId, `official:${offerId}`, () => {
    const offer = db.query<OfferRow, [string]>('SELECT id, prototype_id, label, price, active FROM store_offers WHERE id = ?').get(offerId);
    if (!offer || !offer.active) throw new Error('That Shop offer is no longer available.');
    const balance = walletBalance(userId);
    if (balance < offer.price) throw new Error('Not enough credits.');
    const now = nowIso();
    const itemId = randomUUID();
    db.query('UPDATE wallets SET balance = balance - ? WHERE user_id = ?').run(offer.price, userId);
    db.query('INSERT INTO currency_ledger(id, user_id, delta, reason, reference_id, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), userId, -offer.price, 'official-purchase', offer.id, now);
    db.query('INSERT INTO item_instances(id, prototype_id, owner_user_id, state, acquired_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(itemId, offer.prototype_id, userId, 'inventory', now, now);
    return { item: itemByIdForOwner(itemId, userId)!, balance: balance - offer.price };
  });
}

export function listMarketListings(): readonly MarketListingDto[] {
  return db.query<ListingRow, []>(`
    SELECT l.id, l.item_id, i.prototype_id, l.seller_user_id, u.username seller_username, l.price, l.created_at
    FROM market_listings l JOIN item_instances i ON i.id = l.item_id JOIN users u ON u.id = l.seller_user_id
    WHERE l.status = 'active' ORDER BY l.created_at DESC
  `).all().map(toListingDto);
}

export function createMarketListing(userId: UserId, itemId: string, price: number): MarketListingDto {
  if (!Number.isInteger(price) || price < 1 || price > 1_000_000) throw new Error('Choose a price between 1 and 1,000,000 credits.');
  const listingId = randomUUID();
  const now = nowIso();
  transaction(() => {
    const item = itemByIdForOwner(itemId, userId);
    if (!item || item.state !== 'inventory') throw new Error('Only an item currently in your inventory can be listed.');
    db.query("UPDATE item_instances SET state = 'listed', updated_at = ? WHERE id = ? AND owner_user_id = ?").run(now, itemId, userId);
    db.query("INSERT INTO market_listings(id, item_id, seller_user_id, price, status, created_at) VALUES(?, ?, ?, ?, 'active', ?)")
      .run(listingId, itemId, userId, price, now);
  });
  const listing = listMarketListings().find((entry) => entry.id === listingId);
  if (!listing) throw new Error('Listing was not created.');
  return listing;
}

export function cancelMarketListing(userId: UserId, listingId: string): void {
  transaction(() => {
    const row = db.query<{ item_id: string; seller_user_id: string; status: string }, [string]>('SELECT item_id, seller_user_id, status FROM market_listings WHERE id = ?').get(listingId);
    if (!row || row.seller_user_id !== userId || row.status !== 'active') throw new Error('That listing cannot be cancelled.');
    const now = nowIso();
    db.query("UPDATE market_listings SET status = 'cancelled', closed_at = ? WHERE id = ?").run(now, listingId);
    db.query("UPDATE item_instances SET state = 'inventory', updated_at = ? WHERE id = ?").run(now, row.item_id);
  });
}

export function buyMarketListing(buyerUserId: UserId, listingId: string, requestId: string = randomUUID()): { item: InventoryItemDto; balance: number } {
  return withOperationReceipt(buyerUserId, requestId, `market:${listingId}`, () => {
    const row = db.query<{ item_id: string; seller_user_id: string; price: number; status: string }, [string]>(
      'SELECT item_id, seller_user_id, price, status FROM market_listings WHERE id = ?'
    ).get(listingId);
    if (!row || row.status !== 'active') throw new Error('That listing is no longer available.');
    if (row.seller_user_id === buyerUserId) throw new Error('You cannot buy your own listing.');
    const buyerBalance = walletBalance(buyerUserId);
    if (buyerBalance < row.price) throw new Error('Not enough credits.');
    const now = nowIso();
    db.query('UPDATE wallets SET balance = balance - ? WHERE user_id = ?').run(row.price, buyerUserId);
    db.query('UPDATE wallets SET balance = balance + ? WHERE user_id = ?').run(row.price, row.seller_user_id);
    db.query('INSERT INTO currency_ledger(id, user_id, delta, reason, reference_id, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), buyerUserId, -row.price, 'market-purchase', listingId, now);
    db.query('INSERT INTO currency_ledger(id, user_id, delta, reason, reference_id, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), row.seller_user_id, row.price, 'market-sale', listingId, now);
    db.query("UPDATE item_instances SET owner_user_id = ?, state = 'inventory', updated_at = ? WHERE id = ?").run(buyerUserId, now, row.item_id);
    db.query("UPDATE market_listings SET status = 'sold', buyer_user_id = ?, closed_at = ? WHERE id = ?").run(buyerUserId, now, listingId);
    return { item: itemByIdForOwner(row.item_id, buyerUserId)!, balance: buyerBalance - row.price };
  });
}

export function reserveInventoryItemForRoom(userId: UserId, itemId: string, roomId: string, entityId: string): void {
  const now = nowIso();
  const result = db.query("UPDATE item_instances SET state = 'placed', room_id = ?, entity_id = ?, updated_at = ? WHERE id = ? AND owner_user_id = ? AND state = 'inventory'")
    .run(roomId, entityId, now, itemId, userId);
  if (result.changes !== 1) throw new Error('That item is no longer available in your inventory.');
}

export function returnPlacedItem(userId: UserId, roomId: string, entityId: string): void {
  const now = nowIso();
  const result = db.query("UPDATE item_instances SET state = 'inventory', room_id = NULL, entity_id = NULL, updated_at = ? WHERE owner_user_id = ? AND room_id = ? AND entity_id = ? AND state = 'placed'")
    .run(now, userId, roomId, entityId);
  if (result.changes !== 1) throw new Error('This object is not one of your placed inventory items.');
}

export function placedItemOwner(roomId: string, entityId: string): UserId | null {
  return db.query<{ owner_user_id: string }, [string, string]>("SELECT owner_user_id FROM item_instances WHERE room_id = ? AND entity_id = ? AND state = 'placed'").get(roomId, entityId)?.owner_user_id ?? null;
}

function withOperationReceipt<T>(userId: UserId, requestId: string, operation: string, execute: () => T): T {
  const normalized = requestId.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalized)) throw new Error('Invalid purchase request id.');
  return transaction(() => {
    const prior = db.query<{ operation: string; response_json: string }, [string, string]>(
      'SELECT operation, response_json FROM operation_receipts WHERE user_id = ? AND request_id = ?'
    ).get(userId, normalized);
    if (prior) {
      if (prior.operation !== operation) throw new Error('That purchase request id was already used.');
      return JSON.parse(prior.response_json) as T;
    }
    const result = execute();
    db.query('INSERT INTO operation_receipts(user_id, request_id, operation, response_json, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(userId, normalized, operation, JSON.stringify(result), nowIso());
    return result;
  });
}

function itemByIdForOwner(itemId: string, userId: UserId): InventoryItemDto | null {
  const row = db.query<ItemRow, [string, string]>('SELECT id, prototype_id, state, room_id, entity_id, acquired_at FROM item_instances WHERE id = ? AND owner_user_id = ?').get(itemId, userId);
  return row ? toItemDto(row) : null;
}
function walletBalance(userId: UserId): number {
  return db.query<{ balance: number }, [string]>('SELECT balance FROM wallets WHERE user_id = ?').get(userId)?.balance ?? 0;
}
function toItemDto(row: ItemRow): InventoryItemDto {
  return { id: row.id, prototypeId: row.prototype_id, state: row.state, roomId: row.room_id, entityId: row.entity_id, acquiredAt: row.acquired_at };
}
function toListingDto(row: ListingRow): MarketListingDto {
  return { id: row.id, itemId: row.item_id, prototypeId: row.prototype_id, sellerUserId: row.seller_user_id, sellerUsername: row.seller_username, price: row.price, createdAt: row.created_at };
}
function priceFor(index: number, category: string): number {
  const base = category === 'architecture' ? 18 : category === 'seating' ? 28 : category === 'surfaces' ? 34 : category === 'decor' ? 16 : 24;
  return base + (index % 4) * 4;
}
