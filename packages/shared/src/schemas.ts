/**
 * Zod schemas shared between server actions, route handlers and the worker.
 * Error messages are interface copy: say what happened and what to do next.
 */
import { z } from 'zod';
import { EVENT_TYPE_KEYS } from './event-types';
import { isHexColour } from './contrast';

const trimmed = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter an email address')
  .max(254)
  .email('Enter an email address like name@example.com');

export const mobileSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s()-]/g, ''))
  .refine((s) => s === '' || /^\+?\d{7,15}$/.test(s), 'Enter a mobile number with its country code, like +971 50 123 4567');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters')
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and hyphens only');

export const hexColourSchema = z.string().trim().refine(isHexColour, 'Enter a colour like #321EDC');

export const eventTypeSchema = z.enum(EVENT_TYPE_KEYS);

export const newEventSchema = z
  .object({
    type: eventTypeSchema,
    name: trimmed(120).min(3, 'Give the event a name'),
    slug: slugSchema,
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an end date'),
    timezone: z.string().min(1, 'Choose a timezone'),
    venue: trimmed(160).optional().default(''),
    currency: z.enum(['AED', 'KWD', 'SAR', 'QAR', 'BHD', 'OMR']).default('AED'),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'The end date must be on or after the start date' });

/**
 * A public registration. Which profile fields are required is configured per
 * event, so the server validates `answers` against the event's FormField rows
 * (see validateAnswers in the web app).
 */
export const publicRegistrationSchema = z.object({
  ticketTypeId: z.string().min(1, 'Choose a ticket').optional(),
  title: trimmed(20).optional().default(''),
  firstName: trimmed(80).min(1, 'Enter a first name'),
  lastName: trimmed(80).min(1, 'Enter a last name'),
  email: emailSchema,
  mobile: mobileSchema.optional().default(''),
  field1: trimmed(120).optional().default(''),
  field2: trimmed(160).optional().default(''),
  answers: z.record(z.string(), trimmed(500)).optional().default({}),
  consentMarketing: z.boolean().optional().default(false),
});
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;

export const scanSchema = z.object({
  sessionId: z.string().min(1),
  mode: z.enum(['in', 'out']),
  input: z.string().trim().min(1, 'Scan a badge or type an ID').max(64),
});

export const claimSchema = z.object({
  publicId: z.string().trim().regex(/^\d{1,9}$/, 'Enter the number on your badge or ticket'),
  email: emailSchema.optional(),
});

export const messageTemplateSchema = z.object({
  subject: trimmed(200).min(1, 'Add a subject line'),
  bodyHtml: z.string().max(20000).min(1, 'Write the message'),
});

export const broadcastSchema = z.object({
  audience: z.enum(['all', 'checked_in', 'not_checked_in', 'in_session_now']),
  channel: z.enum(['email', 'sms']),
  subject: trimmed(200).min(1, 'Add a subject line'),
  bodyHtml: z.string().max(20000).min(1, 'Write the message'),
});
