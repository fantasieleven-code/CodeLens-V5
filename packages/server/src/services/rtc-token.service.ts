/**
 * Volcano RTC Token Generation Service
 *
 * Ported from HireFlow's volc_rtc_token.py.
 * Generates RTC join tokens using native binary packing + HMAC-SHA256.
 */

import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';

const VERSION = '001';

/** Default RTC privileges: subscribe, publish, data channel */
const DEFAULT_PRIVILEGES: Record<number, number> = {
  0: 0,  // PrivSubscribeStream
  1: 0,  // PrivPublishStream
  2: 0,  // PrivPublishAudioStream
  3: 0,  // PrivPublishVideoStream
  14: 0, // PrivPublishDataStream
};

/**
 * Generate an RTC join token for a user in a room.
 */
export function generateRtcToken(
  roomId: string,
  userId: string,
  expireSeconds = 3600,
): string {
  const appId = env.VOLC_RTC_APP_ID;
  const appKey = env.VOLC_RTC_APP_KEY;

  if (!appId || !appKey) {
    throw new AppError(500, 'VOLC_RTC_APP_ID and VOLC_RTC_APP_KEY are required for RTC token generation', 'MISSING_CONFIG');
  }

  return generateTokenNative(appId, appKey, roomId, userId, expireSeconds);
}

function generateTokenNative(
  appId: string,
  appKey: string,
  roomId: string,
  userId: string,
  expireSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomInt(0, 0xFFFFFFFF);
  const expireAt = now + expireSeconds;

  // Build privileges with expiry
  const privs = Object.entries(DEFAULT_PRIVILEGES).map(([id, _exp]) => ({
    id: parseInt(id, 10),
    expire: expireAt,
  }));

  // Binary pack the message
  const msg = packMessage(nonce, now, expireAt, roomId, userId, privs);

  // HMAC-SHA256 signature
  const sig = crypto.createHmac('sha256', appKey).update(msg).digest();

  // Encode: msg_len(2) + msg + sig_len(2) + sig
  const msgLenBuf = Buffer.alloc(2);
  msgLenBuf.writeUInt16LE(msg.length);

  const sigLenBuf = Buffer.alloc(2);
  sigLenBuf.writeUInt16LE(sig.length);

  const payload = Buffer.concat([msgLenBuf, msg, sigLenBuf, sig]);
  const b64 = payload.toString('base64');

  const token = VERSION + appId + b64;
  logger.debug(`[rtc-token] Generated token for room=${roomId} user=${userId} expires=${expireSeconds}s`);
  return token;
}

function packMessage(
  nonce: number,
  issueAt: number,
  expireAt: number,
  roomId: string,
  userId: string,
  privileges: Array<{ id: number; expire: number }>,
): Buffer {
  const roomIdBuf = Buffer.from(roomId, 'utf-8');
  const userIdBuf = Buffer.from(userId, 'utf-8');

  // Calculate total size
  const headerSize = 4 + 4 + 4; // nonce + issue_at + expire_at
  const roomSize = 2 + roomIdBuf.length;
  const userSize = 2 + userIdBuf.length;
  const privSize = 2 + privileges.length * 6; // count(2) + N * (id(2) + expire(4))
  const totalSize = headerSize + roomSize + userSize + privSize;

  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // nonce (4 bytes LE)
  buf.writeUInt32LE(nonce, offset); offset += 4;
  // issue_at (4 bytes LE)
  buf.writeUInt32LE(issueAt, offset); offset += 4;
  // expire_at (4 bytes LE)
  buf.writeUInt32LE(expireAt, offset); offset += 4;

  // room_id_len (2 bytes LE) + room_id
  buf.writeUInt16LE(roomIdBuf.length, offset); offset += 2;
  roomIdBuf.copy(buf, offset); offset += roomIdBuf.length;

  // user_id_len (2 bytes LE) + user_id
  buf.writeUInt16LE(userIdBuf.length, offset); offset += 2;
  userIdBuf.copy(buf, offset); offset += userIdBuf.length;

  // priv_count (2 bytes LE)
  buf.writeUInt16LE(privileges.length, offset); offset += 2;

  // privileges: id(2 LE) + expire(4 LE) each
  for (const priv of privileges) {
    buf.writeUInt16LE(priv.id, offset); offset += 2;
    buf.writeUInt32LE(priv.expire, offset); offset += 4;
  }

  return buf;
}
