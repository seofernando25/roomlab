import type {
  AccountDto,
  FriendDto,
  InventoryItemDto,
  JoinRoomDto,
  MarketListingDto,
  RoomAccess,
  RoomDetailDto,
  RoomEditorDto,
  RoomSummaryDto,
  StoreOfferDto,
} from './types';

export class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

export class RoomLabApi {
  async session(): Promise<AccountDto | null> { return (await this.request<{ account: AccountDto | null }>('/api/session')).account; }
  async claimUsername(username: string): Promise<AccountDto> {
    return (await this.request<{ account: AccountDto }>('/api/session/claim', { method: 'POST', body: { username } })).account;
  }
  async rename(username: string): Promise<AccountDto> { return (await this.request<{ account: AccountDto }>('/api/me', { method: 'PATCH', body: { username } })).account; }
  async logout(): Promise<void> { await this.request('/api/session/logout', { method: 'POST' }); }

  async rooms(scope: 'popular' | 'mine' | 'friends' | 'recent' = 'popular', search = ''): Promise<readonly RoomSummaryDto[]> {
    const params = new URLSearchParams({ scope, ...(search ? { search } : {}) });
    return (await this.request<{ rooms: readonly RoomSummaryDto[] }>(`/api/rooms?${params}`)).rooms;
  }
  async room(id: string): Promise<RoomDetailDto> { return (await this.request<{ room: RoomDetailDto }>(`/api/rooms/${id}`)).room; }
  async createRoom(input: { name: string; description?: string; access?: RoomAccess; maxUsers?: number }): Promise<RoomDetailDto> {
    return (await this.request<{ room: RoomDetailDto }>('/api/rooms', { method: 'POST', body: input })).room;
  }
  async updateRoom(id: string, input: Partial<{ name: string; description: string; access: RoomAccess; maxUsers: number }>): Promise<RoomDetailDto> {
    return (await this.request<{ room: RoomDetailDto }>(`/api/rooms/${id}`, { method: 'PATCH', body: input })).room;
  }
  async joinRoom(id: string): Promise<JoinRoomDto> { return (await this.request<{ join: JoinRoomDto }>(`/api/rooms/${id}/join`, { method: 'POST' })).join; }
  async roomEditors(id: string): Promise<readonly RoomEditorDto[]> { return (await this.request<{ editors: readonly RoomEditorDto[] }>(`/api/rooms/${id}/editors`)).editors; }
  async grantRoomEditor(id: string, username: string): Promise<RoomEditorDto> { return (await this.request<{ editor: RoomEditorDto }>(`/api/rooms/${id}/editors`, { method: 'POST', body: { username } })).editor; }
  async revokeRoomEditor(id: string, userId: string): Promise<void> { await this.request(`/api/rooms/${id}/editors/${userId}`, { method: 'DELETE' }); }

  async offers(): Promise<readonly StoreOfferDto[]> { return (await this.request<{ offers: readonly StoreOfferDto[] }>('/api/shop/offers')).offers; }
  async buyOffer(id: string): Promise<{ item: InventoryItemDto; balance: number }> { return this.request(`/api/shop/offers/${id}/buy`, { method: 'POST' }); }
  async inventory(): Promise<readonly InventoryItemDto[]> { return (await this.request<{ items: readonly InventoryItemDto[] }>('/api/inventory')).items; }
  async market(): Promise<readonly MarketListingDto[]> { return (await this.request<{ listings: readonly MarketListingDto[] }>('/api/market/listings')).listings; }
  async createListing(itemId: string, price: number): Promise<MarketListingDto> {
    return (await this.request<{ listing: MarketListingDto }>('/api/market/listings', { method: 'POST', body: { itemId, price } })).listing;
  }
  async buyListing(id: string): Promise<{ item: InventoryItemDto; balance: number }> { return this.request(`/api/market/listings/${id}/buy`, { method: 'POST' }); }
  async cancelListing(id: string): Promise<void> { await this.request(`/api/market/listings/${id}`, { method: 'DELETE' }); }

  async friends(): Promise<readonly FriendDto[]> { return (await this.request<{ friends: readonly FriendDto[] }>('/api/friends')).friends; }
  async requestFriend(username: string): Promise<void> { await this.request('/api/friends/request', { method: 'POST', body: { username } }); }
  async acceptFriend(id: string): Promise<void> { await this.request(`/api/friends/${id}/accept`, { method: 'POST' }); }
  async removeFriend(id: string): Promise<void> { await this.request(`/api/friends/${id}`, { method: 'DELETE' }); }

  private async request<T = { ok: true }>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const init: RequestInit = { method: options.method ?? 'GET', credentials: 'same-origin' };
    if (options.body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new ApiError(data.error ?? `Request failed (${response.status}).`, response.status);
    return data;
  }
}

export const api = new RoomLabApi();
