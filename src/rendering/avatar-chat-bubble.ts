import * as THREE from 'three';

const CHAT_VISIBLE_SECONDS = 2.7;
const CHAT_FADE_SECONDS = 1.1;

interface ChatBubble {
  readonly sprite: THREE.Sprite;
  readonly texture: THREE.CanvasTexture;
  age: number;
}

/** Transient presentation-only speech bubble attached to an avatar root. */
export class AvatarChatBubble {
  readonly group = new THREE.Group();
  readonly #avatarHeight: number;
  #chat: ChatBubble | null = null;
  #lastChatId = '';

  constructor(avatarHeight: number) {
    this.#avatarHeight = avatarHeight;
    this.group.name = 'avatar-chat-bubble';
  }

  get active(): boolean { return this.#chat !== null; }

  say(chatId: string, text: string): void {
    if (!chatId || chatId === this.#lastChatId) return;
    this.#lastChatId = chatId;
    this.clear();
    const { sprite, texture } = createChatBubble(text);
    this.#chat = { sprite, texture, age: 0 };
    this.group.add(sprite);
    this.update(0, 0);
  }

  update(elevation: number, deltaSeconds: number): void {
    const chat = this.#chat;
    if (!chat) return;
    chat.age += deltaSeconds;
    chat.sprite.position.y = this.#avatarHeight + elevation + 0.30 + Math.min(0.42, chat.age * 0.12);
    chat.sprite.material.opacity = chat.age <= CHAT_VISIBLE_SECONDS
      ? 1
      : Math.max(0, 1 - (chat.age - CHAT_VISIBLE_SECONDS) / CHAT_FADE_SECONDS);
    if (chat.age >= CHAT_VISIBLE_SECONDS + CHAT_FADE_SECONDS) this.clear();
  }

  dispose(): void { this.clear(); this.group.clear(); }

  private clear(): void {
    const chat = this.#chat;
    if (!chat) return;
    this.group.remove(chat.sprite);
    chat.sprite.material.dispose();
    chat.texture.dispose();
    this.#chat = null;
  }
}

function createChatBubble(text: string): { sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
  const lines = wrapChat(text.trim().replace(/\s+/g, ' '), 30).slice(0, 4);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.max(96, 52 + lines.length * 34);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable for chat bubbles.');
  context.imageSmoothingEnabled = false;
  context.fillStyle = 'rgba(246,250,248,0.96)';
  context.fillRect(12, 8, canvas.width - 24, canvas.height - 28);
  context.strokeStyle = '#334b52';
  context.lineWidth = 6;
  context.strokeRect(15, 11, canvas.width - 30, canvas.height - 34);
  context.beginPath();
  context.moveTo(canvas.width / 2 - 15, canvas.height - 20);
  context.lineTo(canvas.width / 2, canvas.height - 2);
  context.lineTo(canvas.width / 2 + 15, canvas.height - 20);
  context.closePath();
  context.fillStyle = 'rgba(246,250,248,0.96)';
  context.fill();
  context.stroke();
  context.fillStyle = '#263b3f';
  context.font = '700 25px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  lines.forEach((line, index) => context.fillText(line, canvas.width / 2, 34 + index * 34));
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  const worldWidth = 2.75;
  sprite.scale.set(worldWidth, worldWidth * (canvas.height / canvas.width), 1);
  sprite.renderOrder = 1000;
  return { sprite, texture };
}

function wrapChat(text: string, maxChars: number): readonly string[] {
  if (!text) return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > maxChars) {
      if (line) { lines.push(line); line = ''; }
      for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars));
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}
