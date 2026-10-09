import { createHash } from 'node:crypto';
import type { FixtureObservation, SkillBehaviorObservation } from './schemas.js';

/** Stable serialization of JSON evidence; object keys use ordinal ordering. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) { return `[${value.map(canonicalJson).join(',')}]`; }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) { throw new TypeError('Evidence must contain JSON values'); }
  return serialized;
}

/** Bind the complete observation, including actor, time, suite and case evidence. */
export function fixtureObservationDigest(observation: Omit<FixtureObservation, 'evidenceDigest'> | FixtureObservation): string {
  const { evidenceDigest: _digest, ...body } = observation as FixtureObservation;
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}

export function skillBehaviorDigest(observation: Omit<SkillBehaviorObservation, 'evidenceDigest'> | SkillBehaviorObservation): string {
  const {evidenceDigest: _digest, ...body} = observation as SkillBehaviorObservation;
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}
