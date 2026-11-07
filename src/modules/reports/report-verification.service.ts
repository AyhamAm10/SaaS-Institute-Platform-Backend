import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { InstituteRepository } from '../institutes/institute.repository';

/** Signed content of a verification token (short keys keep the QR small). */
export interface VerificationPayload {
  /** Institute id. */
  i: number;
  /** Document kind (report key or "receipt"). */
  k: string;
  /** Document number. */
  n: string;
  /** Issued at (ISO). */
  t: string;
  /** Subject (student name, exam title). */
  s: string;
  /** Summary lines (balance, average). */
  l: string[];
}

export interface VerificationResult {
  valid: boolean;
  institute?: { name: string; logoUrl: string; primaryColor: string };
  kind?: string;
  number?: string;
  issuedAt?: string;
  subject?: string;
  lines?: string[];
}

/** Document number prefixes per kind. */
const PREFIXES: Record<string, string> = {
  'student-statement': 'ST',
  'student-transcript': 'TR',
  'exam-results': 'EX',
  receipt: 'RC',
};

/**
 * Document verification (D3): a stateless HMAC-signed token printed as a QR
 * code on statements, transcripts, exam sheets and receipts. The public
 * verify page shows what the institute issued, so a forged paper is caught.
 * Nothing sensitive goes in the token: a number, a name and short lines.
 */
@Injectable()
export class ReportVerificationService {
  private readonly secret: string;

  constructor(
    @Inject(InstituteRepository)
    private readonly instituteRepository: InstituteRepository,
    @Optional() configService?: ConfigService,
  ) {
    this.secret =
      configService?.get<string>('REPORT_SIGNING_SECRET') ??
      process.env['REPORT_SIGNING_SECRET'] ??
      configService?.get<string>('JWT_ACCESS_SECRET') ??
      process.env['JWT_ACCESS_SECRET'] ??
      'dev-report-secret-do-not-use-in-production';
  }

  /** New document number + signed token. */
  issue(input: { instituteId: number; kind: string; subject: string; lines: string[]; issuedAt: Date }) {
    const date = input.issuedAt.toISOString().slice(0, 10).replaceAll('-', '');
    const number = `${PREFIXES[input.kind] ?? 'DOC'}-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const payload: VerificationPayload = {
      i: input.instituteId,
      k: input.kind,
      n: number,
      t: input.issuedAt.toISOString(),
      s: input.subject,
      l: input.lines,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return { number, token: `${body}.${this.sign(body)}` };
  }

  /** Decoded payload when the signature matches, else null. */
  decode(token: string): VerificationPayload | null {
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as VerificationPayload;
    } catch {
      return null;
    }
  }

  /** Public check: the institute and the signed summary, or `valid: false`. */
  async verify(token: string): Promise<VerificationResult> {
    const payload = this.decode(token);
    if (!payload) return { valid: false };
    const institute = await this.instituteRepository.findById(payload.i);
    if (!institute) return { valid: false };
    return {
      valid: true,
      institute: { name: institute.name, logoUrl: institute.logoUrl, primaryColor: institute.primaryColor },
      kind: payload.k,
      number: payload.n,
      issuedAt: payload.t,
      subject: payload.s,
      lines: payload.l,
    };
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
