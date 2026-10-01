#!/usr/bin/env node
/* Verifies a licence proof by hand with the studio public key — the check
   from §8 of the License Integration Standard, for A8/A11/A12 and for
   confirming that the app's understanding of §5 matches the server.
   Usage: node scripts/verify-proof.mjs '<proof>'   (or pipe it on stdin) */
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const PUB = Buffer.from([
  0x04, 0xcd, 0xa5, 0x7d, 0x1c, 0xc8, 0xa6, 0xe2, 0x71, 0xd5, 0x48, 0x49, 0xce, 0x55, 0xd5, 0x03,
  0x77, 0x56, 0x66, 0x90, 0xfd, 0xb6, 0x95, 0x45, 0xa4, 0x1a, 0x92, 0xc4, 0x77, 0xda, 0xcb, 0x00,
  0x0d, 0x2c, 0x06, 0x0b, 0xa8, 0x3f, 0xbd, 0x9b, 0x70, 0x85, 0xaf, 0xff, 0xc0, 0x42, 0xd4, 0x00,
  0x7e, 0x5b, 0x96, 0xfe, 0x68, 0xff, 0xec, 0x91, 0x11, 0xf6, 0x21, 0x00, 0x79, 0xfc, 0x43, 0x59, 0x52]);
const proof = (process.argv[2] || readFileSync(0, 'utf8')).trim();
const [b, s] = proof.split('.');
const u = (x) => Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - x.length % 4) % 4), 'base64');
const key = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: PUB.subarray(1, 33).toString('base64url'), y: PUB.subarray(33, 65).toString('base64url') } });
const ok = crypto.verify('sha256', u(b), { key, dsaEncoding: 'ieee-p1363' }, u(s));
console.log('signature:', ok ? 'VERIFIED' : 'FAILED');
if (ok) console.log(JSON.parse(u(b).toString()));
process.exit(ok ? 0 : 1);
